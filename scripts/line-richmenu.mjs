// ตั้ง rich menu ของน้องยาตรงใน LINE: ตรวจ (validate) → ลบเมนูเดิมชื่อเดียวกัน → สร้าง → อัปโหลดรูป → ตั้งเป็นค่าเริ่มต้นของทุกคน
//   node scripts/line-richmenu.mjs [--dry-run]
// รันซ้ำได้ (ลบเมนูชื่อเดียวกันก่อนเสมอ ไม่มีเมนูซ้อน) ; rich menu ไม่เสียโควตา push
// ตัวแปร (จาก env หรือ .env): LINE_CHANNEL_ACCESS_TOKEN (จำเป็น), PUBLIC_BASE_URL (ลิงก์ปุ่มกลาง),
//   LINE_API_BASE (ค่าเริ่มต้น https://api.line.me), LINE_API_DATA_BASE (ค่าเริ่มต้น https://api-data.line.me ; ทดสอบกับ fake-line ชี้ไปที่เดียวกัน)
// --dry-run = ตรวจกับ endpoint validate แล้วหยุด (ไม่ลบ/ไม่สร้าง) ; ไม่ log token
// รูป: docs/line-richmenu/richmenu.png (สร้างด้วย cd frontend && node tools/make-line-richmenu.mjs)
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');
export const MENU_NAME = 'YaTung น้องยาตรง เมนูหลัก';

// อ่าน .env แบบง่าย (KEY=VALUE ; ไม่แทนค่า ${…} ยกเว้น ${NAME} ที่ประกาศก่อนหน้า) — ใช้เฉพาะตัวแปรที่ไม่ได้ตั้งใน env
function loadDotEnv() {
  const p = resolve(root, '.env');
  const out = {};
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].replace(/\$\{([A-Z0-9_]+)\}/g, (_, k) => out[k] ?? '');
  }
  return out;
}
const dot = loadDotEnv();
const get = (k, d = '') => (process.env[k] ?? dot[k] ?? d) || d;

const API = get('LINE_API_BASE', 'https://api.line.me').replace(/\/+$/, '');
const DATA = get('LINE_API_DATA_BASE', 'https://api-data.line.me').replace(/\/+$/, '');
const TOKEN = get('LINE_CHANNEL_ACCESS_TOKEN');
const PUBLIC = get('PUBLIC_BASE_URL').replace(/\/+$/, '');
const IMAGE = resolve(root, 'docs', 'line-richmenu', 'richmenu.png');

// 2500×843 แบ่ง 3 ช่อง (833 + 833 + 834) : ซ้าย ยาวันนี้ · กลาง เปิดแอป (มีน้องยาตรง) · ขวา วิธีใช้
export function richMenuObject(publicBase) {
  const app = /^https?:\/\//.test(publicBase) ? publicBase + '/today' : null;
  return {
    size: { width: 2500, height: 843 },
    selected: true,
    name: MENU_NAME,
    chatBarText: 'เมนูน้องยาตรง',
    areas: [
      { bounds: { x: 0, y: 0, width: 833, height: 843 }, action: { type: 'message', label: 'ยาวันนี้', text: 'วันนี้' } },
      { bounds: { x: 833, y: 0, width: 833, height: 843 }, action: app ? { type: 'uri', label: 'เปิดแอป', uri: app } : { type: 'message', label: 'เปิดแอป', text: 'วิธีใช้' } },
      { bounds: { x: 1666, y: 0, width: 834, height: 843 }, action: { type: 'message', label: 'วิธีใช้', text: 'วิธีใช้' } }
    ]
  };
}

async function call(base, method, path, { json, body, type } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: 'Bearer ' + TOKEN, ...(json ? { 'Content-Type': 'application/json' } : type ? { 'Content-Type': type } : {}) },
    body: json ? JSON.stringify(json) : body,
    signal: AbortSignal.timeout(30000)
  });
  const t = await res.text();
  let j = null;
  try { j = t ? JSON.parse(t) : null; } catch { /* ไม่ใช่ JSON */ }
  return { status: res.status, json: j, text: t };
}
const fail = (step, r) => { console.error(`✘ ${step}: HTTP ${r.status} ${r.json && r.json.message ? r.json.message : ''}${r.json && r.json.details ? ' ' + JSON.stringify(r.json.details) : ''}`); process.exit(1); };

async function main() {
  if (!TOKEN) { console.error('✘ ไม่มี LINE_CHANNEL_ACCESS_TOKEN (ตั้งใน env หรือ .env)'); process.exit(1); }
  if (!existsSync(IMAGE)) { console.error('✘ ไม่พบรูป ' + IMAGE + ' — รัน: cd frontend && node tools/make-line-richmenu.mjs'); process.exit(1); }
  const size = statSync(IMAGE).size;
  if (size > 1_000_000) { console.error('✘ รูปเกิน 1 MB'); process.exit(1); }
  const menu = richMenuObject(PUBLIC);
  console.log(`rich menu "${menu.name}" · ${menu.size.width}×${menu.size.height} · รูป ${size} bytes · ${DRY ? 'DRY-RUN' : 'ตั้งค่าจริง'} · API ${API}`);

  let r = await call(API, 'POST', '/v2/bot/richmenu/validate', { json: menu });
  if (r.status !== 200) fail('validate rich menu', r);
  console.log('✔ validate: โครงสร้างเมนูถูกต้อง');
  if (DRY) { console.log('DRY-RUN: ไม่ลบ/ไม่สร้างอะไร'); return; }

  r = await call(API, 'GET', '/v2/bot/richmenu/list');
  if (r.status !== 200) fail('ดึงรายการเมนู', r);
  const old = (r.json.richmenus || []).filter((m) => m.name === menu.name);
  for (const m of old) {
    const d = await call(API, 'DELETE', '/v2/bot/richmenu/' + encodeURIComponent(m.richMenuId));
    if (d.status !== 200) fail('ลบเมนูเดิม', d);
  }
  console.log(`✔ ลบเมนูเดิมชื่อเดียวกัน ${old.length} รายการ`);

  r = await call(API, 'POST', '/v2/bot/richmenu', { json: menu });
  if (r.status !== 200 || !r.json || !r.json.richMenuId) fail('สร้างเมนู', r);
  const id = r.json.richMenuId;
  console.log('✔ สร้างเมนูแล้ว id …' + id.slice(-6));

  r = await call(DATA, 'POST', `/v2/bot/richmenu/${encodeURIComponent(id)}/content`, { body: readFileSync(IMAGE), type: 'image/png' });
  if (r.status !== 200) fail('อัปโหลดรูป', r);
  console.log('✔ อัปโหลดรูปแล้ว');

  r = await call(API, 'POST', `/v2/bot/user/all/richmenu/${encodeURIComponent(id)}`);
  if (r.status !== 200) fail('ตั้งเป็นเมนูเริ่มต้น', r);
  console.log('✔ ตั้งเป็นเมนูเริ่มต้นของทุกคนแล้ว');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
