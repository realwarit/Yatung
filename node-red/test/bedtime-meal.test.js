// unit test กฎ "ก่อนนอน ≠ ก่อนอาหาร" (lib/validate-llm-output.js → bedtimeMealReason + reviewFlags)
//   node --test node-red/test
const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewFlags, bedtimeMealReason } = require('../data/lib/validate-llm-output');

const REASON = "ซองเขียน 'ก่อนนอน' ไม่ได้ระบุก่อนอาหาร กรุณาตรวจ";
const med = (o = {}) => ({
  name: 'X', strength: null, dose_per_time: 1, unit: 'tablet', slots: ['bedtime'], meal_relation: 'before', as_needed: false,
  total_qty: null, indication: null, warnings: [], source_text: 'ครั้งละ 1 เม็ด ก่อนนอน',
  confidence: { name: 0.98, dose: 0.98, slots: 0.98, meal_relation: 0.98 }, ...o,
});
const flagsOf = (m) => reviewFlags({ is_medicine_label: true, medications: [m] });

test.describe('ควรเตือน', () => {
  const cases = [
    ['ก่อนนอนอย่างเดียว', 'Simvastatin 20 mg\nครั้งละ 1 เม็ด ก่อนนอน'],
    ['มีช่องว่างคั่น "ก่อน นอน"', 'ครั้งละ 1 เม็ด ก่อน นอน'],
    ['ก่อนนอน + หลังอาหาร (ไม่ใช่ก่อนอาหาร)', 'หลังอาหารเย็น และก่อนนอน'],
    ['ภาษาอังกฤษ hs ไม่ใช่ ac', 'Sig: 1 tab po hs\nก่อนนอน'],
    ['ac เป็นส่วนของคำอื่น (acid)', 'Folic acid 5 mg\nก่อนนอน'],
  ];
  for (const [name, text] of cases) {
    test(name, () => {
      assert.equal(bedtimeMealReason(med({ source_text: text })), REASON);
      assert.deepEqual(flagsOf(med({ source_text: text })), [{ index: 0, field: 'meal_relation', reason: REASON }]);
    });
  }
});

test.describe('ไม่ควรเตือน', () => {
  const cases = [
    ['ก่อนอาหารเช้า และก่อนนอน', 'ก่อนอาหารเช้า และก่อนนอน'],
    ['ก่อนอาหาร 30 นาที และ ก่อนนอน', 'ก่อนอาหาร 30 นาที\nก่อนนอน'],
    ['ก่อน อาหาร (เว้นวรรค)', 'ก่อน อาหาร และก่อนนอน'],
    ['รูปย่อ ac', 'Sig: 1 tab ac\nก่อนนอน'],
    ['ac ติดวงเล็บ (ac)', 'Sig: 1 tab po bid (ac)\nก่อนนอน'],
    ['before meals', 'take 1 tab before meals, and ก่อนนอน'],
    ['ไม่มีคำว่าก่อนนอน เลย (ก่อนอาหารปกติ)', 'ครั้งละ 1 เม็ด ก่อนอาหาร'],
    ['ไม่มีทั้งคู่', 'ครั้งละ 1 เม็ด'],
    ['source_text ว่าง/null', null],
  ];
  for (const [name, text] of cases) {
    test(name, () => {
      assert.equal(bedtimeMealReason(med({ source_text: text })), null);
      assert.deepEqual(flagsOf(med({ source_text: text })), []);
    });
  }
  test('meal_relation = any (ถูกต้องอยู่แล้ว)', () => {
    assert.deepEqual(flagsOf(med({ meal_relation: 'any' })), []);
  });
  test('meal_relation = after → ไม่แตะ (กฎนี้ดูเฉพาะ before)', () => {
    assert.equal(bedtimeMealReason(med({ meal_relation: 'after' })), null);
  });
});

test('เตือนอย่างเดียว ไม่แก้ค่า meal_relation', () => {
  const data = { is_medicine_label: true, medications: [med()] };
  reviewFlags(data);
  assert.equal(data.medications[0].meal_relation, 'before');
});

test('AI มั่นใจต่ำช่อง meal_relation ด้วย → แสดงช่องเดียว ใช้เหตุผลของ server', () => {
  const f = flagsOf(med({ confidence: { name: 0.98, dose: 0.98, slots: 0.98, meal_relation: 0.4 } }));
  assert.equal(f.length, 1);
  assert.equal(f[0].reason, REASON);
});
