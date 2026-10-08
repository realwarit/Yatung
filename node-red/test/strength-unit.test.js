// unit test แปลงหน่วยความแรงยาเป็นรูปมาตรฐาน (lib/validate-llm-output.js → normalizeStrength)
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeStrength: n } = require('../data/lib/validate-llm-output');

test.describe('แปลงเป็นหน่วยมาตรฐาน', () => {
  const cases = [
    ['20 มก.', '20 mg'], ['20 มก', '20 mg'], ['20มก.', '20mg'], ['  20   มก. ', '20 mg'], ['500 มิลลิกรัม', '500 mg'],
    ['5 มล.', '5 ml'], ['5 มล', '5 ml'], ['5 ซีซี', '5 ml'], ['5 cc', '5 ml'], ['5 CC', '5 ml'], ['10 มิลลิลิตร', '10 ml'],
    ['100 ไมโครกรัม', '100 mcg'], ['100 มคก.', '100 mcg'], ['100 MCG', '100 mcg'],
    ['1 กรัม', '1 g'], ['1 G', '1 g'], ['500 MG', '500 mg'], ['500 Mg', '500 mg'], ['500mg', '500mg'],
    ['125 มก./5 มล.', '125 mg/5 ml'], ['250 mg/5 mL', '250 mg/5 ml'],
  ];
  for (const [input, want] of cases) test(`${input} → ${want}`, () => assert.equal(n(input), want));
});

test.describe('ไม่แตะ', () => {
  for (const s of ['500 IU', '1.5%', '10 units', 'ยาน้ำ มลพิษ']) test(s, () => assert.equal(n(s), s));
  test('null / undefined', () => { assert.equal(n(null), null); assert.equal(n(undefined), undefined); });
});
