// ตรวจไฟล์ต้องห้าม + รูปแบบความลับ — ใช้โดย scripts/check-secrets.mjs (pre-commit / pre-push / demo-check) ; รายงานเฉพาะ ชนิด/ไฟล์/บรรทัด ห้ามพิมพ์ค่า
export const FORBIDDEN_FILE = /(^|\/)\.env$|(^|\/)flows_cred\.json$|(^|\/)\.sessions\.json$|\.backup$|(^|\/)\.config\.[^/]+\.json$|\.pem$/;

// ค่าตัวอย่าง/ว่างที่ไม่ถือเป็นความลับ
const PLACEHOLDER = /^(|change-?me.*|your[-_].*|xxx+|example.*|test.*|secret|password|demo.*|\$\{.*|<.*|\.\.\.|fake.*|dummy.*|placeholder.*|\*+)$/i;

// bcrypt ที่อนุญาต = hash ของ demo1234 (รหัสเดโมสาธารณะ) ในไฟล์เหล่านี้เท่านั้น ; ที่อื่นต้องไม่มี hash ใดๆ
export const BCRYPT_ALLOWED_FILES = new Set(['db/init/02_seed.sql', '.env.example', 'node-red/data/lib/admin-auth.js']);

export const RULES = [
  ['LINE channel secret', /LINE_CHANNEL_SECRET\s*[=:]\s*['"]?([0-9a-f]{32})\b/i],
  ['LINE access token', /LINE_CHANNEL_ACCESS_TOKEN\s*[=:]\s*['"]?([A-Za-z0-9+/=_-]{60,})/],
  ['ngrok authtoken', /NGROK_AUTHTOKEN\s*[=:]\s*['"]?([A-Za-z0-9_]{20,})/],
  ['ngrok authtoken (รูปแบบ)', /\b(2[A-Za-z0-9]{20,}_[A-Za-z0-9]{15,})\b/],
  ['Gemini/Google API key', /\b(AIza[0-9A-Za-z_-]{35})\b/],
  ['LLM_API_KEY ค่าจริง', /LLM_API_KEY\s*[=:]\s*['"]?([^\s'"#]{20,})/],
  ['VAPID private key', /VAPID_PRIVATE_KEY\s*[=:]\s*['"]?([A-Za-z0-9_-]{42,44})\b/],
  ['JWT_SECRET ค่าจริง', /JWT_SECRET\s*[=:]\s*['"]?([^\s'"#]{8,})/],
  ['DB password ค่าจริง', /(?:DB_PASSWORD|MYSQL_PASSWORD|MYSQL_ROOT_PASSWORD)\s*[=:]\s*['"]?([^\s'"#]{6,})/],
  ['bcrypt hash', /(\$2[aby]\$\d\d\$[./A-Za-z0-9]{53})/],
  ['JWT/Bearer token', /\b(eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,})/],
  ['accessToken ยาว', /accessToken["']?\s*[:=]\s*["']([A-Za-z0-9+/=._-]{80,})/],
];

/** บรรทัดเดียว → รายชื่อชนิดความลับที่พบ (ไม่คืนค่า) */
export function scanLine(line, file = '') {
  const hits = [];
  for (const [name, re] of RULES) {
    const m = re.exec(line);
    if (!m || PLACEHOLDER.test(m[1])) continue;
    if (name === 'bcrypt hash' && BCRYPT_ALLOWED_FILES.has(file)) continue;
    hits.push(name);
  }
  return hits;
}

/** อ่าน output ของ `git log -p` / `git diff -U0` → [{ type, file, ref, line }] (ref = commit หรือ ''; ใช้ marker '@@C <hash>' ถ้ามี) */
export function scanPatch(text) {
  const out = []; let ref = '', file = '', ln = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('@@C ')) { ref = line.slice(4).trim(); continue; }
    if (line.startsWith('+++ b/')) { file = line.slice(6); continue; }
    const h = /^@@ -\S+ \+(\d+)/.exec(line);
    if (h) { ln = Number(h[1]) - 1; continue; }
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    ln++;
    for (const type of scanLine(line.slice(1), file)) out.push({ type, file, ref, line: ln });
  }
  return out;
}
