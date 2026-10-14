// ensureToday (catch-up) — logic ล้วนด้วย db ปลอม ; ของจริงกับ DB: bash scripts/test-catchup.sh
const test = require('node:test');
const assert = require('node:assert/strict');
const dose = require('../data/lib/dose-service');
const { GENERATE_TODAY_SQL } = require('../data/lib/medication-service');
const fs = require('node:fs');
const path = require('node:path');

const fakeDb = (script) => {
  const log = [];
  return { log, query: async (sql, params) => { log.push({ sql, params }); return script(sql, params, log); } };
};

test('มี marker ของวันนี้แล้ว → ข้าม ไม่สร้างอะไร', async () => {
  const db = fakeDb(() => ({ affectedRows: 0 }));
  const r = await dose.ensureToday(db);
  assert.deepEqual(r, { skipped: true, inserted: 0, catchup: 0 });
  assert.equal(db.log.length, 1);
  assert.match(db.log[0].sql, /INSERT IGNORE INTO daily_generation/);
});

test('ยังไม่มี marker → จอง marker ก่อน แล้วสร้างแบบ catch-up', async () => {
  const db = fakeDb((sql) => /^INSERT IGNORE INTO daily_generation/.test(sql) ? { affectedRows: 1 }
    : /^INSERT IGNORE INTO dose_logs/.test(sql) ? { affectedRows: 6 } : /^SELECT COUNT/.test(sql) ? [{ n: 4 }] : { affectedRows: 1 });
  const r = await dose.ensureToday(db);
  assert.deepEqual(r, { skipped: false, inserted: 6, catchup: 4 });
  assert.match(db.log[1].sql, /reminded_at, catchup/);
  assert.match(db.log[1].sql, /m\.created_at < CURDATE\(\)/);
});

test('สร้างล้มเหลว → ปล่อย marker ให้รอบถัดไปลองใหม่ และโยน error ต่อ', async () => {
  const db = fakeDb((sql) => {
    if (/^INSERT IGNORE INTO daily_generation/.test(sql)) return { affectedRows: 1 };
    if (/^INSERT IGNORE INTO dose_logs/.test(sql)) throw new Error('boom');
    return { affectedRows: 1 };
  });
  await assert.rejects(() => dose.ensureToday(db), /boom/);
  assert.match(db.log[db.log.length - 1].sql, /^DELETE FROM daily_generation/);
});

test('cron 00:05 (generateToday) เขียน marker และใช้ SQL เดิม (ไม่ catch-up)', async () => {
  const db = fakeDb(() => ({ affectedRows: 7 }));
  const r = await dose.generateToday(db);
  assert.deepEqual(r, { inserted: 7 });
  assert.equal(db.log[0].sql, GENERATE_TODAY_SQL(false, false));
  assert.doesNotMatch(db.log[0].sql, /catchup/);
  assert.match(db.log[1].sql, /daily_generation/);
});

test('SQL โหมด catch-up: ติด catchup เฉพาะรอบที่เวลานัด ≤ NOW() และใช้เฉพาะยาที่สร้างก่อนวันนี้', () => {
  const sql = GENERATE_TODAY_SQL(false, false, true);
  assert.match(sql, /IF\(TIMESTAMP\(CURDATE\(\), t\.slot_time\) <= NOW\(\), 1, 0\)/);
  assert.match(sql, /NOT EXISTS/);
  assert.doesNotMatch(GENERATE_TODAY_SQL(true, true), /catchup|created_at/);   // POST/PUT/resume ไม่เปลี่ยน
});

test('ทุกที่ที่ส่ง LINE/Push เรื่องรอบยาปกติข้ามแถว catchup', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '../data/lib', f), 'utf8');
  const rem = read('reminder-service.js');
  assert.equal((rem.match(/d\.catchup = 0/g) || []).length, 2, 'เตือนปกติ + เตือนซ้ำ');
  assert.match(read('escalation-service.js'), /d\.catchup = 0/);
});

test('flows.json: มี inject ตอนเริ่ม + cron :07 ใน tab 6 และไม่มี id ซ้ำ', () => {
  const flows = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/flows.json'), 'utf8'));
  const ids = flows.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length);
  const start = flows.find((n) => n.id === 'sch_ens_start');
  assert.ok(start.once && start.onceDelay === 10);
  const cron = flows.find((n) => n.id === 'sch_ens_cron');
  assert.equal(cron.options[0].expression, '0 7 * * * * *');
  const grp = flows.find((n) => n.id === 'sch_ens_grp');
  for (const n of ['sch_ens_start', 'sch_ens_cron', 'sch_ens_fn', 'sch_ens_dbg']) assert.ok(grp.nodes.includes(n) && flows.find((x) => x.id === n).g === 'sch_ens_grp');
  assert.ok(flows.find((n) => n.id === 'sch_cron'), 'cron 00:05 เดิมยังอยู่');
});
