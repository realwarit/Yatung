/**
 * ชื่อที่มาจากบัญชี LINE มักใช้ตัวอักษรตกแต่ง (𝐑𝐱𝐭𝐜𝐡…, ｆｕｌｌ-ｗｉｄｔｈ) ที่ฟอนต์ของแอปไม่มี → เบราว์เซอร์ไปหาฟอนต์สำรองของเครื่องซึ่งอาจเป็น serif
 * NFKC แปลงเป็นตัวอักษรละตินปกติ (ที่ฟอนต์เนื้อความมี) โดยไม่เปลี่ยนภาษาไทย ; ข้อมูลใน DB ไม่ถูกแก้ แปลงเฉพาะตอนแสดง
 */
export function plainName(s: string | null | undefined): string {
  return (s ?? '').normalize('NFKC');
}

/**
 * ชื่อยาที่สแกนมาเป็นอักษรละตินตัวใหญ่ทั้งคำ (METFORMIN) → แสดงเป็น Title Case (Metformin) ; คำสั้น ≤ 3 ตัว (ORS, ASA) คงตัวใหญ่
 * แปลงเฉพาะตอนแสดง — ข้อมูลใน DB ไม่ถูกแก้ ; เสียงอ่านใช้ `speakableLatin` (ตัวเล็กทั้งคำ)
 */
export function medDisplayName(s: string | null | undefined): string {
  return (s ?? '').replace(/(?<![A-Za-z])[A-Z]{4,}(?![A-Za-z])/g, (w) => w[0] + w.slice(1).toLowerCase());
}
