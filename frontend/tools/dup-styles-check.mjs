// ตรวจ `styles:` แบบ inline ที่ซ้ำกันทุกไบต์ระหว่างคอมโพเนนต์ — เคยทำให้ `ng build` สร้างเสร็จแล้ว process ไม่ exit (45cbf2f ; docs/day8d-plan.md)
// ใช้: node tools/dup-styles-check.mjs  (ซ้ำ = exit 1)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : []; });
const seen = new Map();
for (const f of walk('src')) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/styles:\s*`([^`]*)`/g)) {
    const key = m[1].replace(/\s+/g, ' ').trim();
    if (key.length < 10) continue;
    (seen.get(key) ?? seen.set(key, []).get(key)).push(f);
  }
}
const dups = [...seen].filter(([, fs]) => fs.length > 1);
for (const [k, fs] of dups) console.log(`✘ styles ซ้ำ ${fs.length} ที่: ${fs.join(', ')}\n   ${k.slice(0, 80)}`);
console.log(dups.length ? `พบ ${dups.length} ชุดที่ซ้ำ` : '✔ ไม่มี inline styles ซ้ำกัน');
process.exit(dups.length ? 1 : 0);
