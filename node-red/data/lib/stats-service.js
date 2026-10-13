// สถิติอัตราการกินยา (tab 5-Dashboard, LINE "สรุป") — global: statsService
// นิยามเดียวทั้งระบบ (API / เว็บ / LINE):
//   ช่วง = วันนี้ + ย้อนหลัง (days-1) วัน ตามเวลา Asia/Bangkok ; นับเฉพาะยาที่ as_needed = 0
//   taken = status taken (ทุก source) · missed = status missed · pending_due = pending ที่ scheduled_at <= ตอนนี้ · upcoming = pending ที่ยังไม่ถึงเวลา (ไม่นับ)
//   due = taken + missed + pending_due · rate = round(taken*100/due) ; due = 0 → null
// เวลา: ห้ามใช้ NOW()/CURDATE() ใน SQL — รับ now (Date) จาก JS แล้วคำนวณ today/from/to เป็นเวลาไทย ส่งเข้า SQL เป็นพารามิเตอร์ (ทดสอบขอบเที่ยงคืนด้วยการส่ง now เข้ามาได้)
const { SLOT_LABEL } = require('./labels-th');

const SLOTS = ['morning', 'noon', 'evening', 'bedtime'];
const SOURCES = ['app', 'push', 'line', 'caregiver'];
const MIN_DAYS = 7;
const MAX_DAYS = 30;
const STREAK_LOOKBACK = 60;
const WEEKDAY_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const MONTH_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const err = (status, error, details) => ({ status, body: { error, details } });
const pad = (n) => String(n).padStart(2, '0');

// ---------- เวลา (pure) ----------
// Date → ส่วนประกอบเวลาไทย (UTC+7 ไม่มี DST) โดยไม่พึ่ง TZ ของ process
function bangkokParts(now) {
  const t = new Date((now instanceof Date ? now : new Date(now)).getTime() + 7 * 3600 * 1000);
  const date = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  const time = `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
  return { today: date, nowStr: `${date} ${time}`, iso: `${date}T${time}+07:00` };
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
// "จ. 12 ต.ค."
function labelTh(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${WEEKDAY_TH[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTH_TH[m - 1]}`;
}

const rateOf = (taken, due) => (due > 0 ? Math.round((taken * 100) / due) : null);

// days: ไม่ส่ง/ว่าง → 7 ; 7–30 เท่านั้น
function parseDays(raw) {
  if (raw === undefined || raw === null || raw === '') return { days: MIN_DAYS };
  if (typeof raw !== 'string' && typeof raw !== 'number') return { error: true };
  const s = String(raw).trim();
  if (!/^\d{1,3}$/.test(s)) return { error: true };
  const n = Number(s);
  return n >= MIN_DAYS && n <= MAX_DAYS ? { days: n } : { error: true };
}

// ---------- รวมผล (pure) ----------
const num = (v) => Number(v) || 0;
function counts(r) {
  const taken = num(r.taken), missed = num(r.missed), pending_due = num(r.pending_due), upcoming = num(r.upcoming);
  const due = taken + missed + pending_due;
  return { taken, missed, pending_due, upcoming, due, rate: rateOf(taken, due) };
}
function sumCounts(rows) {
  const t = { taken: 0, missed: 0, pending_due: 0, upcoming: 0 };
  for (const r of rows) { t.taken += num(r.taken); t.missed += num(r.missed); t.pending_due += num(r.pending_due); t.upcoming += num(r.upcoming); }
  return counts(t);
}
const pick = (c) => ({ due: c.due, taken: c.taken, rate: c.rate });

// กินครบติดกัน: นับย้อนจากเมื่อวาน (วัน due>0 และ taken=due → +1 ; due=0 ข้าม ; ไม่ครบ → หยุด) ย้อนไม่เกิน 60 วัน ;
// วันนี้นับด้วยเมื่อมี due>0, taken=due และไม่มี upcoming
function computeStreak(dayMap, today) {
  let n = 0;
  for (let i = 1; i <= STREAK_LOOKBACK; i++) {
    const r = dayMap.get(addDays(today, -i));
    if (!r || r.due === 0) continue;
    if (r.taken === r.due) n++; else break;
  }
  const t = dayMap.get(today);
  if (t && t.due > 0 && t.taken === t.due && t.upcoming === 0) n++;
  return n;
}

// rowsDetail: [{ date, slot, medication_id, source, taken, missed, pending_due, upcoming }] เฉพาะช่วง from..to
// rowsDaily : [{ date, taken, missed, pending_due, upcoming }] ย้อน 60 วัน..วันนี้ (ใช้ days[] และ streak)
// meds      : [{ id, name, strength, is_active }]
function buildReport({ rowsDetail, rowsDaily, meds, now, days }) {
  const { today, iso } = bangkokParts(now);
  const from = addDays(today, -(days - 1));
  const dayMap = new Map();
  for (const r of rowsDaily) dayMap.set(String(r.date).slice(0, 10), counts(r));

  const dayList = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    dayList.push({ date, label_th: labelTh(date), is_today: date === today, ...(dayMap.get(date) || counts({})) });
  }
  const { taken, missed, pending_due, due, rate } = sumCounts(dayList);

  const group = (keyOf) => {
    const m = new Map();
    for (const r of rowsDetail) { const k = keyOf(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return m;
  };
  const mealRows = group((r) => r.slot);
  const by_meal = SLOTS.filter((s) => mealRows.has(s))
    .map((s) => ({ meal: s, label_th: SLOT_LABEL[s], ...pick(sumCounts(mealRows.get(s))) }))
    .filter((x) => x.due > 0);

  const medInfo = new Map(meds.map((m) => [Number(m.id), m]));
  const by_medication = [...group((r) => Number(r.medication_id)).entries()].map(([id, rows]) => {
    const info = medInfo.get(id) || {};
    return { medication_id: id, name: info.name || '', strength: info.strength || null, is_active: info.is_active === undefined ? true : !!Number(info.is_active), ...pick(sumCounts(rows)) };
  }).sort((a, b) => (a.rate === null) - (b.rate === null) || (a.rate ?? 0) - (b.rate ?? 0) || a.name.localeCompare(b.name, 'th') || a.medication_id - b.medication_id);

  // นับเฉพาะ taken ; source ที่ไม่รู้จัก (หรือ NULL) นับรวมที่ other ไม่ error
  const by_source = { app: 0, push: 0, line: 0, caregiver: 0, other: 0 };
  for (const r of rowsDetail) {
    const n = num(r.taken);
    if (!n) continue;
    if (SOURCES.includes(r.source)) by_source[r.source] += n; else by_source.other += n;
  }

  return {
    range: { from, to: today, days },
    overall: { taken, missed, pending_due, due, rate },
    days: dayList,
    by_meal,
    by_medication,
    by_source,
    streak_days: computeStreak(dayMap, today),
    generated_at: iso
  };
}

// ---------- query (GROUP BY ใน SQL) ----------
const SUMS = "SUM(d.status = 'taken') AS taken, SUM(d.status = 'missed') AS missed, " +
  "SUM(d.status = 'pending' AND d.scheduled_at <= ?) AS pending_due, SUM(d.status = 'pending' AND d.scheduled_at > ?) AS upcoming ";
// ไม่กรอง m.is_active (ยาที่หยุดแล้วยังมีประวัติ taken/missed) ; ไม่ใช้ NOW()/CURDATE()
const FROM_WHERE = 'FROM dose_logs d JOIN medications m ON m.id = d.medication_id ' +
  'WHERE d.user_id = ? AND m.as_needed = 0 AND d.scheduled_date BETWEEN ? AND ? ';

const DETAIL_SQL = "SELECT DATE_FORMAT(d.scheduled_date, '%Y-%m-%d') AS date, d.slot, d.medication_id, d.source, " + SUMS + FROM_WHERE +
  'GROUP BY d.scheduled_date, d.slot, d.medication_id, d.source';
const DAILY_SQL = "SELECT DATE_FORMAT(d.scheduled_date, '%Y-%m-%d') AS date, " + SUMS + FROM_WHERE + 'GROUP BY d.scheduled_date';

// คืน { status, body } ; now ใส่ได้เพื่อทดสอบ (ไม่ใส่ = เวลาจริง)
async function adherence(db, userId, rawDays, now = new Date()) {
  const p = parseDays(rawDays);
  if (p.error) return err(400, 'VALIDATION', `จำนวนวันต้องเป็นตัวเลขตั้งแต่ ${MIN_DAYS} ถึง ${MAX_DAYS}`);
  const { today, nowStr } = bangkokParts(now);
  const from = addDays(today, -(p.days - 1));
  const rowsDetail = await db.query(DETAIL_SQL, [nowStr, nowStr, userId, from, today]);
  const rowsDaily = await db.query(DAILY_SQL, [nowStr, nowStr, userId, addDays(today, -STREAK_LOOKBACK), today]);
  const ids = [...new Set(rowsDetail.map((r) => Number(r.medication_id)))];
  const meds = ids.length ? await db.query('SELECT id, name, strength, is_active FROM medications WHERE user_id = ? AND id IN (?)', [userId, ids]) : [];
  return { status: 200, body: buildReport({ rowsDetail, rowsDaily, meds, now, days: p.days }) };
}

module.exports = { adherence, buildReport, parseDays, bangkokParts, addDays, labelTh, rateOf, computeStreak, DETAIL_SQL, DAILY_SQL, SOURCES };
