// ป้ายภาษาไทยฝั่ง backend — ต้องตรงกับ frontend/src/app/core/i18n/labels.ts (ใช้ใน LINE reply / Flex)
const SLOT_LABEL = { morning: 'เช้า', noon: 'กลางวัน', evening: 'เย็น', bedtime: 'ก่อนนอน' };
const MEAL_LABEL = { before: 'ก่อนอาหาร', after: 'หลังอาหาร', with: 'พร้อมอาหาร', any: 'ไม่เกี่ยวกับอาหาร', unknown: '' };
const UNIT_LABEL = {
  tablet: 'เม็ด', capsule: 'แคปซูล', ml: 'มล.', teaspoon: 'ช้อนชา', tablespoon: 'ช้อนโต๊ะ',
  sachet: 'ซอง', drop: 'หยด', puff: 'พ่น', other: 'อื่นๆ'
};

// 0.5 → '½', 1.5 → '1½', 2 → '2'
function doseText(n) {
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 100) / 100;
  if (frac === 0) return String(whole);
  const f = frac === 0.5 ? '½' : frac === 0.25 ? '¼' : frac === 0.75 ? '¾' : String(frac).slice(1);
  return whole === 0 ? f : `${whole}${f}`;
}
const unitInDose = (u) => (u === 'other' ? 'หน่วย' : UNIT_LABEL[u] || 'หน่วย');

module.exports = { SLOT_LABEL, MEAL_LABEL, UNIT_LABEL, doseText, unitInDose };
