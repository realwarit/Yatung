// หา/ล้าง dose_logs ที่ซ้ำ (ยาเดียวกัน มื้อเดียวกัน วันเดียวกัน) — ผลจากบั๊กเปลี่ยนเวลามื้อหลังเตือนแล้ว (fix 7C, docs/day7-plan.md ส่วนที่ 3 ข้อ 10)
//   node scripts/fix-duplicate-doses.mjs            → dry-run (ค่าเริ่มต้น) แสดงรายการ ไม่แก้อะไร
//   node scripts/fix-duplicate-doses.mjs --apply    → ทำจริง (transaction เดียว) — รันหลังตรวจรายการ dry-run แล้วเท่านั้น
// กติกาเลือกตัวที่เก็บ: มี taken → เก็บ taken ตัวแรกสุด (taken_at น้อยสุด) ; ไม่มี → เก็บตัวที่ใหม่กว่า (scheduled_at, id มากสุด)
// ตัวที่เหลือ: pending/missed → ลบ ; taken ซ้ำหลายตัว → ไม่แตะ (ประวัติการกินจริง) แจ้งให้จัดการเอง
// ก่อนลบจะย้ายสิ่งที่อ้างอิงไปที่ตัวที่เก็บ: reminded_at/followup_at/escalated_at (ถ้าตัวที่เก็บยังว่าง — กันเตือน/แจ้งญาติซ้ำ),
//   dose_escalations (UPDATE IGNORE ตาม UNIQUE dose+ผู้ดูแล), notification_logs.dose_log_id
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { planDuplicates } from './lib/dup-doses.mjs';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const APPLY = process.argv.includes('--apply');

function sql(stmt) {
  return execFileSync('docker', ['compose', 'exec', '-T', 'db', 'sh', '-c',
    'mysql --default-character-set=utf8mb4 -N -B -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'],
  { cwd: ROOT, input: stmt, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] }).trim();
}
const nul = (v) => (v === 'NULL' || v === '' ? null : v);
const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

const COLS = ['id', 'medication_id', 'slot', 'scheduled_at', 'status', 'taken_at', 'reminded_at', 'followup_at', 'escalated_at', 'med_name', 'user_id'];
const out = sql(
  "SELECT d.id, d.medication_id, d.slot, DATE_FORMAT(d.scheduled_at,'%Y-%m-%d %H:%i:%s'), d.status, IFNULL(DATE_FORMAT(d.taken_at,'%Y-%m-%d %H:%i:%s'),'NULL'), " +
  "IFNULL(DATE_FORMAT(d.reminded_at,'%Y-%m-%d %H:%i:%s'),'NULL'), IFNULL(DATE_FORMAT(d.followup_at,'%Y-%m-%d %H:%i:%s'),'NULL'), IFNULL(DATE_FORMAT(d.escalated_at,'%Y-%m-%d %H:%i:%s'),'NULL'), m.name, d.user_id " +
  'FROM dose_logs d JOIN medications m ON m.id = d.medication_id ' +
  'JOIN (SELECT medication_id, slot, DATE(scheduled_at) AS dt FROM dose_logs GROUP BY medication_id, slot, DATE(scheduled_at) HAVING COUNT(*) > 1) x ' +
  'ON x.medication_id = d.medication_id AND x.slot = d.slot AND x.dt = DATE(d.scheduled_at) ORDER BY d.medication_id, d.slot, d.scheduled_at, d.id;');
const rows = out ? out.split('\n').map((line) => {
  const f = line.split('\t'); const r = {};
  COLS.forEach((c, i) => { r[c] = nul(f[i]); });
  r.id = Number(r.id); r.medication_id = Number(r.medication_id); r.user_id = Number(r.user_id);
  return r;
}) : [];

const plans = planDuplicates(rows);
const show = (tag, r) => console.log(`  ${tag.padEnd(7)} id=${String(r.id).padEnd(6)} ยา="${r.med_name}" (id ${r.medication_id}) มื้อ=${r.slot.padEnd(7)} เวลา=${r.scheduled_at} สถานะ=${r.status}` +
  `${r.reminded_at ? ' เตือน=' + r.reminded_at.slice(11, 16) : ''}${r.escalated_at ? ' แจ้งญาติแล้ว' : ''}`);

if (!plans.length) { console.log('ไม่พบรอบซ้ำ (ยา+มื้อ+วัน) — ไม่ต้องทำอะไร'); process.exit(0); }
console.log(`พบ ${plans.length} กลุ่มที่ซ้ำ (${APPLY ? 'โหมด --apply: ทำจริง' : 'dry-run: ยังไม่แก้อะไร'})\n`);
let nRemove = 0, nManual = 0;
for (const p of plans) {
  console.log(`กลุ่ม: ยา "${p.keep.med_name}" มื้อ ${p.keep.slot} วันที่ ${p.keep.scheduled_at.slice(0, 10)}`);
  show('เก็บ', p.keep);
  p.remove.forEach((r) => show('ลบ', r));
  p.manual.forEach((r) => show('ต้องดูเอง', r));
  nRemove += p.remove.length; nManual += p.manual.length;
}
console.log(`\nสรุป: จะลบ ${nRemove} แถว · ต้องจัดการเอง ${nManual} แถว (taken ซ้ำ ไม่แตะ)`);
if (nManual) console.log('! มี taken ซ้ำในมื้อเดียว: ลบ/รวมเองก่อน ไม่งั้นสร้าง UNIQUE (migration 005) ไม่ได้');

if (!APPLY) { console.log('\nนี่คือ dry-run — ตรวจรายการแล้วรันจริงด้วย: node scripts/fix-duplicate-doses.mjs --apply'); process.exit(0); }

const stmts = ['START TRANSACTION;'];
for (const p of plans) {
  const k = p.keep.id;
  const ids = p.remove.map((r) => r.id);
  if (!ids.length) continue;
  const latest = (c) => p.remove.map((r) => r[c]).filter(Boolean).sort().pop() || null;
  for (const c of ['reminded_at', 'followup_at', 'escalated_at']) {
    if (!p.keep[c] && latest(c)) stmts.push(`UPDATE dose_logs SET ${c} = ${lit(latest(c))} WHERE id = ${k} AND ${c} IS NULL;`);
  }
  stmts.push(`UPDATE IGNORE dose_escalations SET dose_id = ${k} WHERE dose_id IN (${ids.join(',')});`);
  stmts.push(`UPDATE notification_logs SET dose_log_id = ${k} WHERE dose_log_id IN (${ids.join(',')});`);
  stmts.push(`DELETE FROM dose_logs WHERE id IN (${ids.join(',')}) AND status <> 'taken';`);
}
stmts.push('COMMIT;');
sql(stmts.join('\n'));
const left = sql('SELECT COUNT(*) FROM (SELECT 1 FROM dose_logs GROUP BY medication_id, slot, DATE(scheduled_at) HAVING COUNT(*) > 1) x;');
console.log(`\nทำเสร็จ: ลบ ${nRemove} แถว · กลุ่มที่ยังซ้ำเหลือ ${left}` + (left === '0' ? ' → รัน bash scripts/migrate.sh เพื่อสร้าง UNIQUE ได้' : ''));
