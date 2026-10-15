// POST /api/doses/take-many (8D D2): ตรวจ ids + กติกาเจ้าของ/กดซ้ำ/หักยาครั้งเดียว ด้วย DB จำลองในหน่วยความจำ (ไม่ใช้ docker)
const test = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../data/lib/dose-service');

// ---- DB จำลอง: รู้จักเฉพาะ SQL ที่ takeInTx / takeMany ใช้ ----
function fakeDb(doses, meds) {
  const calls = { updatesDose: [], updatesMed: [], commits: 0, rollbacks: 0 };
  const snap = (id) => { const d = doses.get(id); return { id, status: d.status, taken_at: d.taken_at, source: d.source, remaining_qty: meds.get(d.med).remaining_qty }; };
  const conn = {
    async query(sql, params = []) {
      if (sql.includes('FOR UPDATE')) {
        const [id, uid] = params; const d = doses.get(id);
        if (!d || d.user !== uid) return [[]];
        const m = meds.get(d.med);
        return [[{ id, status: d.status, taken_at: d.taken_at, escalated_at: null, med_id: d.med, dose_per_time: m.dose_per_time, remaining_qty: m.remaining_qty, total_qty: m.total_qty, secs_since_taken: 0 }]];
      }
      if (sql.startsWith("UPDATE dose_logs SET status = 'taken'")) {
        const [source, id] = params; const d = doses.get(id);
        d.status = 'taken'; d.taken_at = '2026-10-13 12:00:00'; d.source = source; calls.updatesDose.push(id); return [{}];
      }
      if (sql.startsWith('UPDATE medications SET remaining_qty = GREATEST')) {
        const [qty, medId] = params; const m = meds.get(medId); m.remaining_qty = Math.max(m.remaining_qty - qty, 0); calls.updatesMed.push(medId); return [{}];
      }
      if (sql.startsWith('SELECT d.id, d.status, d.taken_at, d.source, m.remaining_qty')) return [[snap(params[0])]];
      if (sql.includes('FROM dose_logs WHERE id IN')) return [[params[0].map((id) => ({ id, slot: 'morning', at: '08:05', source: doses.get(id).source }))]];
      if (sql.includes("DATE_FORMAT(NOW(), '%H:%i')")) return [[{ t: '12:00' }]];
      throw new Error('SQL ที่ DB จำลองไม่รู้จัก: ' + sql.slice(0, 60));
    },
  };
  return {
    calls,
    async withTransaction(fn) {
      const snapshotDoses = JSON.stringify([...doses]); const snapshotMeds = JSON.stringify([...meds]);
      try { const r = await fn(conn); calls.commits++; return r; }
      catch (e) { calls.rollbacks++; doses.clear(); JSON.parse(snapshotDoses).forEach(([k, v]) => doses.set(k, v)); meds.clear(); JSON.parse(snapshotMeds).forEach(([k, v]) => meds.set(k, v)); throw e; }
    },
  };
}
function world() {
  const meds = new Map([[1, { dose_per_time: 1, remaining_qty: 10, total_qty: 30 }], [2, { dose_per_time: 2, remaining_qty: 1, total_qty: 30 }], [3, { dose_per_time: 1, remaining_qty: null, total_qty: null }]]);
  const doses = new Map([
    [11, { user: 1, med: 1, status: 'pending', taken_at: null, source: null }],
    [12, { user: 1, med: 2, status: 'missed', taken_at: null, source: null }],
    [13, { user: 1, med: 3, status: 'pending', taken_at: null, source: null }],
    [14, { user: 1, med: 1, status: 'taken', taken_at: '2026-10-13 08:05:00', source: 'line' }],
    [21, { user: 2, med: 1, status: 'pending', taken_at: null, source: null }],
  ]);
  return { meds, doses, db: fakeDb(doses, meds) };
}

test('parseTakeManyIds: ผิดรูปแบบทุกแบบ = 400 VALIDATION ข้อความไทย', () => {
  const bad = [undefined, null, {}, { ids: 5 }, { ids: [] }, { ids: ['1'] }, { ids: [0] }, { ids: [-3] }, { ids: [1.5] }, { ids: [null] }, { ids: [Number.MAX_SAFE_INTEGER + 2] },
    { ids: Array.from({ length: 51 }, (_, i) => i + 1) }];
  for (const b of bad) {
    const r = svc.parseTakeManyIds(b);
    assert.equal(r.error.status, 400, JSON.stringify(b)?.slice(0, 40));
    assert.equal(r.error.body.error, 'VALIDATION');
    assert.match(r.error.body.details, /[ก-๙]/);
  }
});

test('parseTakeManyIds: 50 รายการพอดีผ่าน และ dedupe', () => {
  assert.equal(svc.parseTakeManyIds({ ids: Array.from({ length: 50 }, (_, i) => i + 1) }).ids.length, 50);
  assert.deepEqual(svc.parseTakeManyIds({ ids: [3, 3, 4, 3] }).ids, [3, 4]);
});

test('ของตัวเองทั้งหมด → taken ทุกตัว หักยาถูก (missed กินย้อนหลังได้ ; remaining_qty NULL ไม่แตะ ; ไม่ต่ำกว่า 0) source=app', async () => {
  const { db, meds, doses } = world();
  const r = await svc.takeManyForApp(db, 1, { ids: [11, 12, 13] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { taken: [11, 12, 13], already: [], skipped: 0, at: '12:00' });
  assert.equal(meds.get(1).remaining_qty, 9);
  assert.equal(meds.get(2).remaining_qty, 0);        // 1 − 2 → clamp ที่ 0
  assert.equal(meds.get(3).remaining_qty, null);
  for (const id of [11, 12, 13]) { assert.equal(doses.get(id).status, 'taken'); assert.equal(doses.get(id).source, 'app'); }
  assert.equal(db.calls.commits, 1);
});

test('กดซ้ำ = already ไม่หักยาซ้ำ ; ซ้ำกันใน ids ครั้งเดียว นับครั้งเดียว', async () => {
  const { db, meds } = world();
  const a = await svc.takeManyForApp(db, 1, { ids: [11, 11, 11] });
  assert.deepEqual(a.body.taken, [11]);
  assert.equal(meds.get(1).remaining_qty, 9);
  const b = await svc.takeManyForApp(db, 1, { ids: [11, 13] });
  assert.equal(b.status, 200);
  assert.deepEqual(b.body.taken, [13]); assert.deepEqual(b.body.already, [11]);
  assert.equal(meds.get(1).remaining_qty, 9);          // ไม่หักซ้ำ
});

test('dose ที่กินแล้วมาก่อน (เช่นจาก LINE) = already ไม่เปลี่ยน source/ไม่หักยา', async () => {
  const { db, meds, doses } = world();
  const r = await svc.takeManyForApp(db, 1, { ids: [14] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.already, [14]); assert.deepEqual(r.body.taken, []);
  assert.equal(doses.get(14).source, 'line');
  assert.equal(meds.get(1).remaining_qty, 10);
});

test('ผสมของตัวเอง + ของคนอื่น = 200 ข้ามของคนอื่นเงียบ ๆ (skipped) ไม่แตะของคนอื่น', async () => {
  const { db, doses } = world();
  const r = await svc.takeManyForApp(db, 1, { ids: [11, 21, 9999] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.taken, [11]); assert.equal(r.body.skipped, 2);
  assert.equal(doses.get(21).status, 'pending');
});

test('ไม่มี id ไหนเป็นของผู้ใช้เลย = 404 NOT_FOUND (ไม่เผยว่าของใคร)', async () => {
  const { db, doses } = world();
  const r = await svc.takeManyForApp(db, 1, { ids: [21, 9999] });
  assert.equal(r.status, 404); assert.equal(r.body.error, 'NOT_FOUND');
  assert.equal(doses.get(21).status, 'pending');
});

test('hook ปิดเรื่องญาติเรียกครั้งเดียว เฉพาะ id ที่กินสำเร็จ หลัง COMMIT', async () => {
  const { db } = world();
  const got = [];
  svc.setAfterTaken((ids) => { got.push(ids); });
  try {
    await svc.takeManyForApp(db, 1, { ids: [11, 12, 14, 21] });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(got, [[11, 12]]);
  } finally { svc.setAfterTaken(null); }
});

test('ids ผิดรูปแบบไม่แตะ DB', async () => {
  const { db } = world();
  const r = await svc.takeManyForApp(db, 1, { ids: 'x' });
  assert.equal(r.status, 400);
  assert.equal(db.calls.commits, 0);
});
