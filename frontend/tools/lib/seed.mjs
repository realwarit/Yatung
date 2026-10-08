// ตัวช่วยสร้างข้อมูลทดสอบหน้า Review: user สุ่ม + ผลสแกน draft ที่กำหนดเอง (แทรกลง DB ตรงๆ ผ่าน docker) + ลบทิ้งตอนจบ
// ใช้กับ tools/review-shots.mjs และ tools/review-e2e.mjs — ไม่เรียก Gemini เลย
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..');
const UPLOADS = path.join(ROOT, 'node-red', 'data', 'uploads');

export function sql(stmt) {
  return execFileSync('docker', ['compose', 'exec', '-T', 'db', 'sh', '-c',
    'mysql --default-character-set=utf8mb4 -N -B -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'],
  { cwd: ROOT, input: stmt, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
}
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "''");

/** สมัคร user ทดสอบผ่าน API ของ Node-RED (ตรง :1880) → { email, password, id, token } */
export async function makeUser(label = 'review') {
  const email = `test-${label}-${randomBytes(4).toString('hex')}@example.test`;
  const password = randomBytes(9).toString('hex');
  const r = await fetch('http://localhost:1880/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, display_name: 'ผู้ทดสอบ' }),
  });
  const body = await r.json();
  if (!body.token) throw new Error('สมัคร user ทดสอบไม่สำเร็จ ' + JSON.stringify(body));
  const id = Number(sql(`SELECT id FROM users WHERE email='${esc(email)}';`));
  return { email, password, id, token: body.token };
}

export function dropUser(u) {
  rmSync(path.join(UPLOADS, String(u.id)), { recursive: true, force: true });
  sql(`DELETE FROM users WHERE email='${esc(u.email)}';`);
}

/** ยา 1 ตัวตาม schema ของ AI (ค่าเริ่มต้น = อ่านได้มั่นใจ ไม่มี flag) */
export const med = (o = {}) => ({
  name: 'Metformin', strength: '500 mg', dose_per_time: 1, unit: 'tablet', slots: ['morning', 'evening'], meal_relation: 'after',
  as_needed: false, total_qty: 60, indication: 'ยาเบาหวาน', warnings: [],
  source_text: `${o.name ?? 'Metformin'} ${o.strength ?? '500 mg'}\nครั้งละ 1 เม็ด วันละ 2 ครั้ง หลังอาหาร`,
  confidence: { name: 0.97, dose: 0.95, slots: 0.95, meal_relation: 0.95 }, ...o,
});

/** แทรกผลสแกน draft → prescription id ; image = ชื่อไฟล์ใน docs/sample-images (คัดลอกไปไว้ใน uploads ของ user) */
export function insertDraft(user, { meds, image = null, text = null, isLabel = true, unreadable = [], note = null, status = 'draft' }) {
  const ocr = text ?? 'โรงพยาบาลตัวอย่าง  [HN]\n[ชื่อผู้ป่วย]\n' + meds.map((m) => m.source_text).join('\n');
  const llm = { ocr_text: ocr, is_medicine_label: isLabel, medications: meds, unreadable_parts: unreadable, overall_note: note };
  let rel = 'NULL';
  if (image) {
    mkdirSync(path.join(UPLOADS, String(user.id)), { recursive: true });
    const f = `${Date.now()}${randomBytes(2).toString('hex')}${path.extname(image)}`;
    copyFileSync(path.join(ROOT, 'docs', 'sample-images', image), path.join(UPLOADS, String(user.id), f));
    rel = `'uploads/${user.id}/${f}'`;
  }
  return Number(sql(
    `INSERT INTO prescriptions (user_id, input_type, image_path, ocr_text, llm_json, llm_model, status) VALUES ` +
    `(${user.id}, '${image ? 'image' : 'text'}', ${rel}, '${esc(ocr)}', '${esc(JSON.stringify(llm))}', 'seed', '${status}'); SELECT LAST_INSERT_ID();`));
}

/** ผลสแกนตัวอย่างหลายแบบ (ใช้ซ้ำในภาพหน้าจอและ e2e) */
export const SCENARIOS = {
  // มี flag หลายจุด: ไม่ระบุก่อน/หลังอาหาร + มั่นใจต่ำ + ไม่พบมื้อ
  flags: () => ({
    image: '3-prescription-3-items.jpg',
    unreadable: ['ขนาดยาของ PARACETAMOL เป็นช่วง 1–2 เม็ด ใช้ค่าน้อยสุด กรุณาตรวจ', 'ยาทุก 4–6 ชั่วโมง กรุณาตรวจเวลาเอง'],
    note: 'ตัวอักษรบางส่วนเบลอ',
    meds: [
      med({ name: 'PARACETAMOL', strength: '500 mg', as_needed: true, slots: [], meal_relation: 'unknown', total_qty: 20,
        indication: 'ลดไข้ แก้ปวด', source_text: 'PARACETAMOL 500 mg 1-2 tab q 4-6 hr prn',
        confidence: { name: 0.95, dose: 0.4, slots: 0.9, meal_relation: 0.45 } }),
      med({ name: 'AMLODIPINE', strength: '5 mg', dose_per_time: 0.5, slots: ['morning'], total_qty: 30, indication: 'ลดความดันโลหิต',
        warnings: ['อาจทำให้ข้อเท้าบวม'], source_text: 'AMLODIPINE 5 MG TAB\nครั้งละ ½ เม็ด วันละ 1 ครั้ง หลังอาหารเช้า',
        confidence: { name: 0.98, dose: 0.55, slots: 0.95, meal_relation: 0.95 } }),
      med({ name: 'SIMVASTATIN', strength: '20 mg', slots: [], total_qty: 30, indication: 'ลดไขมัน', source_text: 'SIMVASTATIN 20 mg 1 tab ตอนเย็น',
        confidence: { name: 0.95, dose: 0.9, slots: 0.5, meal_relation: 0.9 } }),
    ],
  }),
  // อ่านได้ครบ ไม่มี flag
  clean: () => ({ image: '1-metformin-normal.jpg', meds: [med()] }),
  // ชื่อตรงกับยาที่ผู้ใช้มีอยู่ (ต้องสร้างยา Metformin ให้ user ก่อน)
  dup: () => ({ image: '1-metformin-normal.jpg', meds: [med({ name: 'metformin', total_qty: 60 }), med({ name: 'Losartan', strength: '50 mg', slots: ['morning'], total_qty: 30, indication: 'ลดความดัน', source_text: 'Losartan 50 mg 1 tab เช้า หลังอาหาร' })] }),
  // อาจไม่ใช่ซองยา
  notlabel: () => ({ image: '4-metformin-rotated-dark.jpg', isLabel: false, note: 'รูปนี้อ่านไม่ออกว่าเป็นฉลากยา',
    meds: [med({ name: 'Metformin', confidence: { name: 0.5, dose: 0.9, slots: 0.9, meal_relation: 0.9 } })] }),
  // โหมดพิมพ์เอง (ไม่มีรูป)
  typed: () => ({ text: 'Metformin 500 mg วันละ 2 ครั้ง หลังอาหาร เช้า-เย็น', meds: [med()] }),
};
