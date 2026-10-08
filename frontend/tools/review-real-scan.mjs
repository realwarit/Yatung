// เรียก Gemini จริง (รุ่น Lite ตาม .env) กับซองจำลองที่ระบุ — จำกัดจำนวนครั้งเข้มงวด: ไม่ส่งเกิน 4 ครั้ง และหยุดทันทีเมื่อไม่ใช่ 200
//   AI_MOCK=false GEMINI_NO_RETRY=true docker compose up -d --force-recreate nodered   (NO_RETRY = 1 คำขอ = 1 request ไป Gemini)
//   node tools/review-real-scan.mjs <ไฟล์ใน docs/sample-images> [...]   → พิมพ์ผล + บันทึก JSON ที่ docs/ai-real-review/ ; ลบ user ทดสอบตอนจบ
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { makeUser, dropUser } from './lib/seed.mjs';

const files = process.argv.slice(2);
if (!files.length || files.length > 4) { console.error('ระบุ 1–4 ไฟล์ (ใน docs/sample-images)'); process.exit(1); }
const root = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const out = path.join(root, 'docs', 'ai-real-review');
mkdirSync(out, { recursive: true });

const user = await makeUser('real');
try {
  let calls = 0;
  for (const f of files) {
    const img = readFileSync(path.join(root, 'docs', 'sample-images', f));
    calls++;
    const t0 = Date.now();
    const r = await fetch('http://localhost:1880/api/scan', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + user.token },
      body: JSON.stringify({ image: img.toString('base64') }),
    });
    const body = await r.json();
    const ms = Date.now() - t0;
    writeFileSync(path.join(out, f.replace(/\.\w+$/, '') + '.json'), JSON.stringify({ status: r.status, ms, body }, null, 2));
    console.log(`\n=== ${f}  HTTP ${r.status}  ${ms} ms  (request ที่ ${calls}/${files.length})`);
    if (r.status !== 200) { console.log(JSON.stringify(body)); break; }
    console.log('prescription_id', body.prescription_id, '· is_medicine_label', body.result.is_medicine_label);
    for (const m of body.result.medications) {
      console.log(`- ${m.name} ${m.strength ?? ''} | dose=${m.dose_per_time} ${m.unit} | slots=${m.slots} | meal=${m.meal_relation} | prn=${m.as_needed} | conf=${JSON.stringify(m.confidence)}`);
      console.log(`    source_text: ${JSON.stringify(m.source_text)}`);
    }
    console.log('unreadable_parts:', JSON.stringify(body.result.unreadable_parts), '· overall_note:', JSON.stringify(body.result.overall_note));
    console.log('review_flags:', JSON.stringify(body.review_flags));
    if (body.prescription_id) process.env.LAST_ID = String(body.prescription_id);
  }
} finally {
  dropUser(user);
}
