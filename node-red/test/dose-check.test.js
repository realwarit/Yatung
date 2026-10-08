// unit test ตัวตรวจขนาดยาขัดกัน (lib/dose-check.js) + การรวมเข้า reviewFlags
//   node --test node-red/test        (ไม่ต้องใช้ docker / DB / Gemini)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { doseConflictReason, findDoses } = require('../data/lib/dose-check');
const { reviewFlags } = require('../data/lib/validate-llm-output');

const keys = (t) => findDoses(t).map((d) => d.key);

test.describe('ควรเตือน: ขนาดยาไม่ตรงกัน', () => {
  const cases = [
    ['ซอง #6: Sig อังกฤษ 1 tab กับไทย ½ เม็ด', 'AMLODIPINE 5 MG TAB\n#30 Sig: 1 tab po OD pc (AM)\nครั้งละ ½ เม็ด วันละ 1 ครั้ง หลังอาหารเช้า', 'ซองเขียนขนาดยาไว้ 2 แบบ (1 และ ½) กรุณาตรวจ'],
    ['คำว่า "ครึ่ง"', 'Take 1 tablet\nครั้งละ ครึ่งเม็ด', 'ซองเขียนขนาดยาไว้ 2 แบบ (1 และ ½) กรุณาตรวจ'],
    ['เลขไทย', 'ครั้งละ ๑ เม็ด\nSig: ๒ tab', 'ซองเขียนขนาดยาไว้ 2 แบบ (1 และ 2) กรุณาตรวจ'],
    ['ทศนิยม 1.5 กับ 1', 'Sig: 1.5 tab\nครั้งละ 1 เม็ด', 'ซองเขียนขนาดยาไว้ 2 แบบ (1½ และ 1) กรุณาตรวจ'],
    ['เศษส่วน 1/2 กับ 2', 'Sig: 1/2 tab\nครั้งละ 2 เม็ด', 'ซองเขียนขนาดยาไว้ 2 แบบ (½ และ 2) กรุณาตรวจ'],
    ['ช่วง 1–2 กับค่าเดี่ยว 1', 'Sig: 1-2 tab\nครั้งละ 1 เม็ด', 'ซองเขียนขนาดยาไว้ 2 แบบ (1–2 และ 1) กรุณาตรวจ'],
    ['ช่วงสองแบบ', 'ครั้งละ 1-2 เม็ด\nSig: 2-3 tab', 'ซองเขียนขนาดยาไว้ 2 แบบ (1–2 และ 2–3) กรุณาตรวจ'],
    ['คำความถี่ (po bid) โดยไม่มี Sig', '1 tab po bid\nครั้งละ 2 เม็ด', 'ซองเขียนขนาดยาไว้ 2 แบบ (1 และ 2) กรุณาตรวจ'],
    ['3 แบบ', 'Sig: 1 tab\nครั้งละ ½ เม็ด\nรับประทาน 2 เม็ด', 'ซองเขียนขนาดยาไว้ 3 แบบ (1, ½ และ 2) กรุณาตรวจ'],
    ['จำนวนรวมอยู่ด้วย แต่ขนาดยาขัดกัน', 'Disp: 30 tabs  Sig: 1 tab bid\nครั้งละ ½ เม็ด จำนวน 30 เม็ด', 'ซองเขียนขนาดยาไว้ 2 แบบ (1 และ ½) กรุณาตรวจ'],
    ['1 1/2 กับ 1', 'Sig: 1 1/2 tab\nครั้งละ 1 เม็ด', 'ซองเขียนขนาดยาไว้ 2 แบบ (1½ และ 1) กรุณาตรวจ'],
  ];
  for (const [name, text, reason] of cases) {
    test(name, () => assert.equal(doseConflictReason(text), reason));
  }
});

test.describe('ไม่ควรเตือน', () => {
  const same = [
    ['ค่าเดียว', 'Metformin 500 mg\nครั้งละ 1 เม็ด วันละ 2 ครั้ง'],
    ['เลขไทยกับเลขอารบิกค่าเดียวกัน', 'Sig: ๑ tab\nครั้งละ 1 เม็ด'],
    ['1.5 กับ 1½', 'Sig: 1.5 tab\nครั้งละ 1½ เม็ด'],
    ['½ กับ ครึ่ง กับ 1/2', 'Sig: ½ tab\nครั้งละ ครึ่งเม็ด\nTake 1/2 tab'],
    ['ช่วงเดียวกันสองภาษา', 'Sig: 1-2 tab prn\nครั้งละ 1–2 เม็ด'],
    ['ช่วงเดียว (หน้าที่ของ AI ตามกฎ Ambiguity ไม่ใช่ของตัวตรวจนี้)', 'PARACETAMOL 500 mg 1-2 tab q 4-6 hr prn'],
    ['"ถึง" เป็นตัวคั่นช่วง', 'ครั้งละ 1 ถึง 2 เม็ด'],
    ['ซ้ำสองบรรทัดค่าเดิม', 'ครั้งละ 1 เม็ด\nครั้งละ 1 เม็ด'],
  ];
  for (const [name, text] of same) test(name, () => assert.equal(doseConflictReason(text), null));

  const notDose = [
    ['จำนวนรวม Disp', 'Disp: 30 tabs\nSig: 1 tab bid'],
    ['#30 ติดหน้า tab', '#30 tab\nครั้งละ 1 เม็ด'],
    ['จำนวน 30 เม็ด', 'จำนวน 30 เม็ด\nครั้งละ 1 เม็ด'],
    ['x30', 'Metformin x30 tabs\nครั้งละ 1 เม็ด'],
    ['Qty: 60 เม็ด', 'Qty: 60 เม็ด\nTake 1 tablet'],
    ['จำนวนเลขไทย', 'จำนวน ๓๐ เม็ด\nครั้งละ ๑ เม็ด'],
    ['ความแรง mg', 'Metformin 500 mg 1 tab po bid'],
    ['ความถี่ วันละ 2 ครั้ง', 'ครั้งละ 1 เม็ด วันละ 2 ครั้ง ทุก 12 ชั่วโมง'],
    ['จำนวนรวมโดดๆ ไม่มีคำความถี่ตามหลัง', 'Metformin 500 mg 60 tabs'],
    ['ตัวอักษร x ในคำอื่น (box)', 'box 30 tabs\nครั้งละ 1 เม็ด'],
    ['ข้อความว่าง', ''],
    ['null', null],
  ];
  for (const [name, text] of notDose) test(name, () => assert.equal(doseConflictReason(text), null));

  test('จำนวนรวมไม่ถูกนับเป็นขนาดยา (ได้เฉพาะค่าที่เป็นวิธีกิน)', () => {
    assert.deepEqual(keys('Disp: 30 tabs\n#30 Sig: 1 tab bid\nจำนวน 60 เม็ด\nครั้งละ 1 เม็ด'), ['1']);
  });
});

test('แปลงเลขได้ถูกต้อง', () => {
  assert.deepEqual(keys('ครั้งละ ๒ เม็ด'), ['2']);
  assert.deepEqual(keys('ครั้งละ 1 1/2 เม็ด'), ['1.5']);
  assert.deepEqual(keys('ครั้งละ 1½ เม็ด'), ['1.5']);
  assert.deepEqual(keys('ครั้งละ ¼ เม็ด'), ['0.25']);
  assert.deepEqual(keys('ครั้งละ ๑–๒ เม็ด'), ['1-2']);
});

// ---------- รวมเข้ากับ reviewFlags ----------
const med = (o = {}) => ({
  name: 'X', strength: null, dose_per_time: 1, unit: 'tablet', slots: ['morning'], meal_relation: 'after', as_needed: false,
  total_qty: null, indication: null, warnings: [], source_text: 'ครั้งละ 1 เม็ด',
  confidence: { name: 0.98, dose: 0.98, slots: 0.98, meal_relation: 0.98 }, ...o,
});
const flagsOf = (...meds) => reviewFlags({ is_medicine_label: true, medications: meds });

test.describe('reviewFlags', () => {
  test('ขนาดยาขัดกัน → flag dose_per_time พร้อมเหตุผลภาษาไทย (AI ไม่เตือนเอง)', () => {
    const f = flagsOf(med({ dose_per_time: 0.5, source_text: 'Sig: 1 tab po OD\nครั้งละ ½ เม็ด' }));
    assert.deepEqual(f, [{ index: 0, field: 'dose_per_time', reason: 'ซองเขียนขนาดยาไว้ 2 แบบ (1 และ ½) กรุณาตรวจ' }]);
  });
  test('AI ก็เตือน (confidence dose ต่ำ) + server เตือน → แสดงช่อง dose ครั้งเดียว และใช้เหตุผลของ server', () => {
    const f = flagsOf(med({ source_text: 'Sig: 1 tab\nครั้งละ ½ เม็ด', confidence: { name: 0.98, dose: 0.4, slots: 0.98, meal_relation: 0.98 } }));
    const dose = f.filter((x) => x.field === 'dose' || x.field === 'dose_per_time');
    assert.equal(dose.length, 1);
    assert.match(dose[0].reason, /ซองเขียนขนาดยาไว้ 2 แบบ/);
  });
  test('flag ช่องอื่นของ AI ยังอยู่ (ไม่ถูกกลืน)', () => {
    const f = flagsOf(med({ source_text: 'Sig: 1 tab\nครั้งละ ½ เม็ด', confidence: { name: 0.98, dose: 0.4, slots: 0.5, meal_relation: 0.98 } }));
    assert.deepEqual(f.map((x) => x.field).sort(), ['dose_per_time', 'slots']);
  });
  test('ไม่ขัดกัน → ไม่มี flag เพิ่ม', () => {
    assert.deepEqual(flagsOf(med({ source_text: 'Disp: 30 tabs Sig: 1 tab bid\nครั้งละ 1 เม็ด' })), []);
  });
  test('dose = null → ยังเป็นเหตุผลเดิม "ไม่พบจำนวนต่อครั้ง"', () => {
    const f = flagsOf(med({ dose_per_time: null, source_text: 'ยาแก้ปวด' }));
    assert.equal(f[0].reason, 'ไม่พบจำนวนต่อครั้ง');
  });
  test('ยาแต่ละตัวตรวจแยกกัน (ตัวที่ 2 ขัดกัน ตัวที่ 1 ไม่)', () => {
    const f = flagsOf(med(), med({ source_text: 'Sig: 2 tab\nครั้งละ 1 เม็ด' }));
    assert.deepEqual(f.map((x) => x.index), [1]);
  });
});

test.describe('ผลจริง/ผลตัวอย่างที่เก็บไว้', () => {
  const dir = path.join(__dirname, '..', '..', 'docs', 'ai-real-review');
  const real = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')).body.result;
  const have = fs.existsSync(path.join(dir, 'before-prompt-fix'));

  test('mock-response.json ไม่มี flag', () => {
    const j = require('../data/prompts/mock-response.json');
    assert.deepEqual(reviewFlags(j), []);
  });
  test('ผลจริงของซอง #6 ก่อนแก้ prompt (AI เลือก ½ มั่นใจ 0.98 ไม่เตือน) → server เตือนได้เอง', { skip: !have }, () => {
    const f = reviewFlags(real('before-prompt-fix/yatung-test-envelope-6.json'));
    assert.equal(f.length, 1);
    assert.equal(f[0].field, 'dose_per_time');
    assert.match(f[0].reason, /\(1 และ ½\)/);
  });
  test('ผลจริงซอง #3 และ #5 ก่อนแก้ prompt → ไม่มี flag', { skip: !have }, () => {
    assert.deepEqual(reviewFlags(real('before-prompt-fix/3-prescription-3-items.json')), []);
    assert.deepEqual(reviewFlags(real('before-prompt-fix/5-prompt-injection.json')), []);
  });
});
