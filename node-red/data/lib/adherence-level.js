// ข้อความ/ท่าน้องยาตรงตามระดับอัตราการกินยา (pure) — ใช้ร่วมกับ LINE ; ฝั่งเว็บอยู่ที่ frontend/src/app/features/overview/adherence-level.ts
// ตารางทั้งสองฝั่งต้องตรงกัน (เทสเทียบกันที่ node-red/test/stats-service.test.js กับ adherence-level.spec.ts)
// ห้ามใช้คำตำหนิ
// ฝั่ง LINE ผู้ใช้เชื่อม LINE แล้วเสมอ → ระดับต่ำ (< 50) ใช้ "พรุ่งนี้ลองใหม่นะคะ" ; เว็บใช้ข้อความนี้เมื่อเชื่อมแล้ว และ "ให้น้องยาตรงช่วยเตือนใน LINE นะคะ" เมื่อยังไม่เชื่อม
function levelOf(rate) {
  if (rate === null || rate === undefined) return { key: 'none', pose: 'hello', text: 'ยังไม่มีข้อมูลยาในช่วงนี้ค่ะ' };
  if (rate >= 100) return { key: 'perfect', pose: 'cheer', text: 'เยี่ยมมากค่ะ กินครบทุกมื้อเลย' };
  if (rate >= 80) return { key: 'good', pose: 'cheer', text: 'เก่งมากค่ะ' };
  if (rate >= 50) return { key: 'ok', pose: 'hello', text: 'ค่อยๆ เพิ่มขึ้นได้นะคะ' };
  return { key: 'low', pose: 'hello', text: 'พรุ่งนี้ลองใหม่นะคะ' };
}
module.exports = { levelOf };
