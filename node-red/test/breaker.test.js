// circuit breaker ของรุ่นหลัก (lib/scan-service.js) — ฟังก์ชันล้วน ไม่ต้องใช้ docker
const test = require('node:test');
const assert = require('node:assert');
const s = require('../data/lib/scan-service');

const MIN = 60 * 1000;
const OPEN = s.BREAKER_OPEN_MS, WIN = s.BREAKER_WINDOW_MS;

test('ค่าเริ่มต้น: 2 ครั้ง / 5 นาที / เปิด 10 นาที / timeout แรก 10 วินาที / งบรวม 40 วินาที', () => {
  assert.strictEqual(s.BREAKER_FAILS, 2);
  assert.strictEqual(WIN, 5 * MIN);
  assert.strictEqual(OPEN, 10 * MIN);
  assert.strictEqual(s.FIRST_TIMEOUT_MS, 10000);
  assert.strictEqual(s.TOTAL_BUDGET_MS, 40000);
});

test('ล้มเหลวครั้งเดียวยังไม่เปิด, ครั้งที่ 2 ภายใน 5 นาทีเปิด', () => {
  const b = s.newBreaker(); const t = 1e12;
  assert.strictEqual(s.breakerPlan(b, t), 'primary');
  assert.strictEqual(s.breakerRecord(b, t, false, false), null);
  assert.strictEqual(s.breakerPlan(b, t + 1000), 'primary');
  assert.strictEqual(s.breakerRecord(b, t + 60000, false, false), 'open');
  assert.strictEqual(s.breakerPlan(b, t + 61000), 'fallback');
});

test('ล้มเหลว 2 ครั้งห่างเกิน 5 นาที = ไม่เปิด (ครั้งแรกหลุดหน้าต่างเวลา)', () => {
  const b = s.newBreaker(); const t = 1e12;
  s.breakerRecord(b, t, false, false);
  assert.strictEqual(s.breakerRecord(b, t + WIN + 1, false, false), null);
  assert.strictEqual(b.openUntil, 0);
});

test('ครบเวลา: คำขอแรกเป็น probe, คำขอที่มาพร้อมกันไปรุ่นสำรอง', () => {
  const b = s.newBreaker(); const t = 1e12;
  s.breakerRecord(b, t, false, false); s.breakerRecord(b, t, false, false);
  assert.strictEqual(s.breakerPlan(b, t + OPEN - 1), 'fallback');
  assert.strictEqual(s.breakerPlan(b, t + OPEN), 'probe');
  assert.strictEqual(s.breakerPlan(b, t + OPEN + 1000), 'fallback');
});

test('probe ที่ค้างเกินงบ 40 วินาที ถูกแทนด้วย probe ใหม่', () => {
  const b = s.newBreaker(); const t = 1e12;
  s.breakerRecord(b, t, false, false); s.breakerRecord(b, t, false, false);
  assert.strictEqual(s.breakerPlan(b, t + OPEN), 'probe');
  assert.strictEqual(s.breakerPlan(b, t + OPEN + s.TOTAL_BUDGET_MS), 'probe');
});

test('probe สำเร็จ → ปิดเบรกเกอร์', () => {
  const b = s.newBreaker(); const t = 1e12;
  s.breakerRecord(b, t, false, false); s.breakerRecord(b, t, false, false);
  s.breakerPlan(b, t + OPEN);
  assert.strictEqual(s.breakerRecord(b, t + OPEN + 3000, true, true), 'close');
  assert.strictEqual(s.breakerPlan(b, t + OPEN + 4000), 'primary');
  assert.deepStrictEqual(b.failures, []);
});

test('probe ล้มเหลว → เปิดต่ออีก 10 นาที (นับจากตอนล้มเหลว)', () => {
  const b = s.newBreaker(); const t = 1e12;
  s.breakerRecord(b, t, false, false); s.breakerRecord(b, t, false, false);
  s.breakerPlan(b, t + OPEN);
  assert.strictEqual(s.breakerRecord(b, t + OPEN + 10000, false, true), 'open');
  assert.strictEqual(b.openUntil, t + OPEN + 10000 + OPEN);
  assert.strictEqual(s.breakerPlan(b, t + OPEN + 20000), 'fallback');
});

test('ผลของคำขอเก่าที่ไม่ใช่ probe ระหว่างเปิดถูกเมิน', () => {
  const b = s.newBreaker(); const t = 1e12;
  s.breakerRecord(b, t, false, false); s.breakerRecord(b, t, false, false);
  assert.strictEqual(s.breakerRecord(b, t + 1000, true, false), null);
  assert.strictEqual(s.breakerRecord(b, t + 1000, false, false), null);
  assert.strictEqual(b.openUntil, t + OPEN);
});

test('สำเร็จตอนปิดอยู่ไม่เกิดเหตุการณ์', () => {
  assert.strictEqual(s.breakerRecord(s.newBreaker(), 1e12, true, false), null);
});

test('ชนิดของความล้มเหลวที่นับ', () => {
  assert.ok(s.isBreakerFailure(undefined, true));
  assert.ok(s.isBreakerFailure(429, false));
  assert.ok(s.isBreakerFailure(503, false));
  assert.ok(s.isBreakerFailure(500, false));
  assert.ok(!s.isBreakerFailure(400, false));
  assert.ok(!s.isBreakerFailure(403, false));
  assert.ok(!s.isBreakerFailure(200, false));
});
