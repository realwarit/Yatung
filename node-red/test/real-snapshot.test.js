// กฎ 3 ระดับของ scripts/lib/real-snapshot-classify.mjs : ✔ ไม่เปลี่ยน / ⓘ cron จริง (ปกติ) / ✘ ที่เหลือ — ข้อมูลสมมติล้วน ไม่แตะ DB
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let mod;
test.before(async () => { mod = await import(pathToFileURL(path.join(__dirname, '..', '..', 'scripts', 'lib', 'real-snapshot-classify.mjs')).href); });

const tsv = (...rows) => rows.map((r) => r.join('\t')).join('\n');
const snap = (o = {}) => ({
  doses: tsv(['1', 'pending', '-', '-', '-', '-', '-'], ['2', 'taken', '2026-10-13 08:00:01', '2026-10-13 08:05:00', '-', '-', 'app']),
  notifs: tsv(['10', 'reminder', 'line_push', '2026-10-13 08:00:02']),
  push: tsv(['78', '0', '2026-10-13 08:00:03', '5', '1']),
  meds: tsv(['7', '-']),
  esc: '0',
  ...o,
});

test('ไม่เปลี่ยนเลย → ไม่มี info ไม่มี bad', () => {
  const r = mod.classify(snap(), snap());
  assert.equal(r.infoTotal, 0);
  assert.deepEqual(r.bad, []);
});

test('ⓘ reminded_at ว่าง→มีค่า ตรงรอบ cron', () => {
  const after = snap({ doses: tsv(['1', 'pending', '2026-10-13 16:00:01', '-', '-', '-', '-'], ['2', 'taken', '2026-10-13 08:00:01', '2026-10-13 08:05:00', '-', '-', 'app']) });
  const r = mod.classify(snap(), after);
  assert.equal(r.info.dose, 1);
  assert.deepEqual(r.bad, []);
});

test('✘ reminded_at เปลี่ยนตอนวินาทีไม่ตรงรอบ cron (เช่น กดเอง)', () => {
  const after = snap({ doses: tsv(['1', 'pending', '2026-10-13 16:00:47', '-', '-', '-', '-'], ['2', 'taken', '2026-10-13 08:00:01', '2026-10-13 08:05:00', '-', '-', 'app']) });
  const r = mod.classify(snap(), after);
  assert.equal(r.info.dose, 0);
  assert.equal(r.bad.length, 1);
});

test('✘ status / taken_at / source / escalated_at / followup_at เปลี่ยน (แม้ reminded_at เปลี่ยนด้วย)', () => {
  const cases = [
    tsv(['1', 'taken', '-', '2026-10-13 16:00:01', '-', '-', 'line'], ['2', 'taken', '2026-10-13 08:00:01', '2026-10-13 08:05:00', '-', '-', 'app']),
    tsv(['1', 'pending', '2026-10-13 16:00:01', '-', '2026-10-13 16:30:01', '-', '-'], ['2', 'taken', '2026-10-13 08:00:01', '2026-10-13 08:05:00', '-', '-', 'app']),
    tsv(['1', 'pending', '-', '-', '-', '2026-10-13 16:30:01', '-'], ['2', 'taken', '2026-10-13 08:00:01', '2026-10-13 08:05:00', '-', '-', 'app']),
    tsv(['1', 'pending', '-', '-', '-', '-', '-'], ['2', 'taken', '2026-10-13 08:00:01', '2026-10-13 08:05:00', '-', '-', 'caregiver']),
  ];
  for (const doses of cases) assert.equal(mod.classify(snap(), snap({ doses })).bad.length, 1, doses);
});

test('✘ reminded_at ที่มีค่าอยู่แล้วถูกเปลี่ยน / dose หาย', () => {
  assert.equal(mod.classify(snap(), snap({ doses: tsv(['1', 'pending', '-', '-', '-', '-', '-'], ['2', 'taken', '2026-10-13 09:00:01', '2026-10-13 08:05:00', '-', '-', 'app']) })).bad.length, 1);
  assert.equal(mod.classify(snap(), snap({ doses: tsv(['1', 'pending', '-', '-', '-', '-', '-']) })).bad.length, 1);
});

test('ⓘ notification ใหม่ reminder/escalation ตรงรอบ cron (นับแยกชนิด)', () => {
  const after = snap({ notifs: tsv(['10', 'reminder', 'line_push', '2026-10-13 08:00:02'], ['11', 'reminder', 'web_push', '2026-10-13 16:00:02'], ['12', 'escalation', 'line_push', '2026-10-13 16:30:05']) });
  const r = mod.classify(snap(), after);
  assert.equal(r.info.notification, 2);
  assert.deepEqual(r.info.kinds, { reminder: 1, escalation: 1 });
  assert.deepEqual(r.bad, []);
});

test('✘ notification ใหม่ชนิดอื่น (low_stock/other/link) หรือไม่ตรงรอบ cron หรือแถวหาย', () => {
  for (const row of [['11', 'low_stock', 'line_push', '2026-10-13 09:00:02'], ['11', 'other', 'web_push', '2026-10-13 16:00:02'], ['11', 'reminder', 'line_push', '2026-10-13 16:00:55']]) {
    assert.equal(mod.classify(snap(), snap({ notifs: tsv(['10', 'reminder', 'line_push', '2026-10-13 08:00:02'], row) })).bad.length, 1, row.join());
  }
  assert.equal(mod.classify(snap(), snap({ notifs: '' })).bad.length, 1);
});

test('ⓘ push last_success_at เพิ่ม (ตรงรอบ cron) และ ✘ เมื่อ fail_count/notify_both/เครื่อง เปลี่ยนหรือเวลาย้อนหลัง', () => {
  const ok = mod.classify(snap(), snap({ push: tsv(['78', '0', '2026-10-13 16:00:01', '5', '1']) }));
  assert.equal(ok.info.push, 1);
  assert.deepEqual(ok.bad, []);
  for (const push of [
    tsv(['78', '1', '2026-10-13 16:00:01', '5', '1']),   // fail_count
    tsv(['78', '0', '2026-10-13 16:00:01', '5', '0']),   // notify_both
    tsv(['78', '0', '2026-10-13 07:00:01', '5', '1']),   // เวลาย้อนหลัง
    tsv(['78', '0', '2026-10-13 08:00:03', '5', '1'], ['79', '0', '-', '5', '1']),   // เครื่องใหม่
    '',                                                    // เครื่องหาย
  ]) assert.equal(mod.classify(snap(), snap({ push })).bad.length, 1, push);
});

test('✘ ยา (refill_alerted_at) และจำนวน dose_escalations เปลี่ยน', () => {
  assert.equal(mod.classify(snap(), snap({ meds: tsv(['7', '2026-10-13 09:00:01']) })).bad.length, 1);
  assert.equal(mod.classify(snap(), snap({ esc: '1' })).bad.length, 1);
});

test('ปนกัน: นับ ⓘ และ ✘ แยกระดับ', () => {
  const after = snap({
    doses: tsv(['1', 'pending', '2026-10-13 16:00:01', '-', '-', '-', '-'], ['2', 'missed', '2026-10-13 08:00:01', '-', '-', '-', '-']),
    notifs: tsv(['10', 'reminder', 'line_push', '2026-10-13 08:00:02'], ['11', 'reminder', 'line_push', '2026-10-13 16:00:02']),
  });
  const r = mod.classify(snap(), after);
  assert.equal(r.infoTotal, 2);
  assert.equal(r.bad.length, 1);
  assert.match(mod.describeInfo(r.info), /reminded_at 1 แถว · notification_logs ใหม่ 1 แถว \(reminder 1\)/);
});
