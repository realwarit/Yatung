// ตรวจ bundle ที่ build แล้ว (dist) ว่าไม่มีคำต้องห้ามในข้อความที่ผู้ใช้เห็น : cd frontend && ng build && node tools/wording-bundle-check.mjs
// ถอด \uXXXX ก่อนตรวจ (ข้อความไทยใน bundle บางไฟล์ถูกเข้ารหัสแบบนี้) · มีตัวควบคุมบวกกันตรวจผ่านเพราะไม่ได้อ่านอะไร
import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN = /ป่วย|ผู้ดูแล|ญาติ|คนไข้|ผู้สูงอายุ|คนแก่|ลูกหลาน/;
const unescape = (s) => s
  .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const find = (s) => FORBIDDEN.exec(unescape(s))?.[0] ?? null;

// ตัวควบคุมบวก : ต้องจับได้ทั้งแบบปกติและแบบเข้ารหัส และไม่จับคำปกติ
const control = [['ญาติ', 'ญาติ'], ['\\u0e1c\\u0e39\\u0e49\\u0e14\\u0e39\\u0e41\\u0e25', 'ผู้ดูแล'], ['\\u0e0d\\u0e32\\u0e15\\u0e34', 'ญาติ'], ['คนที่ห่วงใย', null]];
for (const [s, want] of control) if (find(s) !== want) { console.error('✘ ตัวควบคุมบวกล้มเหลว:', s); process.exit(2); }

// ข้อยกเว้นเดียว (ส่วนที่ 3 / 3.1 ข้อ 4): อนุญาตเฉพาะสตริง `[ชื่อผู้ป่วย]` ใน chunk ที่มาจาก features/review/review.model.ts
// เพราะเป็น token ที่พรอมต์ Gemini ใช้ปิดชื่อ แล้วหน้า Review แทนเป็น [ชื่อ] ตอนแสดง ; คำต้องห้ามอื่นใน chunk เดียวกันยังถูกตรวจ
const SERVER_TOKEN = '[ชื่อผู้ป่วย]';
if (!FORBIDDEN.test(SERVER_TOKEN)) { console.error('✘ ตัวควบคุม: token ต้องเป็นคำต้องห้ามเอง (ไม่งั้นข้อยกเว้นไม่มีความหมาย)'); process.exit(2); }

if (find('x' + SERVER_TOKEN.split('[ชื่อ').join('') + 'ผู้ดูแล') !== 'ผู้ดูแล' && find('ผู้ดูแล') !== 'ผู้ดูแล') { console.error('✘ ตัวควบคุม: คำอื่นต้องยังถูกจับ'); process.exit(2); }
const dist = path.resolve(process.argv[2] ?? 'dist/frontend/browser');
if (!fs.existsSync(dist)) { console.error('ไม่พบ', dist, '(ต้อง ng build ก่อน)'); process.exit(2); }
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : /\.(js|html|webmanifest|json)$/.test(e.name) && files.push(p); } })(dist);

// ตัวควบคุมบวกที่สอง : ต้องเจอข้อความไทยที่ควรมีใน bundle จริงอย่างน้อยหนึ่งที่ (กันสแกนได้ไฟล์ว่าง) — "คนที่ห่วงใย" ต้องปรากฏ
let sawNew = false; let sawTok = false; const hits = [];
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  if (unescape(t).includes('คนที่ห่วงใย')) sawNew = true;
  if (/ngsw\.json$/.test(f)) continue;   // hash ล้วน
  if (unescape(t).includes(SERVER_TOKEN)) { sawTok = true; console.log('ข้อยกเว้น token ใช้ใน ' + path.relative(dist, f)); }
  const u = unescape(t).split(SERVER_TOKEN).join(''); const m = FORBIDDEN.exec(u);
  if (m) hits.push(`${path.relative(dist, f)}: ${m[0]} …${JSON.stringify(u.slice(Math.max(0, m.index - 40), m.index + 30))}`);
}
console.log(`สแกน ${files.length} ไฟล์ใน ${dist}`);
if (!sawTok) { console.error('✘ ไม่เจอ token ที่อนุญาตใน bundle เลย — ข้อยกเว้นไม่ตรงกับโค้ดจริง'); process.exit(2); }
if (!sawNew) { console.error('✘ ไม่เจอ "คนที่ห่วงใย" ใน bundle เลย — build เก่าหรือสแกนผิดที่'); process.exit(2); }
if (hits.length) { console.error('✘ เจอคำต้องห้าม:\n' + hits.join('\n')); process.exit(1); }
console.log('✓ ไม่มีคำต้องห้ามใน bundle · เจอข้อความใหม่ "คนที่ห่วงใย" ตามคาด');
