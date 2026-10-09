// ตรวจข้อความ LINE ทุกแบบกับ endpoint validate ของ LINE (ไม่ส่งข้อความจริง ไม่เสียโควตา)
//   node scripts/line-validate.mjs            # ใช้ LINE_API_BASE / LINE_CHANNEL_ACCESS_TOKEN / PUBLIC_BASE_URL จาก env หรือ .env
// ทุกแบบถูกตรวจทั้ง POST /v2/bot/message/validate/reply และ /validate/push ; ผ่านครบ = exit 0, ไม่ผ่านข้อใด = exit 1
// แบบที่ตรวจ: ตัวอย่างทั้งหมดใน lib/line-messages.js (samples) พร้อม quick reply ของแต่ละประเภทผู้ใช้
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const F = require('../node-red/data/lib/line-flex');
const M = require('../node-red/data/lib/line-messages');

const dot = {};
if (existsSync(resolve(root, '.env'))) {
  for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) dot[m[1]] = m[2].replace(/\$\{([A-Z0-9_]+)\}/g, (_, k) => dot[k] ?? '');
  }
}
const get = (k, d = '') => (process.env[k] ?? dot[k] ?? d) || d;
const API = get('LINE_API_BASE', 'https://api.line.me').replace(/\/+$/, '');
const TOKEN = get('LINE_CHANNEL_ACCESS_TOKEN');
if (!TOKEN) { console.error('✘ ไม่มี LINE_CHANNEL_ACCESS_TOKEN'); process.exit(1); }
const env = { PUBLIC_BASE_URL: get('PUBLIC_BASE_URL'), LINE_ASSET_BASE: get('LINE_ASSET_BASE'), LINE_MASCOT_URL: get('LINE_MASCOT_URL'), DEMO_MODE: 'true' };

async function validate(kind, messages) {
  const res = await fetch(`${API}/v2/bot/message/validate/${kind}`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }), signal: AbortSignal.timeout(20000)
  });
  const t = await res.text();
  return { status: res.status, text: t.slice(0, 400) };
}

let pass = 0, fail = 0;
const all = M.samples(env);
// เพิ่มข้อความที่ไม่อยู่ในตัวอย่าง: หน้า #ตัวอย่าง ทุกหน้า (ครบ 5 ข้อความ/หน้า)
const pages = M.previewPageCount(env);
const cases = all.map((s) => ({ id: s.id, messages: F.withQuickReply(s.messages, s.ctx, env) }));
for (let n = 1; n <= pages; n++) { const p = M.buildPreviewPage(n, env); cases.push({ id: `preview-page-${n}`, messages: F.withQuickReply(p.messages, 'patient', env) }); }

for (const c of cases) {
  const row = [];
  for (const kind of ['reply', 'push']) {
    const r = await validate(kind, c.messages);
    row.push(`${kind}=${r.status}`);
    if (r.status === 200) pass++; else { fail++; console.log(`  ✘ ${c.id} ${kind}: ${r.status} ${r.text}`); }
  }
  console.log(`${row.every((x) => x.endsWith('=200')) ? '✔' : '✘'} ${c.id.padEnd(22)} ${row.join(' ')}  (${c.messages.length} ข้อความ)`);
}
console.log(`\nสรุป: ผ่าน ${pass} / ${pass + fail} การตรวจ (${cases.length} แบบ × reply+push) · API ${API}`);
process.exit(fail ? 1 : 0);
