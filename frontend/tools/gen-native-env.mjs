// สร้าง src/environments/environment.native.ts จาก API_BASE_URL ใน ../.env (หรือ env ของระบบ)
// ไฟล์ปลายทางถูก git-ignore — ห้าม commit (มีโดเมนของเซิร์ฟเวอร์) · สคริปต์นี้ไม่พิมพ์ค่าโดเมนออกจอ
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '..', '.env');
const outPath = resolve(root, 'src/environments/environment.native.ts');

/** อ่าน .env แบบเดียวกับ Compose: KEY=VALUE, # คอมเมนต์, ตัดเครื่องหมายคำพูด, แทน ${VAR} จากตัวแปรที่ประกาศก่อนหน้า */
export function parseEnv(text) {
  const vars = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    vars[m[1]] = v.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, k) => vars[k] ?? '');
  }
  return vars;
}

/** ตรวจค่า: ต้องเป็น https://host[:port] ไม่มี path/query และไม่มี / ท้าย — คืน {value} หรือ {error} */
export function checkApiBase(v) {
  const s = (v ?? '').trim();
  if (!s) return { error: 'ไม่พบ API_BASE_URL' };
  let u;
  try { u = new URL(s); } catch { return { error: 'API_BASE_URL ไม่ใช่ URL ที่ถูกต้อง (ถ้ามี ${NGROK_DOMAIN} ให้ตรวจว่าประกาศ NGROK_DOMAIN ไว้ก่อนบรรทัดนี้)' }; }
  if (u.protocol !== 'https:') return { error: 'API_BASE_URL ต้องขึ้นต้นด้วย https:// (แอปไม่เปิด cleartext)' };
  if (!u.hostname.includes('.')) return { error: 'API_BASE_URL ต้องมีชื่อโดเมน เช่น https://ชื่อ.ngrok-free.dev' };
  if (u.pathname !== '/' || u.search || u.hash) return { error: 'API_BASE_URL ต้องเป็นโดเมนล้วน ไม่มี path/query' };
  return { value: u.origin };
}

export function render(apiBase) {
  return `// สร้างโดย tools/gen-native-env.mjs — ห้ามแก้เอง/ห้าม commit (git-ignored)\nexport const environment = { native: true, apiBase: ${JSON.stringify(apiBase)} };\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const fromFile = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};
  const ngrok = process.env.NGROK_DOMAIN || fromFile.NGROK_DOMAIN;
  // ไม่มี API_BASE_URL → ใช้ https://<NGROK_DOMAIN> (ค่าเดียวกับที่ .env.example ตั้งไว้)
  const r = checkApiBase(process.env.API_BASE_URL || fromFile.API_BASE_URL || (ngrok ? `https://${ngrok}` : ''));
  if (r.error) {
    console.error(`✘ ${r.error}`);
    console.error('  วิธีแก้: เปิด .env ที่รากโปรเจกต์ แล้วเพิ่มบรรทัดนี้ "ต่อจาก" NGROK_DOMAIN :');
    console.error('    API_BASE_URL=https://${NGROK_DOMAIN}');
    process.exit(1);
  }
  writeFileSync(outPath, render(r.value));
  console.log('✓ สร้าง src/environments/environment.native.ts แล้ว (git-ignored · ไม่แสดงโดเมนในล็อก)');
}
