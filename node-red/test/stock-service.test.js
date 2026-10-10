const test = require('node:test');
const assert = require('node:assert/strict');
const stock = require('../data/lib/stock-service');
const M = require('../data/lib/line-messages');
const F = require('../data/lib/line-flex');

const ENV = { PUBLIC_BASE_URL: 'https://x.ngrok-free.dev' };
const med = (extra = {}) => ({ id: 1, user_id: 7, name: 'เมตฟอร์มิน', strength: '500 mg', unit: 'tablet', as_needed: 0, is_active: 1, remaining_qty: 6, refill_alert_days: 7, days_left: 3, alerted: 0, line_user_id: 'U1', email: 'a@example.test', ...extra });

// ---------- เกณฑ์ใกล้หมด ----------
test('isLow: ยาประจำ days_left ≤ refill_alert_days (ขอบเขต 7 วัน)', () => {
  assert.equal(stock.isLow(med({ days_left: 7, refill_alert_days: 7 })), true);
  assert.equal(stock.isLow(med({ days_left: 8, refill_alert_days: 7 })), false);
  assert.equal(stock.isLow(med({ days_left: 0 })), true);
  assert.equal(stock.isLow(med({ days_left: 3, refill_alert_days: 3 })), true);    // เกณฑ์ต่อยา ไม่ใช่ค่ากลาง
  assert.equal(stock.isLow(med({ days_left: 4, refill_alert_days: 3 })), false);
});

test('isLow: ไม่ทราบจำนวน (remaining NULL) หรือไม่มีมื้อ (days_left NULL) ไม่แจ้ง ; ยาที่หยุดแล้วไม่แจ้ง', () => {
  assert.equal(stock.isLow(med({ remaining_qty: null, days_left: null })), false);
  assert.equal(stock.isLow(med({ days_left: null })), false);
  assert.equal(stock.isLow(med({ is_active: 0, days_left: 0 })), false);
  assert.equal(stock.isLow(med({ is_active: false, days_left: 0 })), false);
});

test('isLow: ยาเมื่อมีอาการใช้ remaining_qty ≤ LOW_STOCK_QTY_PRN (ค่าเริ่มต้น 5) ไม่ดู days_left', () => {
  const prn = (q, extra = {}) => med({ as_needed: 1, days_left: null, remaining_qty: q, ...extra });
  assert.equal(stock.isLow(prn(5)), true);
  assert.equal(stock.isLow(prn(5.5)), false);
  assert.equal(stock.isLow(prn(0)), true);
  assert.equal(stock.isLow(prn(8), { LOW_STOCK_QTY_PRN: '10' }), true);
  assert.equal(stock.isLow(prn(null)), false);
});

test('prnQty / notifyAt: ค่าเริ่มต้นเมื่อไม่ตั้งหรือผิดรูปแบบ', () => {
  assert.equal(stock.prnQty({}), 5);
  assert.equal(stock.prnQty({ LOW_STOCK_QTY_PRN: 'abc' }), 5);
  assert.equal(stock.prnQty({ LOW_STOCK_QTY_PRN: '0' }), 0);
  assert.equal(stock.notifyAt({}), '09:00');
  assert.equal(stock.notifyAt({ LOW_STOCK_NOTIFY_AT: '7:5' }), '09:00');
  assert.equal(stock.notifyAt({ LOW_STOCK_NOTIFY_AT: '18:30' }), '18:30');
});

test('isDue/tick: ส่งครั้งเดียวต่อวัน หลังเวลา LOW_STOCK_NOTIFY_AT', async () => {
  const at = (h, m, d = 10) => new Date(2026, 9, d, h, m, 0);
  const state = {};
  assert.equal(stock.isDue(at(8, 59), state, {}), false);
  assert.equal(stock.isDue(at(9, 0), state, {}), true);
  const calls = [];
  const db = { async query() { calls.push('q'); return []; } };
  const client = {};
  assert.equal(await stock.tick(db, client, {}, state, at(8, 59)), null);
  assert.ok(await stock.tick(db, client, {}, state, at(9, 0)));
  assert.equal(state.day, '2026-10-10');
  assert.equal(await stock.tick(db, client, {}, state, at(9, 1)), null);    // วันเดียวกัน ไม่รันซ้ำ
  assert.ok(await stock.tick(db, client, {}, state, at(9, 0, 11)));          // วันถัดไปรันอีก
  // restart ระหว่างวัน (state ว่าง) หลังเวลา = รันได้ (ปลอดภัย เพราะจองก่อนส่ง)
  assert.ok(await stock.tick(db, client, {}, {}, at(15, 0)));
});

// ---------- ล้างค่าเมื่อพ้นเกณฑ์ ----------
test('resetRecovered: ล้าง refill_alerted_at เฉพาะยาที่พ้นเกณฑ์แล้ว', async () => {
  const updates = [];
  const q = async (sql, params) => {
    if (/^UPDATE/.test(sql)) { updates.push(params[0]); return {}; }
    return [med({ id: 1, days_left: 20, alerted: 1 }), med({ id: 2, days_left: 2, alerted: 1 }), med({ id: 3, is_active: 0, days_left: 0, alerted: 1 })];
  };
  const ids = await stock.resetRecovered(q, {});
  assert.deepEqual(ids, [1, 3]);                 // 1 = เติมจนพ้นเกณฑ์, 3 = หยุดยา ; 2 ยังใกล้หมด คงค่าไว้
  assert.deepEqual(updates, [[1, 3]]);
});

// ---------- cron ----------
function harness({ rows, quotaOk = true, pushOk = true, claimed } = {}) {
  const sent = [];
  const state = { claimedIds: [] };
  const db = {
    async query(sql) {
      if (/^UPDATE/.test(sql)) return {};
      if (/refill_alerted_at IS NOT NULL/.test(sql) && !/m\.is_active = 1 AND m\.remaining_qty/.test(sql)) return [];
      if (/FROM users WHERE id/.test(sql)) return [{ line_user_id: 'U1', email: 'a@example.test' }];
      return rows;
    },
    async withTransaction(fn) {
      return fn({ async query(sql, params) {
        if (/^SELECT id FROM medications/.test(sql)) return [(claimed || params[0]).map((id) => ({ id }))];
        state.claimedIds.push(...params[0]);
        return [{}];
      } });
    }
  };
  const client = {
    async canPush() { return { allowed: quotaOk, left: quotaOk ? 50 : 0 }; },
    async quotaStatus() { return { remaining_for_reminders: 40, reserve: 30 }; },
    async push(to, messages, meta) { sent.push({ to, messages, meta }); return { ok: pushOk }; }
  };
  return { db, client, sent, state };
}

test('run: 1 ข้อความต่อผู้ป่วย รวมยาที่เพิ่งใกล้หมด · kind=low_stock · ข้ามที่แจ้งแล้ว/ไม่ใกล้หมด/ไม่ได้เชื่อม LINE', async () => {
  const h = harness({ rows: [
    med({ id: 1, name: 'ยา A' }), med({ id: 2, name: 'ยา B', days_left: 1 }),
    med({ id: 3, name: 'ยา C', alerted: 1 }),                       // แจ้งแล้ว
    med({ id: 4, name: 'ยา D', days_left: 30 }),                     // ไม่ใกล้หมด
    med({ id: 5, user_id: 8, name: 'ยา E', line_user_id: null })     // ไม่ได้เชื่อม LINE
  ] });
  const r = await stock.run(h.db, h.client, {});
  assert.equal(r.users, 1);
  assert.equal(r.sent, 1);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].meta.kind, 'low_stock');
  assert.deepEqual(h.state.claimedIds, [1, 2]);
  const t = JSON.stringify(h.sent[0].messages[0]);
  assert.ok(t.includes('ยา A') && t.includes('ยา B') && !t.includes('ยา C') && !t.includes('ยา D'));
});

test('run: โควตาเต็ม = ไม่จอง ไม่ส่ง ; push ล้มเหลว = นับ failed แต่ไม่คืนการจอง', async () => {
  const full = harness({ rows: [med()], quotaOk: false });
  const r1 = await stock.run(full.db, full.client, {});
  assert.deepEqual([r1.sent, r1.quota_skipped, full.state.claimedIds.length], [0, 1, 0]);
  const bad = harness({ rows: [med()], pushOk: false });
  const r2 = await stock.run(bad.db, bad.client, {});
  assert.deepEqual([r2.sent, r2.failed, bad.state.claimedIds], [0, 1, [1]]);
});

test('run: อีก process จองไปก่อน (claim ได้ 0) = ไม่ส่งซ้ำ', async () => {
  const h = harness({ rows: [med()], claimed: [] });
  const r = await stock.run(h.db, h.client, {});
  assert.deepEqual([r.sent, r.claimed_by_other, h.sent.length], [0, 1, 0]);
});

test('run: ตัวกรอง REMINDER_ONLY_EMAIL_SUFFIX ถูกส่งเข้า SQL', async () => {
  let seen = null;
  const db = { async query(sql, params) { if (/LIKE/.test(sql)) seen = params; return []; } };
  await stock.run(db, {}, { REMINDER_ONLY_EMAIL_SUFFIX: '@example.test' });
  assert.deepEqual(seen, ['%@example.test']);
});

// ---------- เดโม ----------
test('notifyNow: ไม่มียาใกล้หมด = 409 NO_LOW_STOCK ; ยังไม่เชื่อม LINE = 409 ; โหมดทดสอบกรองอีเมล', async () => {
  const none = harness({ rows: [med({ days_left: 30 })] });
  assert.equal((await stock.notifyNow(none.db, none.client, 7, {}, {})).body.error, 'NO_LOW_STOCK');
  const db = { async query() { return [{ line_user_id: null, email: 'a@b.c' }]; } };
  assert.equal((await stock.notifyNow(db, {}, 7, {}, {})).body.error, 'LINE_NOT_LINKED');
  assert.equal((await stock.notifyNow(db, {}, 7, {}, { REMINDER_ONLY_EMAIL_SUFFIX: '@example.test' })).body.error, 'TEST_MODE_ONLY');
});

test('notifyNow: ส่งทันทีโดยจองเฉพาะตัวที่ยังไม่แจ้ง ; แจ้งครบแล้ว = 409 ALREADY_NOTIFIED ; force = ส่งซ้ำ resent:true ไม่จองเพิ่ม', async () => {
  const h = harness({ rows: [med({ id: 1 }), med({ id: 2, name: 'ยา B', alerted: 1 })] });
  const r = await stock.notifyNow(h.db, h.client, 7, {}, {});
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.meds, r.body.resent], [2, false]);
  assert.deepEqual(h.state.claimedIds, [1]);
  assert.match(r.body.message, /ยาใกล้หมด 2 รายการ/);

  const all = harness({ rows: [med({ alerted: 1 })] });
  const dup = await stock.notifyNow(all.db, all.client, 7, {}, {});
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error, 'ALREADY_NOTIFIED');
  assert.equal(dup.body.quota_left, 40);
  assert.equal(all.sent.length, 0);
  const forced = await stock.notifyNow(all.db, all.client, 7, { force: true }, {});
  assert.equal(forced.status, 200);
  assert.equal(forced.body.resent, true);
  assert.equal(all.state.claimedIds.length, 0);
  assert.equal(all.sent.length, 1);
});

test('notifyNow: โควตาเต็ม 429 · push ล้มเหลว 502', async () => {
  const q = harness({ rows: [med()], quotaOk: false });
  assert.equal((await stock.notifyNow(q.db, q.client, 7, {}, {})).body.error, 'LINE_QUOTA');
  const p = harness({ rows: [med()], pushOk: false });
  assert.equal((await stock.notifyNow(p.db, p.client, 7, {}, {})).body.error, 'LINE_PUSH_FAILED');
});

// ---------- Flex ----------
const flat = (n) => (n && typeof n === 'object' ? [n, ...Object.values(n).flatMap(flat)] : []);
const lowMed = (extra = {}) => ({ name: 'เมตฟอร์มิน', strength: '500 mg', unit: 'tablet', remaining_qty: 6, days_left: 3, as_needed: false, ...extra });

test('Flex ยาใกล้หมด: หัว, รายการยา (ชื่อบรรทัดเอง), เหลือ/พอใช้, ข้อความท้าย, ปุ่มเติมยาในแอป → /medications', () => {
  const m = M.buildLowStock([lowMed(), lowMed({ name: 'พาราเซตามอล', strength: null, remaining_qty: 4, days_left: null, as_needed: true }), lowMed({ name: 'ยาหมด', remaining_qty: 0, days_left: 0 })], ENV);
  const texts = flat(m.contents).filter((n) => n.type === 'text').map((n) => n.text);
  assert.ok(texts.includes('ยาใกล้หมดแล้วนะคะ'));
  assert.ok(texts.includes('เมตฟอร์มิน 500 mg'));
  assert.ok(texts.includes('เหลือ 6 เม็ด · พอใช้ 3 วัน'));
  assert.ok(texts.includes('พาราเซตามอล') && texts.includes('เหลือ 4 เม็ด'));    // ยาเมื่อมีอาการ ไม่มี "พอใช้"
  assert.ok(texts.includes('ยาหมดแล้ว'));
  assert.ok(texts.includes('อย่าลืมไปรับยา') && texts.includes('หรือซื้อเพิ่มนะคะ'));
  const btn = flat(m.contents.footer).find((n) => n.type === 'button');
  assert.equal(btn.action.label, 'เติมยาในแอป');
  assert.equal(btn.action.uri, 'https://x.ngrok-free.dev/medications');
  assert.ok(flat(m.contents.header).some((n) => n.type === 'image' && /mascot-hello\.png$/.test(n.url)));
  assert.equal(m.contents.header.backgroundColor, F.COLOR.mint);     // หัวสีปกติ ไม่ใช่เหลือง
  assert.ok(m.altText.length <= 400 && m.altText.startsWith('💊 ยาใกล้หมด 3 รายการ'));
});

test('Flex ยาใกล้หมด: เกิน 6 ตัวตัดเป็น "+ อีก n รายการ" ; หน่วยทศนิยม ; bubble ≤ 30 KB ; text/button มี scaling', () => {
  const many = Array.from({ length: 12 }, (_, i) => lowMed({ name: 'ยา' + i }));
  const m = M.buildLowStock(many, ENV);
  const texts = flat(m.contents).filter((n) => n.type === 'text').map((n) => n.text);
  assert.ok(texts.includes('+ อีก 6 รายการ'));
  assert.ok(Buffer.byteLength(JSON.stringify(m.contents)) <= F.MAX_BUBBLE_BYTES);
  for (const n of flat(m.contents)) if (n.type === 'text' || n.type === 'button') assert.equal(n.scaling, true);
  assert.ok(flat(M.buildLowStock([lowMed({ remaining_qty: 2.5 })], ENV)).some((n) => n.text === 'เหลือ 2.5 เม็ด · พอใช้ 3 วัน'));
});
