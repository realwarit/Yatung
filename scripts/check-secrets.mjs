// กันความลับหลุดเข้า git โดยไม่ต้องติดตั้งอะไรเพิ่ม (Node เท่านั้น) — ไม่พิมพ์ค่าที่พบ แสดงแค่ ชนิด / ไฟล์ / บรรทัด / commit
//   node scripts/check-secrets.mjs                  → ไฟล์ที่ stage ไว้ (pre-commit)
//   node scripts/check-secrets.mjs --tracked        → ไฟล์ที่ git track อยู่ ต้องไม่มีชื่อต้องห้าม (demo-check)
//   node scripts/check-secrets.mjs --log <args…>    → git log -p ตาม args เช่น --log HEAD --not --remotes (pre-push) / --log --all (ทั้งประวัติ)
// เปิด hook: bash scripts/setup-hooks.sh (ดู README หัวข้อ "กันความลับหลุดเข้า git")
import { execFileSync } from 'node:child_process';
import { FORBIDDEN_FILE, scanPatch } from './lib/secret-scan.mjs';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 30 });
const args = process.argv.slice(2);
let bad = 0;
const report = (kind, msg) => { bad++; console.error(`  ✗ ${kind}: ${msg}`); };

if (args[0] === '--tracked') {
  for (const f of git('ls-files').split('\n').filter(Boolean)) if (FORBIDDEN_FILE.test(f)) report('ไฟล์ต้องห้ามถูก track', f);
} else if (args[0] === '--log') {
  const range = args.slice(1);
  const names = git('log', ...range, '--name-only', '--format=').split('\n').filter(Boolean);
  for (const f of new Set(names)) if (FORBIDDEN_FILE.test(f) && git('log', ...range, '--format=%h', '-1', '--diff-filter=AM', '--', f).trim()) report('ไฟล์ต้องห้ามอยู่ในประวัติ', f);
  const seen = new Set();
  for (const r of scanPatch(git('log', ...range, '-p', '-U0', '--no-color', '--format=@@C %h'))) {
    const k = `${r.type}|${r.file}|${r.ref}`; if (seen.has(k)) continue; seen.add(k);
    report(r.type, `${r.file} @ ${r.ref}`);
  }
} else {
  for (const f of git('diff', '--cached', '--name-only', '--diff-filter=AM').split('\n').filter(Boolean)) if (FORBIDDEN_FILE.test(f)) report('ไฟล์ต้องห้าม', f);
  for (const r of scanPatch(git('diff', '--cached', '-U0', '--no-color'))) report(r.type, `${r.file}:${r.line}`);
}

if (bad) { console.error(`\nพบ ${bad} รายการ — ยกเลิก (ค่าไม่ถูกแสดง) ถ้าเป็นค่าตัวอย่างจริงๆ ให้แก้ให้เป็น placeholder หรือเพิ่มใน allowlist ที่ scripts/lib/secret-scan.mjs`); process.exit(1); }
console.log('ไม่พบไฟล์ต้องห้ามหรือรูปแบบความลับ');
