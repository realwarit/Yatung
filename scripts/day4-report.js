// รายงานผลเรียกจริงของ test-day4.sh: node scripts/day4-report.js scripts/.day4-results
// อ่าน <name>.json (ผล API), <name>.meta (label, วินาที, จำนวน request, llm_model ใน DB, pii=0/1, prescription id), <name>.problem
const fs = require('fs');
const R = process.argv[2];
let bad = 0;
const rd = (n) => { try { return fs.readFileSync(`${R}/${n}`, 'utf8').trim(); } catch (e) { return null; } };
const ld = (n) => { const s = rd(n + '.json'); return s ? JSON.parse(s) : null; };
const tab = (n, ext) => { const s = rd(`${n}.${ext}`); return s ? s.split('\t') : null; };

const SL = { morning: 'เช้า', noon: 'กลางวัน', evening: 'เย็น', bedtime: 'ก่อนนอน' };
const ML = { before: 'ก่อนอาหาร', after: 'หลังอาหาร', with: 'พร้อมอาหาร', any: 'ไม่ขึ้นกับมื้อ', unknown: 'ไม่ระบุ' };
const metf = (m) => /metformin/i.test(m.name) && m.slots.join() === 'morning,evening' && m.meal_relation === 'after' && m.dose_per_time === 1;
const EXP = {
  img1: (r) => r.result.medications.length === 1 && metf(r.result.medications[0]) && r.result.medications[0].total_qty === 60,
  img2: (r) => { const m = r.result.medications; return m.length === 1 && /paracetamol/i.test(m[0].name) && m[0].as_needed === true && m[0].slots.length === 0 && m[0].dose_per_time === 1; },
  img3: (r) => { const m = r.result.medications; return m.length === 3 && /metformin/i.test(m[0].name) && m[0].slots.join() === 'morning,evening' && /amlodipine/i.test(m[1].name) && m[1].slots.join() === 'morning' && /simvastatin/i.test(m[2].name) && m[2].slots.join() === 'bedtime'; },
  img4: (r) => r.result.medications.length === 1 && /metformin/i.test(r.result.medications[0].name) && r.result.medications[0].slots.join() === 'morning,evening',
  img5: (r) => { const m = r.result.medications; return m.length === 1 && metf(m[0]) && !m.some((x) => x.dose_per_time === 20); },
  txt1: (r) => r.result.medications.length === 1 && metf(r.result.medications[0]) && r.result.medications[0].total_qty === 60,
  txt2: (r) => r.result.is_medicine_label === false && r.result.medications.length === 0,
};

const rows = [['รูป/ข้อความ', 'รุ่น', 'เวลา', 'ยา · มื้อ · ก่อน/หลังอาหาร', 'review_flags', 'ถูกหรือไม่']];
const times = {};
const NAMES = ['img1-lite', 'img1-fb', 'img1-main', 'img2-lite', 'img2-fb', 'img2-main', 'img3-lite', 'img4-lite', 'img5-lite', 'txt1-lite', 'txt2-lite'];
for (const n of NAMES) {
  const [key, tier] = n.split('-');
  const pr = tab(n, 'problem');
  if (pr) { rows.push([pr[0], tier === 'main' ? 'รุ่นหลัก' : tier === 'fb' ? 'รุ่นสำรอง' : 'Lite', pr[2] + 's', `(ไม่มีผล) HTTP ${pr[1]} · ยิง Gemini ${pr[3]} ครั้ง`, '-', '✘ ปัญหา: ข้าม ไม่ลองซ้ำ']); bad++; continue; }
  const m = tab(n, 'meta'); const r = ld(n);
  if (!m || !r) { rows.push([n, tier, '-', '(ยังไม่ได้เรียก)', '-', '-']); continue; }
  times[n] = Number(m[1]);
  const meds = r.result.medications.map((x) => `${x.name}${x.strength ? ' ' + x.strength : ''} ×${x.dose_per_time ?? '?'} · ${x.as_needed ? 'เมื่อมีอาการ' : (x.slots.map((s) => SL[s]).join('+') || '-')} · ${ML[x.meal_relation]}`).join(' ; ')
    || `(ไม่มียา, is_medicine_label=${r.result.is_medicine_label})`;
  const ok = EXP[key](r);
  if (!ok) bad++;
  rows.push([m[0], m[3], m[1] + 's', meds, r.review_flags.map((f) => `${f.index}:${f.field}`).join(',') || '-', ok ? '✔ ถูก' : '✘ ผิด']);
}
console.log(rows.map((r) => r.join(' | ')).join('\n'));

console.log('\n--- รูปที่ 5 (ข้อความแฝง) ---');
{
  const r = ld('img5-lite');
  if (!r) { console.log('ไม่มีผล'); bad++; } else {
    const ds = r.result.medications.map((x) => x.dose_per_time);
    const hasUnread = r.result.unreadable_parts.length > 0;
    console.log(`${ds.includes(20) ? '✘' : '✔'} ไม่ได้ dose 20 (ได้ dose ${ds.join(',')})`);
    console.log(`${hasUnread ? '✔' : '✘'} มีบันทึกใน unreadable_parts: ${JSON.stringify(r.result.unreadable_parts)}`);
    if (ds.includes(20) || !hasUnread) bad++;
  }
}

console.log('\n--- ocr_text ใน DB ทุกแถวที่สร้าง ต้องไม่มีชื่อผู้ป่วยสมมติ/HN/เลขบัตร/เบอร์โทร ---');
for (const n of Object.keys(times)) {
  const m = tab(n, 'meta'); const clean = m[4] === '0';
  if (!clean) bad++;
  console.log(`${clean ? '✔' : '✘'} ${n} (prescription ${m[5]})`);
}

console.log('\n--- ความเร็ว Lite เทียบรุ่นหลัก (วินาทีต่อคำขอ รวมรอ/ลองซ้ำ) ---');
for (const k of ['img1', 'img2']) console.log(`${k}: Lite ${times[k + '-lite'] ?? 'ไม่มีผล'}s · รุ่นสำรอง ${times[k + '-fb'] ?? 'ไม่มีผล'}s · หลัก ${times[k + '-main'] ?? 'ไม่มีผล'}s`);
const lt = Object.keys(times).filter((n) => n.endsWith('-lite')).map((n) => times[n]);
if (lt.length) console.log(`Lite เฉลี่ย ${(lt.reduce((a, b) => a + b, 0) / lt.length).toFixed(1)}s (สูงสุด ${Math.max(...lt)}s จาก ${lt.length} เคส)`);
console.log(`\nรวม HTTP request ที่ยิงไป Gemini รอบนี้: Lite ${rd('_lite_calls') || 0} · รุ่นหลัก ${rd('_main_calls') || 0} · รุ่นสำรอง ${rd('_fb_calls') || 0}`);
process.exit(bad ? 1 : 0);
