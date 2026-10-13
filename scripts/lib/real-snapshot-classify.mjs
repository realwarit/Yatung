// จัดระดับความเปลี่ยนแปลงของข้อมูลผู้ใช้จริงระหว่างรันเทส (ใช้โดย scripts/lib/real-snapshot.sh)
//   ⓘ info = เปลี่ยนจาก cron จริง (ปกติ) — เฉพาะ 3 อย่างนี้และต้องตรงรอบ cron (วินาทีของเวลาที่บันทึก ≤ CRON_WINDOW_SEC เพราะ cron เริ่มทุกต้นนาที):
//        1) dose_logs.reminded_at จากว่าง → มีค่า (ห้ามเปลี่ยนคอลัมน์อื่นของแถวนั้น)
//        2) notification_logs แถวใหม่ที่ kind = reminder | escalation
//        3) push_subscriptions.last_success_at เพิ่มขึ้น (ห้ามเปลี่ยน fail_count / notify_both / จำนวนเครื่อง)
//   ✘ bad  = ทุกอย่างที่เหลือ (status, taken_at, source, escalated_at, followup_at, remaining/ยา, ผู้ใช้, การเชื่อม LINE, notification ชนิดอื่น ฯลฯ)
// ข้อมูลเข้า = ข้อความ TSV (คอลัมน์คั่นด้วย tab ตามที่ mysql -N -B ให้) จึงทดสอบได้โดยไม่ต้องมี DB

export const CRON_WINDOW_SEC = 30;
export const CRON_KINDS = ['reminder', 'escalation'];

const rows = (t) => String(t || '').split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l !== '').map((l) => l.split('\t'));
const NULL = '-';

/** วินาทีของ "YYYY-MM-DD HH:MM:SS" (ไม่ใช่รูปแบบนี้ = null) */
export function secondOf(ts) {
  const m = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:(\d{2})/.exec(String(ts || ''));
  return m ? Number(m[1]) : null;
}
const onCronBeat = (ts) => { const s = secondOf(ts); return s !== null && s <= CRON_WINDOW_SEC; };

/** dose_logs: id, status, reminded_at, taken_at, escalated_at, followup_at, source */
function classifyDoses(before, after, out) {
  const b = new Map(rows(before).map((r) => [r[0], r]));
  const a = new Map(rows(after).map((r) => [r[0], r]));
  for (const [id, rb] of b) {
    const ra = a.get(id);
    if (!ra) { out.bad.push(`dose ${id}: หายไป`); continue; }
    if (rb.join('\t') === ra.join('\t')) continue;
    const names = ['id', 'status', 'reminded_at', 'taken_at', 'escalated_at', 'followup_at', 'source'];
    const changed = names.filter((_, i) => rb[i] !== ra[i]);
    if (changed.length === 1 && changed[0] === 'reminded_at' && rb[2] === NULL && ra[2] !== NULL && onCronBeat(ra[2])) {
      out.info.dose += 1;
    } else {
      out.bad.push(`dose ${id}: ${changed.map((n) => `${n} ${rb[names.indexOf(n)]} → ${ra[names.indexOf(n)]}`).join(', ')}`);
    }
  }
  // แถวใหม่ของผู้ใช้จริง (cron 00:05 สร้างรอบ) ไม่นับ — snapshot เทียบเฉพาะ id ที่มีก่อนเริ่ม
}

/** notification_logs: id, kind, channel, sent_at */
function classifyNotifs(before, after, out) {
  const b = new Map(rows(before).map((r) => [r[0], r]));
  const a = new Map(rows(after).map((r) => [r[0], r]));
  for (const id of b.keys()) if (!a.has(id)) out.bad.push(`notification ${id}: หายไป`);
  for (const [id, r] of a) {
    if (b.has(id)) continue;
    const [, kind, channel, sentAt] = r;
    if (CRON_KINDS.includes(kind) && onCronBeat(sentAt)) {
      out.info.notification += 1;
      out.info.kinds[kind] = (out.info.kinds[kind] || 0) + 1;
    } else {
      out.bad.push(`notification ใหม่ ${id}: kind=${kind} channel=${channel} เวลา ${sentAt}${CRON_KINDS.includes(kind) ? ' (ไม่ตรงรอบ cron)' : ''}`);
    }
  }
}

/** push: sub_id, fail_count, last_success_at, user_id, notify_both  (LEFT JOIN: ไม่มีเครื่อง = sub_id เป็น NULL) */
function classifyPush(before, after, out) {
  const key = (r) => `${r[0]}|${r[3]}`;
  const b = new Map(rows(before).map((r) => [key(r), r]));
  const a = new Map(rows(after).map((r) => [key(r), r]));
  for (const k of b.keys()) if (!a.has(k)) out.bad.push(`push ${k}: หายไป`);
  for (const [k, ra] of a) {
    const rb = b.get(k);
    if (!rb) { out.bad.push(`push ${k}: เครื่องใหม่`); continue; }
    if (rb.join('\t') === ra.join('\t')) continue;
    const onlyLast = rb[1] === ra[1] && rb[3] === ra[3] && rb[4] === ra[4] && rb[2] !== ra[2];
    if (onlyLast && ra[2] !== NULL && (rb[2] === NULL || ra[2] > rb[2]) && onCronBeat(ra[2])) out.info.push += 1;
    else out.bad.push(`push ${k}: ${rb.slice(1).join(',')} → ${ra.slice(1).join(',')}`);
  }
}

/** meds: id, refill_alerted_at */
function classifyMeds(before, after, out) {
  const b = new Map(rows(before).map((r) => [r[0], r]));
  const a = new Map(rows(after).map((r) => [r[0], r]));
  for (const [id, rb] of b) {
    const ra = a.get(id);
    if (!ra) out.bad.push(`ยา ${id}: หายไป`);
    else if (rb[1] !== ra[1]) out.bad.push(`ยา ${id}: refill_alerted_at ${rb[1]} → ${ra[1]}`);
  }
}

/** snap = { doses, notifs, push, meds, esc } (ข้อความ TSV / ตัวเลข) */
export function classify(before, after) {
  const out = { info: { dose: 0, notification: 0, push: 0, kinds: {} }, bad: [] };
  classifyDoses(before.doses, after.doses, out);
  classifyNotifs(before.notifs, after.notifs, out);
  classifyPush(before.push, after.push, out);
  classifyMeds(before.meds, after.meds, out);
  if (String(before.esc).trim() !== String(after.esc).trim()) out.bad.push(`dose_escalations ของผู้ใช้จริง: ${String(before.esc).trim()} → ${String(after.esc).trim()}`);
  out.infoTotal = out.info.dose + out.info.notification + out.info.push;
  return out;
}

export function describeInfo(info) {
  const kinds = Object.entries(info.kinds).map(([k, n]) => `${k} ${n}`).join(', ');
  return `dose_logs.reminded_at ${info.dose} แถว · notification_logs ใหม่ ${info.notification} แถว${kinds ? ` (${kinds})` : ''} · push last_success_at ${info.push} เครื่อง`;
}

// CLI: node real-snapshot-classify.mjs <dir>   (ไฟล์ <dir>/{before,after}.{doses,notifs,push,meds,esc}) → exit 0 = ไม่มี ✘ ; 1 = มี ✘
const { pathToFileURL } = await import('node:url');
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { readFileSync, existsSync } = await import('node:fs');
  const dir = process.argv[2];
  const load = (side) => Object.fromEntries(['doses', 'notifs', 'push', 'meds', 'esc'].map((k) => [k, existsSync(`${dir}/${side}.${k}`) ? readFileSync(`${dir}/${side}.${k}`, 'utf8') : '']));
  const r = classify(load('before'), load('after'));
  const sameDoseCount = rows(load('before').doses).length;
  if (r.bad.length === 0 && r.infoTotal === 0) console.log(`  ✔ ข้อมูลผู้ใช้จริงไม่เปลี่ยน (dose_logs ${sameDoseCount} แถว, notification_logs ${rows(load('after').notifs).length} แถว, dose_escalations ${String(load('after').esc).trim()} แถว เท่าเดิม)`);
  if (r.infoTotal > 0) console.log(`  ⓘ เปลี่ยนจาก cron จริง (ปกติ — ผู้ใช้จริงได้รับเตือนตามเวลา): ${describeInfo(r.info)}`);
  if (r.bad.length > 0) {
    console.log(`  ✘ ข้อมูลผู้ใช้จริงเปลี่ยนโดยไม่ใช่งานของ cron ปกติ ${r.bad.length} รายการ:`);
    for (const l of r.bad.slice(0, 12)) console.log(`    - ${l}`);
    if (r.bad.length > 12) console.log(`    … และอีก ${r.bad.length - 12} รายการ`);
  }
  console.log(`  ระดับ: ⓘ ${r.infoTotal} · ✘ ${r.bad.length}`);
  process.exit(r.bad.length ? 1 : 0);
}
