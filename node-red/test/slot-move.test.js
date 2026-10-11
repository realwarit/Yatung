const test = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../data/lib/medication-service');

// กฎ "ยา 1 ตัว ไม่เกิน 1 dose ต่อ (มื้อ, วัน)" — ย้ายรอบเมื่อเปลี่ยนเวลามื้อ + ตัวสร้างรอบรายวัน
const TIMES = { morning: '08:00', noon: '12:00', evening: '16:00', bedtime: '21:00' };
const NOW = '2026-10-11 15:55:00';
const dose = (id, slot, hhmm, status = 'pending', med = 1) => ({ id, medication_id: med, slot, status, scheduled_at: `2026-10-11 ${hhmm}:00` });

test('ย้าย pending ที่ยังไม่เตือน/เตือนแล้ว ไปเวลาใหม่ (ไม่สร้างแถวใหม่) ; เวลาใหม่ > now ล้าง reminded_at', () => {
  const m = svc.planSlotMoves([dose(1, 'evening', '15:50')], TIMES, NOW);
  assert.deepEqual(m, [{ id: 1, to: '2026-10-11 16:00:00', clear: true }]);   // เตือนที่ 15:50 แล้ว → เวลาใหม่ยังไม่ถึง → เตือนใหม่ 1 ครั้ง
});

test('เวลาใหม่ <= now → คง reminded_at (clear=false) ไม่เตือนซ้ำ', () => {
  const m = svc.planSlotMoves([dose(1, 'evening', '16:30')], { ...TIMES, evening: '15:00' }, NOW);
  assert.deepEqual(m, [{ id: 1, to: '2026-10-11 15:00:00', clear: false }]);
  assert.equal(svc.planSlotMoves([dose(1, 'evening', '16:30')], { ...TIMES, evening: '15:55' }, NOW)[0].clear, false);   // เท่ากับ now = ถึงเวลาแล้ว
});

test('เวลาไม่เปลี่ยน → ไม่ย้าย ไม่ล้าง reminded_at (บันทึกเวลาซ้ำไม่ทำให้เตือนซ้ำ)', () => {
  assert.deepEqual(svc.planSlotMoves([dose(1, 'evening', '16:00')], TIMES, NOW), []);
});

test('taken/missed ไม่ถูกย้าย และมื้อที่มี taken แล้วไม่ย้ายรอบอื่นเข้ามา', () => {
  assert.deepEqual(svc.planSlotMoves([dose(1, 'evening', '15:50', 'taken')], TIMES, NOW), []);
  assert.deepEqual(svc.planSlotMoves([dose(1, 'evening', '15:50', 'missed')], TIMES, NOW), []);
  // ข้อมูลเก่าที่ซ้ำ (taken + pending ในมื้อเดียว) → ไม่แตะ ปล่อยให้สคริปต์ล้างข้อมูลจัดการ
  assert.deepEqual(svc.planSlotMoves([dose(1, 'evening', '15:50', 'taken'), dose(2, 'evening', '16:00')], TIMES, NOW), []);
  assert.deepEqual(svc.planSlotMoves([dose(1, 'evening', '15:50'), dose(2, 'evening', '15:51')], TIMES, NOW), []);
});

test('ยาหลายตัว/หลายมื้อ ย้ายแยกกัน ; มื้อที่ taken ของยาหนึ่งไม่กระทบยาอื่น', () => {
  const rows = [dose(1, 'morning', '07:00', 'pending', 1), dose(2, 'evening', '15:50', 'taken', 1), dose(3, 'evening', '15:50', 'pending', 2)];
  const m = svc.planSlotMoves(rows, TIMES, NOW);
  assert.deepEqual(m.map((x) => x.id), [1, 3]);
});

test('เปลี่ยนเวลา 2 ครั้งติดกัน → ยัง 1 dose ต่อมื้อ (จำลองฐานข้อมูลในหน่วยความจำ)', async () => {
  // conn จำลอง: เก็บแถว dose ในอาร์เรย์ ตรวจ UNIQUE(medication_id, slot, วัน) เหมือน DB จริง
  const rows = [{ id: 1, medication_id: 1, slot: 'evening', status: 'pending', scheduled_at: '2026-10-11 15:50:00', reminded_at: '2026-10-11 15:50:00', followup_at: null }];
  const conn = {
    async query(sql, params) {
      if (/^SELECT id, medication_id/.test(sql)) return [rows.map((r) => ({ ...r, now_ts: NOW }))];
      if (/INTERVAL 100 YEAR/.test(sql)) { rows.filter((r) => params[0].includes(r.id)).forEach((r) => { r.scheduled_at = '2126' + r.scheduled_at.slice(4); }); return [{}]; }
      if (/^UPDATE dose_logs SET scheduled_at = \?/.test(sql)) {
        const r = rows.find((x) => x.id === params[1]); r.scheduled_at = params[0];
        if (/reminded_at = NULL/.test(sql)) { r.reminded_at = null; r.followup_at = null; }
        return [{}];
      }
      throw new Error('unexpected ' + sql);
    }
  };
  const move = (t) => { const fn = svc._moveTodayDoses; return fn(conn, 7, { ...TIMES, evening: t }); };
  await move('16:00');
  assert.equal(rows.length, 1); assert.equal(rows[0].scheduled_at, '2026-10-11 16:00:00'); assert.equal(rows[0].reminded_at, null);
  rows[0].reminded_at = '2026-10-11 16:00:00';   // สมมติเตือนไปแล้ว
  await move('16:10');
  assert.equal(rows.length, 1); assert.equal(rows[0].scheduled_at, '2026-10-11 16:10:00');
  assert.equal(rows[0].reminded_at, null);       // 16:10 > now → เตือนใหม่ที่เวลาใหม่
});

test('GENERATE_TODAY_SQL: ไม่สร้างรอบถ้ามื้อนั้นของวันนี้มีแถวอยู่แล้ว (สถานะอะไรก็ตาม)', () => {
  for (const [by, fut] of [[false, false], [true, true], [true, false]]) {
    const q = svc.GENERATE_TODAY_SQL(by, fut);
    assert.match(q, /NOT EXISTS \(SELECT 1 FROM dose_logs x WHERE x\.medication_id = m\.id AND x\.slot = s\.slot AND DATE\(x\.scheduled_at\) = CURDATE\(\)\)/);
  }
});

test('planDuplicates: เก็บ taken ก่อน ไม่มี → เก็บตัวใหม่กว่า ; taken ซ้ำไม่ลบ', async () => {
  const { planDuplicates } = await import('../../scripts/lib/dup-doses.mjs');
  const r = (id, status, at, extra = {}) => ({ id, medication_id: 5, slot: 'evening', scheduled_at: `2026-10-11 ${at}:00`, status, taken_at: status === 'taken' ? `2026-10-11 ${at}:30` : null, ...extra });
  let p = planDuplicates([r(1, 'pending', '15:50'), r(2, 'taken', '16:00')]);
  assert.equal(p.length, 1); assert.equal(p[0].keep.id, 2); assert.deepEqual(p[0].remove.map((x) => x.id), [1]);
  p = planDuplicates([r(1, 'pending', '15:50'), r(2, 'pending', '16:00')]);
  assert.equal(p[0].keep.id, 2); assert.deepEqual(p[0].remove.map((x) => x.id), [1]);
  p = planDuplicates([r(1, 'taken', '15:50'), r(2, 'taken', '16:00')]);
  assert.equal(p[0].keep.id, 1); assert.deepEqual(p[0].remove, []); assert.deepEqual(p[0].manual.map((x) => x.id), [2]);
  assert.deepEqual(planDuplicates([r(1, 'pending', '15:50'), { ...r(2, 'pending', '16:00'), slot: 'noon' }]), []);   // คนละมื้อ ไม่ใช่ซ้ำ
});
