// validate-medication: tts_name (ชื่อที่ให้อ่านออกเสียง, 8B)
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateMedication } = require('../data/lib/validate-medication');

const base = { name: 'Amlodipine', dose_per_time: 1, unit: 'tablet', meal_relation: 'after', as_needed: false, slots: ['morning'] };
const ok = (extra) => validateMedication({ ...base, ...extra });

test('ไม่ส่ง tts_name = undefined (PUT คงค่าเดิม)', () => {
  const r = ok({});
  assert.equal(r.ok, true);
  assert.equal(r.value.tts_name, undefined);
});

test('trim และคืนค่า', () => {
  assert.equal(ok({ tts_name: '  ยาความดัน ' }).value.tts_name, 'ยาความดัน');
});

test("'' / ช่องว่าง / null → null (ล้างค่า)", () => {
  assert.equal(ok({ tts_name: '' }).value.tts_name, null);
  assert.equal(ok({ tts_name: '   ' }).value.tts_name, null);
  assert.equal(ok({ tts_name: null }).value.tts_name, null);
});

test('100 ตัวอักษรผ่าน · 101 ไม่ผ่าน (400) พร้อมข้อความขึ้นต้นที่ frontend จับได้', () => {
  assert.equal(ok({ tts_name: 'ก'.repeat(100) }).ok, true);
  const r = ok({ tts_name: 'ก'.repeat(101) });
  assert.equal(r.ok, false);
  assert.match(r.details, /^ชื่อที่ให้อ่านออกเสียง/);
});

test('ไม่ใช่ข้อความ → ไม่ผ่าน', () => {
  assert.equal(ok({ tts_name: 5 }).ok, false);
  assert.equal(ok({ tts_name: ['x'] }).ok, false);
});
