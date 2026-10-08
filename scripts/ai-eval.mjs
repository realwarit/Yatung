// ชุดทดสอบ AI (eval): ยิงซองใน docs/sample-images/ ไปที่ POST /api/scan จริง แล้วเทียบกับเฉลย docs/ai-eval/expected.json ทีละช่อง
// ไม่ได้อยู่ในชุดทดสอบปกติ — รันผ่าน `bash scripts/ai-eval.sh` (ตั้ง Node-RED ให้ใช้รุ่น Lite, ไม่ retry ให้) ; ผลบันทึกที่ docs/ai-eval/runs/<วันเวลา>.json|.md
//   node scripts/ai-eval.mjs [ชื่อไฟล์ซอง…]   (ไม่ระบุ = ทุกซองใน expected.json)
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const { makeUser, dropUser } = await import(pathToFileURL(path.join(ROOT, 'frontend', 'tools', 'lib', 'seed.mjs')).href);
const expected = JSON.parse(readFileSync(path.join(ROOT, 'docs', 'ai-eval', 'expected.json'), 'utf8'));
const RUNS = path.join(ROOT, 'docs', 'ai-eval', 'runs');
mkdirSync(RUNS, { recursive: true });

const only = process.argv.slice(2);
const names = Object.keys(expected.images).filter((n) => !only.length || only.includes(n));
const MIN_GAP_MS = 16000; // แอปจำกัด 4 ครั้ง/นาที/ผู้ใช้ → เว้น ≥ 16 วินาที ไม่ชน RATE_LIMIT

// ---------- เทียบทีละช่อง ----------
const normStr = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '');
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const FIELD_LABEL = { name: 'ชื่อ', strength: 'ขนาด', dose: 'จำนวนต่อครั้ง', slots: 'มื้อ', meal: 'ก่อน/หลังอาหาร', as_needed: 'as_needed', total_qty: 'จำนวนทั้งหมด', flag: 'flag', pii: 'ข้อมูลส่วนตัว', count: 'จำนวนยา' };

function compareMed(exp, got) {
  const out = []; // { field, ok, want, got }
  const add = (field, ok, want, have) => out.push({ field, ok, want, got: have });
  const g = got ?? {};
  add('name', got ? normStr(g.name).includes(normStr(exp.name)) : false, exp.name, got ? g.name : null);
  if ('strength' in exp) add('strength', got ? normStr(g.strength) === normStr(exp.strength) : false, exp.strength, got ? g.strength : null);
  if ('dose_per_time' in exp) {
    add('dose', got ? g.dose_per_time === exp.dose_per_time && (!exp.unit || g.unit === exp.unit) : false,
      `${exp.dose_per_time} ${exp.unit ?? ''}`.trim(), got ? `${g.dose_per_time} ${g.unit}` : null);
  }
  if ('slots' in exp) add('slots', got ? sameSet(g.slots, exp.slots) : false, exp.slots.join('+') || '(ไม่มี)', got ? (g.slots.join('+') || '(ไม่มี)') : null);
  if ('meal_relation' in exp) add('meal', got ? g.meal_relation === exp.meal_relation : false, exp.meal_relation, got ? g.meal_relation : null);
  if ('as_needed' in exp) add('as_needed', got ? g.as_needed === exp.as_needed : false, exp.as_needed, got ? g.as_needed : null);
  if ('total_qty' in exp) add('total_qty', got ? g.total_qty === exp.total_qty : false, exp.total_qty, got ? g.total_qty : null);
  return out;
}

const PII_RES = [/HN\s*[:.#-]?\s*\d/i, /(?<!\d)\d(?:[\s-]?\d){12}(?!\d)/, /(?<![\d.])0\d{1,2}[\s-]?\d{3}[\s-]?\d{3,4}(?!\d)/,
  /(?:นางสาว|นาย(?!แพทย์)|นาง(?!พยาบาล)|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.)\s*[ก-๙]/];
function piiHits(body) {
  const text = [body.ocr_text, ...body.result.medications.map((m) => m.source_text)].join('\n');
  const hits = [];
  for (const s of expected.pii_forbidden_strings) if (text.includes(s)) hits.push(s);
  for (const re of PII_RES) { const m = text.match(re); if (m) hits.push(m[0]); }
  return hits;
}

function checkFlags(exp, flags) {
  const fl = flags.length;
  if (exp.flag === 'none') return { ok: fl === 0, want: 'ไม่มี flag', got: fl ? flags.map((f) => `${f.field}: ${f.reason}`).join(' | ') : 'ไม่มี flag' };
  const have = new Set(flags.map((f) => (f.field === 'dose' ? 'dose_per_time' : f.field)));
  const missing = (exp.flag_fields ?? []).filter((f) => !have.has(f));
  return { ok: fl > 0 && !missing.length, want: 'ต้องมี flag' + (exp.flag_fields ? ` (${exp.flag_fields.join(',')})` : ''), got: fl ? [...have].join(',') : 'ไม่มี flag' };
}

// ---------- รัน ----------
const results = [];
let stopped = null;
const user = await makeUser('eval');
const startedAt = new Date();
try {
  let last = 0;
  for (const name of names) {
    const exp = expected.images[name];
    const row = { image: name, http: null, ms: null, fields: [], failed: [], note: exp.note ?? null };
    if (stopped) { row.skipped = stopped; results.push(row); continue; }
    const wait = last + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const img = readFileSync(path.join(ROOT, 'docs', 'sample-images', name));
    const t0 = Date.now();
    let res, body;
    try {
      res = await fetch('http://localhost:1880/api/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + user.token },
        body: JSON.stringify({ image: img.toString('base64') }), signal: AbortSignal.timeout(60000),
      });
      body = await res.json();
    } catch (e) {
      row.http = 'ERR'; row.error = String(e.message ?? e);
    }
    if (row.http === null) { row.http = res.status; row.ms = Date.now() - t0; }
    if (row.http === 429) stopped = 'หยุดเพราะเจอ 429';
    if (row.http !== 200) {
      // ไม่ลองซ้ำ — ทุกช่องที่มีเฉลยนับเป็นผิด
      row.error = row.error ?? JSON.stringify(body);
      for (const m of exp.meds) row.fields.push(...compareMed(m, null).map((f) => ({ ...f, med: m.name })));
      row.fields.push({ field: 'flag', ok: false, want: exp.flag, got: null }, { field: 'pii', ok: false, want: 'ไม่มีชื่อ/HN/เบอร์', got: 'ไม่ได้ผล' }, { field: 'count', ok: false, want: exp.meds.length, got: null });
      row.failed = [`HTTP ${row.http}`];
      results.push(row);
      console.log(`✘ ${name}  HTTP ${row.http} ${row.error.slice(0, 120)}${stopped ? ' — หยุดทันที' : ''}`);
      continue;
    }
    const meds = body.result.medications;
    const used = new Set();
    for (const em of exp.meds) {
      const idx = meds.findIndex((m, i) => !used.has(i) && normStr(m.name).includes(normStr(em.name)));
      if (idx >= 0) used.add(idx);
      row.fields.push(...compareMed(em, idx >= 0 ? meds[idx] : null).map((f) => ({ ...f, med: em.name })));
    }
    const fl = checkFlags(exp, body.review_flags);
    row.fields.push({ field: 'flag', ok: fl.ok, want: fl.want, got: fl.got });
    const hits = piiHits(body);
    row.fields.push({ field: 'pii', ok: hits.length === 0, want: 'ไม่มีชื่อ/HN/เบอร์', got: hits.length ? hits.join(', ') : 'ไม่มี' });
    row.fields.push({ field: 'count', ok: meds.length === exp.meds.length, want: exp.meds.length, got: meds.length });
    row.failed = row.fields.filter((f) => !f.ok).map((f) => (f.med && exp.meds.length > 1 ? `${f.med}.${f.field}` : f.field));
    row.flags = body.review_flags;
    results.push(row);
    console.log(`${row.failed.length ? '✘' : '✔'} ${name}  ${row.ms} ms  ${row.fields.filter((f) => f.ok).length}/${row.fields.length}${row.failed.length ? '  ผิด: ' + row.failed.join(', ') : ''}`);
  }
} finally {
  dropUser(user);
}

// ---------- สรุป ----------
// ซองที่ไม่ได้ผล (HTTP ไม่ใช่ 200 เช่น Gemini 503 high demand) ไม่ใช่ความผิดของ prompt → ไม่นับคะแนน แต่รายงานแยก (รันซ้ำเฉพาะซองนั้นได้)
const scored = results.filter((r) => !r.skipped && r.http === 200);
const noResult = results.filter((r) => r.skipped || r.http !== 200);
const total = scored.reduce((s, r) => s + r.fields.length, 0);
const right = scored.reduce((s, r) => s + r.fields.filter((f) => f.ok).length, 0);
const pad = (n) => String(n).padStart(2, '0');
const d = startedAt;
const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const model = process.env.EVAL_MODEL || '(ไม่ทราบ)';

const lines = [`# ผล AI eval ${stamp}`, '', `รุ่น: \`${model}\` · ไม่ retry · request ${results.filter((r) => r.http !== null).length} ครั้ง${stopped ? ' · **' + stopped + '**' : ''}`, '',
  '| ซอง | ผล | ช่องถูก | ช่องที่ผิด (ต้องการ → ได้) |', '|---|---|---|---|'];
for (const r of results) {
  if (r.skipped) { lines.push(`| ${r.image} | ข้าม | – | ${r.skipped} |`); continue; }
  const ok = r.fields.filter((f) => f.ok).length;
  const detail = r.http !== 200 ? `HTTP ${r.http} ${r.error ?? ''}`.slice(0, 160)
    : r.fields.filter((f) => !f.ok).map((f) => `${f.med && f.field !== 'flag' && f.field !== 'pii' && f.field !== 'count' ? f.med + ' ' : ''}${FIELD_LABEL[f.field] ?? f.field}: ${f.want} → ${f.got}`).join('<br>');
  lines.push(`| ${r.image} | ${r.http !== 200 ? 'ไม่ได้ผล' : r.failed.length ? 'ไม่ผ่าน' : 'ผ่าน'} | ${r.http !== 200 ? '–' : ok + '/' + r.fields.length} | ${detail} |`);
}
lines.push('', `**รวม ${right}/${total} ช่องถูก** · ซองที่ผ่านทั้งหมด ${scored.filter((r) => !r.failed.length).length}/${scored.length}`
  + (noResult.length ? ` · **ไม่ได้ผล ${noResult.length} ซอง (HTTP error/ข้าม ไม่นับคะแนน): ${noResult.map((r) => r.image).join(', ')}**` : ''));
const md = lines.join('\n') + '\n';

// เทียบกับรอบก่อนหน้า (อ่านก่อนเขียนไฟล์ใหม่)
const prev = readdirSync(RUNS).filter((f) => f.endsWith('.json')).sort().pop();
writeFileSync(path.join(RUNS, `${stamp}.md`), md);
writeFileSync(path.join(RUNS, `${stamp}.json`), JSON.stringify({ stamp, model, right, total, stopped, results }, null, 2));
console.log('\n' + md);
if (prev) {
  const p = JSON.parse(readFileSync(path.join(RUNS, prev), 'utf8'));
  const key = (r, f) => `${r.image}|${f}`;
  const failedNow = new Set(scored.flatMap((r) => r.failed.map((f) => key(r, f))));
  const failedPrev = new Set(p.results.filter((r) => r.http === 200).flatMap((r) => r.failed.map((f) => key(r, f))));
  const worse = [...failedNow].filter((k) => !failedPrev.has(k)), better = [...failedPrev].filter((k) => !failedNow.has(k));
  console.log(`เทียบรอบก่อน (${prev.replace('.json', '')}: ${p.right}/${p.total}) → ตอนนี้ ${right}/${total}`);
  if (worse.length) console.log('  แย่ลง:  ' + worse.join(', '));
  if (better.length) console.log('  ดีขึ้น: ' + better.join(', '));
  if (!worse.length && !better.length) console.log('  ไม่เปลี่ยน');
}
console.log(`บันทึกที่ docs/ai-eval/runs/${stamp}.{md,json}`);
process.exit(stopped || right < total ? 1 : 0);
