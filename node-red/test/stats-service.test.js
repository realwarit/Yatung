const test = require('node:test');
const assert = require('node:assert');
const S = require('../data/lib/stats-service');
const { levelOf } = require('../data/lib/adherence-level');

const NOW = new Date('2026-10-12T07:30:00Z');   // 14:30 น. ไทย วันจันทร์ 12 ต.ค. 2026
const row = (date, extra = {}) => ({ date, slot: 'morning', medication_id: 1, source: null, taken: 0, missed: 0, pending_due: 0, upcoming: 0, ...extra });
const daily = (date, taken, missed, pending_due = 0, upcoming = 0) => ({ date, taken, missed, pending_due, upcoming });
const build = (o) => S.buildReport({ rowsDetail: [], rowsDaily: [], meds: [], now: NOW, days: 7, ...o });

test('rateOf: ปัดเป็นจำนวนเต็ม และ due=0 เป็น null (ไม่ใช่ 0 หรือ 100)', () => {
  assert.strictEqual(S.rateOf(0, 0), null);
  assert.strictEqual(S.rateOf(6, 7), 86);
  assert.strictEqual(S.rateOf(1, 3), 33);
  assert.strictEqual(S.rateOf(2, 3), 67);
  assert.strictEqual(S.rateOf(0, 4), 0);
  assert.strictEqual(S.rateOf(5, 5), 100);
});

test('เวลาไทย: bangkokParts ไม่พึ่ง TZ ของ process และข้ามวันที่ 17:00Z', () => {
  assert.deepStrictEqual(S.bangkokParts(new Date('2026-10-12T16:59:59Z')).today, '2026-10-12');
  assert.deepStrictEqual(S.bangkokParts(new Date('2026-10-12T17:00:00Z')).today, '2026-10-13');   // 00:00 น. ไทย
  assert.strictEqual(S.bangkokParts(new Date('2026-10-12T17:30:00Z')).nowStr, '2026-10-13 00:30:00');
  assert.strictEqual(S.bangkokParts(new Date('2026-10-12T16:30:00Z')).nowStr, '2026-10-12 23:30:00');
  assert.strictEqual(S.addDays('2026-10-01', -1), '2026-09-30');
  assert.strictEqual(S.addDays('2026-12-31', 1), '2027-01-01');
});

test('ขอบเที่ยงคืน: 23:30 กับ 00:30 เป็นคนละวัน ช่วง 7 วันเลื่อนตาม', () => {
  const a = build({ now: new Date('2026-10-12T16:30:00Z') });
  const b = build({ now: new Date('2026-10-12T17:30:00Z') });
  assert.deepStrictEqual([a.range.from, a.range.to], ['2026-10-06', '2026-10-12']);
  assert.deepStrictEqual([b.range.from, b.range.to], ['2026-10-07', '2026-10-13']);
  assert.strictEqual(b.days.at(-1).is_today, true);
  assert.strictEqual(a.days.at(-1).date, '2026-10-12');
});

test('labelTh: วันย่อ + วันที่ + เดือนย่อ', () => {
  assert.strictEqual(S.labelTh('2026-10-12'), 'จ. 12 ต.ค.');
  assert.strictEqual(S.labelTh('2026-10-11'), 'อา. 11 ต.ค.');
  assert.strictEqual(S.labelTh('2026-10-15'), 'พฤ. 15 ต.ค.');
  assert.strictEqual(S.labelTh('2026-01-01'), 'พฤ. 1 ม.ค.');
});

test('parseDays: ค่าเริ่มต้น 7, ช่วง 7–30, อย่างอื่น error', () => {
  assert.strictEqual(S.parseDays(undefined).days, 7);
  assert.strictEqual(S.parseDays('').days, 7);
  assert.strictEqual(S.parseDays('30').days, 30);
  for (const bad of ['6', '31', '0', '-7', '7.5', 'abc', '7,8', ['7', '8'], '1e1', ' ', '٧']) assert.ok(S.parseDays(bad).error, String(bad));
});

test('days[]: ครบทุกวันเก่า→ใหม่ แม้ไม่มียา (rate null) และนับตามนิยาม', () => {
  const r = build({ rowsDaily: [daily('2026-10-12', 2, 0, 1, 1), daily('2026-10-10', 1, 1)] });
  assert.strictEqual(r.days.length, 7);
  assert.deepStrictEqual(r.days.map((d) => d.date), ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12']);
  const empty = r.days[0];
  assert.deepStrictEqual([empty.due, empty.rate, empty.taken], [0, null, 0]);
  const t = r.days.at(-1);
  assert.deepStrictEqual([t.taken, t.missed, t.pending_due, t.upcoming, t.due, t.rate, t.is_today], [2, 0, 1, 1, 3, 67, true]);
  assert.strictEqual(r.days[4].rate, 50);
  // overall = ผลรวม ไม่ใช่เฉลี่ย rate รายวัน
  assert.deepStrictEqual(r.overall, { taken: 3, missed: 1, pending_due: 1, due: 5, rate: 60 });
});

test('upcoming ไม่นับใน due/rate ; ไม่มี due เลย overall.rate = null', () => {
  const r = build({ rowsDaily: [daily('2026-10-12', 0, 0, 0, 3)] });
  assert.deepStrictEqual([r.overall.due, r.overall.rate], [0, null]);
});

test('streak: ข้ามวันที่ไม่มียา ไม่ตัด, หยุดเมื่อวันไม่ครบ', () => {
  // เมื่อวาน(11) ไม่มียา ข้าม · 10 ครบ · 9 ไม่มียา · 8 ครบ · 7 ไม่ครบ → หยุด = 2
  const r = build({ rowsDaily: [daily('2026-10-10', 3, 0), daily('2026-10-08', 2, 0), daily('2026-10-07', 2, 1)] });
  assert.strictEqual(r.streak_days, 2);
});
test('streak: วันนี้นับเมื่อกินครบและไม่มี upcoming เท่านั้น', () => {
  const base = [daily('2026-10-11', 2, 0), daily('2026-10-10', 2, 0)];
  assert.strictEqual(build({ rowsDaily: [...base, daily('2026-10-12', 2, 0, 0, 0)] }).streak_days, 3);
  assert.strictEqual(build({ rowsDaily: [...base, daily('2026-10-12', 2, 0, 0, 1)] }).streak_days, 2);   // ยังมีรอบรอเวลา
  assert.strictEqual(build({ rowsDaily: [...base, daily('2026-10-12', 1, 0, 1, 0)] }).streak_days, 2);   // วันนี้ยังไม่ครบ ไม่ตัด streak
  assert.strictEqual(build({ rowsDaily: [daily('2026-10-12', 0, 0, 0, 2)] }).streak_days, 0);
});
test('streak: ไม่มีข้อมูลเลย = 0 ; ย้อนไม่เกิน 60 วัน', () => {
  assert.strictEqual(build({}).streak_days, 0);
  const all = [];
  for (let i = 1; i <= 70; i++) all.push(daily(S.addDays('2026-10-12', -i), 1, 0));
  assert.strictEqual(build({ rowsDaily: all }).streak_days, 60);
});

test('by_meal: เรียงเช้า→ก่อนนอน เฉพาะมื้อที่มี due และใช้ป้ายไทยตัวเดียวกับ labels-th', () => {
  const r = build({ rowsDetail: [
    row('2026-10-12', { slot: 'evening', taken: 1, missed: 1 }), row('2026-10-11', { slot: 'evening', taken: 2 }),
    row('2026-10-12', { slot: 'morning', taken: 3 }), row('2026-10-12', { slot: 'bedtime', upcoming: 2 })] });
  assert.deepStrictEqual(r.by_meal, [
    { meal: 'morning', label_th: 'เช้า', due: 3, taken: 3, rate: 100 },
    { meal: 'evening', label_th: 'เย็น', due: 4, taken: 3, rate: 75 }]);
});

test('by_medication: rate น้อย→มาก, null ท้ายสุด, ยาที่หยุดแล้วยังอยู่พร้อม is_active=false', () => {
  const meds = [{ id: 1, name: 'ก', strength: '5 mg', is_active: 1 }, { id: 2, name: 'ข', strength: null, is_active: 0 }, { id: 3, name: 'ค', strength: null, is_active: 1 }];
  const r = build({ meds, rowsDetail: [
    row('2026-10-12', { medication_id: 1, taken: 3, missed: 1 }), row('2026-10-12', { medication_id: 2, taken: 1, missed: 3 }),
    row('2026-10-12', { medication_id: 3, upcoming: 2 })] });
  assert.deepStrictEqual(r.by_medication.map((m) => [m.medication_id, m.rate, m.is_active]), [[2, 25, false], [1, 75, true], [3, null, true]]);
  assert.strictEqual(r.by_medication[1].strength, '5 mg');
});

test('by_source: คืนทุกคีย์ (0 ถ้าไม่มี) · source แปลก/NULL ไปที่ other ไม่ error · นับเฉพาะ taken', () => {
  const r = build({ rowsDetail: [
    row('2026-10-12', { source: 'app', taken: 2 }), row('2026-10-12', { source: 'line', taken: 1, missed: 5 }),
    row('2026-10-12', { source: 'whatsapp', taken: 4 }), row('2026-10-12', { source: null, taken: 1 })] });
  assert.deepStrictEqual(r.by_source, { app: 2, push: 0, line: 1, caregiver: 0, other: 5 });
  assert.deepStrictEqual(build({}).by_source, { app: 0, push: 0, line: 0, caregiver: 0, other: 0 });
});

test('response ไม่มี prn_taken และมี generated_at เวลาไทย', () => {
  const r = build({});
  assert.ok(!('prn_taken' in r));
  assert.strictEqual(r.generated_at, '2026-10-12T14:30:00+07:00');
  assert.deepStrictEqual(Object.keys(r), ['range', 'overall', 'days', 'by_meal', 'by_medication', 'by_source', 'streak_days', 'generated_at']);
});

test('SQL ไม่ใช้ NOW()/CURDATE() และไม่กรอง is_active ; กรอง as_needed และ user_id', () => {
  for (const sql of [S.DETAIL_SQL, S.DAILY_SQL]) {
    assert.ok(!/NOW\s*\(|CURDATE\s*\(|CURRENT_/i.test(sql), sql);
    assert.ok(!/is_active/i.test(sql));
    assert.ok(/m\.as_needed = 0/.test(sql) && /d\.user_id = \?/.test(sql));
    assert.ok(/GROUP BY/.test(sql));
  }
});

test('adherence(): 400 ภาษาไทยเมื่อ days ผิด ไม่แตะ DB ; ส่งพารามิเตอร์เวลาไทยเข้า SQL', async () => {
  const calls = [];
  const db = { query: async (sql, p) => { calls.push([sql, p]); return []; } };
  const bad = await S.adherence(db, 5, '99', NOW);
  assert.strictEqual(bad.status, 400);
  assert.strictEqual(bad.body.error, 'VALIDATION');
  assert.ok(/7/.test(bad.body.details) && /30/.test(bad.body.details));
  assert.strictEqual(calls.length, 0);
  const ok = await S.adherence(db, 5, '7', new Date('2026-10-12T17:30:00Z'));
  assert.strictEqual(ok.status, 200);
  assert.deepStrictEqual(calls[0][1], ['2026-10-13 00:30:00', '2026-10-13 00:30:00', 5, '2026-10-07', '2026-10-13']);
  assert.deepStrictEqual(calls[1][1], ['2026-10-13 00:30:00', '2026-10-13 00:30:00', 5, '2026-08-14', '2026-10-13']);
});

test('adherence-level: ตารางข้อความ 5 ระดับ ไม่มีคำตำหนิ', () => {
  assert.deepStrictEqual([100, 99, 80, 79, 50, 49, 0, null].map((r) => levelOf(r).key), ['perfect', 'good', 'good', 'ok', 'ok', 'low', 'low', 'none']);
  assert.strictEqual(levelOf(100).text, 'เยี่ยมมากค่ะ กินครบทุกมื้อเลย');
  assert.strictEqual(levelOf(85).pose, 'cheer');
  assert.strictEqual(levelOf(30).text, 'ให้น้องยาตรงช่วยเตือนใน LINE นะคะ');
  for (const r of [100, 90, 60, 10, null]) assert.ok(!/(ลืม|แย่|ไม่ดี|ผิด)/.test(levelOf(r).text));
});
