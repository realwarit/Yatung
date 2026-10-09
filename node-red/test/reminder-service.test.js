const test = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../data/lib/reminder-service');

// DB ปลอมในหน่วยความจำ: dose_logs + transaction ที่ล็อกเป็นคิว (จำลอง SELECT … FOR UPDATE ของ InnoDB)
function makeDb(rows) {
  const table = rows.map((r) => ({ reminded: false, status: 'pending', ...r }));
  let chain = Promise.resolve();
  const db = {
    table,
    async query(sql) {
      if (sql === svc.DUE_SQL) {
        return table.filter((r) => r.status === 'pending' && !r.reminded && r.due).map((r) => ({
          id: r.id, user_id: r.user_id, slot: r.slot, scheduled_at: r.scheduled_at, was_reminded: 0,
          name: r.name, strength: r.strength || null, dose_per_time: 1, unit: 'tablet', meal_relation: 'after', line_user_id: 'U' + r.user_id
        }));
      }
      throw new Error('unexpected sql ' + sql.slice(0, 40));
    },
    withTransaction(fn) {
      const run = chain.then(() => fn({
        query: async (sql, params) => {
          if (/FOR UPDATE/.test(sql)) return [table.filter((r) => params[0].includes(r.id) && r.status === 'pending' && !r.reminded).map((r) => ({ id: r.id }))];
          if (/SET reminded_at/.test(sql)) { table.filter((r) => params[0].includes(r.id) && !r.reminded).forEach((r) => { r.reminded = true; }); return [{}]; }
          throw new Error('unexpected tx sql');
        }
      }));
      chain = run.catch(() => {});
      return run;
    }
  };
  return db;
}
const fakeClient = (opts = {}) => {
  const pushes = [];
  return {
    pushes,
    canPush: async () => ({ allowed: opts.allowed !== false, left: 5, status: { remaining_for_reminders: 5 } }),
    push: async (to, messages, meta) => { pushes.push({ to, messages, meta }); await new Promise((r) => setTimeout(r, 5)); return { ok: opts.fail ? false : true, status: opts.fail ? 500 : 200 }; }
  };
};
const row = (id, user, time, name, extra = {}) => ({ id, user_id: user, slot: 'morning', scheduled_at: '2026-10-09 ' + time + ':00', name, due: true, ...extra });
const ENV = { PUBLIC_BASE_URL: 'https://x.ngrok-free.dev' };

test('3 ยาในมื้อเดียวกัน → 1 push (1 ข้อความ 3 รายการ) + จอง reminded_at ครบ', async () => {
  const db = makeDb([row(1, 7, '08:00', 'A'), row(2, 7, '08:00', 'B'), row(3, 7, '08:00', 'C')]);
  const c = fakeClient();
  const r = await svc.run(db, c, ENV);
  assert.equal(c.pushes.length, 1);
  assert.equal(r.groups, 1);
  assert.equal(r.sent, 1);
  assert.equal(c.pushes[0].messages.length, 1);
  assert.equal(c.pushes[0].meta.kind, 'reminder');
  assert.equal(c.pushes[0].meta.userId, 7);
  assert.equal(c.pushes[0].messages[0].altText, '⏰ ถึงเวลากินยามื้อเช้าแล้ว (3 รายการ)');
  assert.ok(db.table.every((d) => d.reminded));
});
test('คนละ user / คนละเวลา → แยกข้อความ', async () => {
  const db = makeDb([row(1, 7, '08:00', 'A'), row(2, 8, '08:00', 'B'), row(3, 7, '12:00', 'C', { slot: 'noon' })]);
  const c = fakeClient();
  await svc.run(db, c, ENV);
  assert.equal(c.pushes.length, 3);
});
test('run() 2 รอบพร้อมกัน (Promise.all) → ได้ 1 push', async () => {
  const db = makeDb([row(1, 7, '08:00', 'A'), row(2, 7, '08:00', 'B')]);
  const c = fakeClient();
  const [a, b] = await Promise.all([svc.run(db, c, ENV), svc.run(db, c, ENV)]);
  assert.equal(c.pushes.length, 1);
  assert.equal(a.sent + b.sent, 1);
  assert.equal(a.claimed_by_other + b.claimed_by_other, 1);
});
test('รันซ้ำหลังส่งแล้ว → ไม่ส่งซ้ำ', async () => {
  const db = makeDb([row(1, 7, '08:00', 'A')]);
  const c = fakeClient();
  await svc.run(db, c, ENV);
  await svc.run(db, c, ENV);
  assert.equal(c.pushes.length, 1);
});
test('push ล้มเหลว → นับ failed แต่ reminded_at ไม่ถูกคืนค่า (ไม่ส่งซ้ำรัวๆ)', async () => {
  const db = makeDb([row(1, 7, '08:00', 'A')]);
  const c = fakeClient({ fail: true });
  const r = await svc.run(db, c, ENV);
  assert.equal(r.failed, 1);
  assert.equal(db.table[0].reminded, true);
  await svc.run(db, c, ENV);
  assert.equal(c.pushes.length, 1);
});
test('โควตาเต็ม → ไม่ส่ง และไม่จอง reminded_at (ลองใหม่ได้ภายในหน้าต่าง 30 นาที)', async () => {
  const db = makeDb([row(1, 7, '08:00', 'A')]);
  const c = fakeClient({ allowed: false });
  const r = await svc.run(db, c, ENV);
  assert.equal(r.quota_skipped, 1);
  assert.equal(c.pushes.length, 0);
  assert.equal(db.table[0].reminded, false);
});
test('groupRows จัดกลุ่มตาม (user, scheduled_at) ตามลำดับเดิม', () => {
  const g = svc.groupRows([
    { id: 1, user_id: 1, scheduled_at: 'a', slot: 'morning', name: 'x', line_user_id: 'U1' },
    { id: 2, user_id: 1, scheduled_at: 'a', slot: 'morning', name: 'y', line_user_id: 'U1' },
    { id: 3, user_id: 2, scheduled_at: 'a', slot: 'morning', name: 'z', line_user_id: 'U2' }]);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].doses.map((d) => d.id), [1, 2]);
});
test('SQL เลือก dose: เงื่อนไขครบตามแผน', () => {
  const s = svc.DUE_SQL;
  for (const frag of ["d.status = 'pending'", 'd.reminded_at IS NULL', 'd.scheduled_at <= NOW()', 'INTERVAL 30 MINUTE', 'm.is_active = 1', 'm.as_needed = 0', 'u.line_user_id IS NOT NULL']) assert.ok(s.includes(frag), frag);
});
