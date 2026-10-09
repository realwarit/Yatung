// ส่งออก JSON ของข้อความ Flex ทุกแบบ → docs/line-messages/*.json (วางใน LINE Flex Message Simulator: https://developers.line.biz/flex-simulator/)
//   node scripts/line-export-messages.mjs
// แต่ละไฟล์ = bubble (contents) ของข้อความ Flex ; ข้อความ text ไม่มีใน simulator จึงรวมอยู่ใน index.json
// index.json = รายการทุกข้อความ { id, title, ctx, types, altText, quickReply, file } ; ข้อมูลตัวอย่างสมมติ ไม่ใช่ข้อมูลผู้ใช้จริง
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const F = require('../node-red/data/lib/line-flex');
const M = require('../node-red/data/lib/line-messages');
const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'line-messages');
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (f.endsWith('.json')) unlinkSync(resolve(out, f));

const env = { PUBLIC_BASE_URL: 'https://example.ngrok-free.dev', DEMO_MODE: 'true' };
const index = [];
for (const s of M.samples(env)) {
  const msgs = F.withQuickReply(s.messages, s.ctx, env);
  const flex = msgs.find((m) => m.type === 'flex');
  const entry = { id: s.id, title: s.title, ctx: s.ctx, types: msgs.map((m) => m.type), altText: flex ? flex.altText : null,
    text: msgs.filter((m) => m.type === 'text').map((m) => m.text), quickReply: msgs[msgs.length - 1].quickReply.items.map((i) => i.action.label), file: null };
  if (flex) { entry.file = s.id + '.json'; writeFileSync(resolve(out, entry.file), JSON.stringify(flex.contents, null, 2) + '\n'); }
  index.push(entry);
}
writeFileSync(resolve(out, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`ส่งออก ${index.length} แบบ → ${out}`);
