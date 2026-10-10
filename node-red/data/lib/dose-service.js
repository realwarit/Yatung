// logic ของ tab 4-Doses (ตารางวันนี้ / กินแล้ว / ยกเลิก) และ SQL ของ cron ที่ tab 6
const { SLOTS } = require('./validate-medication');
const { GENERATE_TODAY_SQL } = require('./medication-service');
const stock = require('./stock-service');

const err = (status, error, details) => ({ status, body: { error, details } });
const notFound = () => err(404, 'NOT_FOUND', 'ไม่พบข้อมูลที่ต้องการ');
const toId = (v) => (/^\d+$/.test(String(v)) ? Number(v) : null);
const UNDO_WINDOW_MIN = 10;

// hook หลังกินยาสำเร็จ (หลัง COMMIT) จากทุกช่องทาง : settings.js ตั้งให้แจ้งญาติ "ปิดเรื่อง" (escalationService.notifyResolved)
// ล้มเหลวต้องไม่ทำให้การบันทึกกินยาล้ม ; ไม่ตั้ง = ไม่ทำอะไร
let afterTaken = null;
function setAfterTaken(fn) { afterTaken = typeof fn === 'function' ? fn : null; }
function fireAfterTaken(ids) {
  if (!afterTaken || !ids.length) return;
  Promise.resolve().then(() => afterTaken(ids)).catch((e) => console.log('after_taken_error ' + String(e && e.message).slice(0, 200)));
}

// ---- GET /api/doses/today: flow ใช้ node mysql → function สร้าง query กับจัดรูป response เรียกคู่นี้ ----
const DT = (col) => "DATE_FORMAT(" + col + ", '%Y-%m-%d %H:%i:%s')";
// opts.withDue (ใช้ใน LINE): เพิ่มคอลัมน์ is_due = ถึงเวลาแล้ว (scheduled_at <= NOW()) ; API ของเว็บไม่ใช้
function todayQuery(userId, opts = {}) {
  return {
    sql: 'SELECT d.id, d.medication_id, d.slot, ' + DT('d.scheduled_at') + ' AS scheduled_at, d.status, ' + DT('d.taken_at') + ' AS taken_at, d.source, ' +
      (opts.withDue ? '(d.scheduled_at <= NOW()) AS is_due, ' : '') +
      "(d.status = 'pending' AND NOW() > d.scheduled_at + INTERVAL 30 MINUTE) AS is_overdue, " +
      'm.name, m.strength, m.dose_per_time, m.unit, m.meal_relation ' +
      'FROM dose_logs d JOIN medications m ON m.id = d.medication_id ' +
      'WHERE d.user_id = ? AND DATE(d.scheduled_at) = CURDATE() AND (m.is_active = 1 OR d.status = \'taken\') ORDER BY d.scheduled_at, m.name, d.id',
    params: [userId]
  };
}

function shapeToday(rows) {
  const groups = new Map();
  const summary = { total: 0, taken: 0, pending: 0, missed: 0 };
  for (const r of rows || []) {
    if (!groups.has(r.slot)) groups.set(r.slot, { slot: r.slot, time: String(r.scheduled_at).slice(11, 16), doses: [] });
    groups.get(r.slot).doses.push({
      id: r.id, medication_id: r.medication_id, name: r.name, strength: r.strength,
      dose_per_time: Number(r.dose_per_time), unit: r.unit, meal_relation: r.meal_relation,
      scheduled_at: r.scheduled_at, status: r.status, taken_at: r.taken_at, source: r.source || null, is_overdue: !!Number(r.is_overdue),
      ...(r.is_due !== undefined ? { is_due: !!Number(r.is_due) } : {})
    });
    summary.total++; summary[r.status]++;
  }
  const slots = [...groups.values()].sort((x, y) => x.time.localeCompare(y.time) || SLOTS.indexOf(x.slot) - SLOTS.indexOf(y.slot));
  return { status: 200, body: { slots, summary } };
}

const LOCK_SQL =
  'SELECT d.id, d.status, d.taken_at, d.escalated_at, m.id AS med_id, m.dose_per_time, m.remaining_qty, m.total_qty, ' +
  'TIMESTAMPDIFF(SECOND, d.taken_at, NOW()) AS secs_since_taken ' +
  'FROM dose_logs d JOIN medications m ON m.id = d.medication_id WHERE d.id = ? AND d.user_id = ? FOR UPDATE';

async function snapshot(conn, id) {
  const [r] = await conn.query(
    'SELECT d.id, d.status, d.taken_at, d.source, m.remaining_qty FROM dose_logs d JOIN medications m ON m.id = d.medication_id WHERE d.id = ?', [id]);
  return { id: r[0].id, status: r[0].status, taken_at: r[0].taken_at, source: r[0].source,
    remaining_qty: r[0].remaining_qty == null ? null : Number(r[0].remaining_qty) };
}

// บันทึกกินยา 1 รอบใน transaction ที่เปิดอยู่แล้ว (ปุ่มในแอป source='app', ปุ่ม LINE source='line') ; คืน { status, body } เหมือน take()
// ต้องเรียกภายใน db.withTransaction เท่านั้น (ใช้ SELECT … FOR UPDATE)
async function takeInTx(conn, userId, id, source) {
  const [rows] = await conn.query(LOCK_SQL, [id, userId]);
  if (!rows.length) return notFound();
  const d = rows[0];
  if (d.status === 'taken') return err(409, 'ALREADY_TAKEN', 'บันทึกว่ากินยารอบนี้แล้ว');
  // status = missed ก็กดได้ (กินช้า) ไม่แจ้งใครเพิ่ม
  await conn.query("UPDATE dose_logs SET status = 'taken', taken_at = NOW(), source = ? WHERE id = ?", [source, id]);
  if (d.remaining_qty != null) {
    await conn.query('UPDATE medications SET remaining_qty = GREATEST(remaining_qty - ?, 0) WHERE id = ?', [d.dose_per_time, d.med_id]);
  }
  return { status: 200, body: await snapshot(conn, id) };
}

async function take(db, userId, rawId) {
  const id = toId(rawId);
  if (!id) return notFound();
  const r = await db.withTransaction((conn) => takeInTx(conn, userId, id, 'app'));
  if (r.status === 200) fireAfterTaken([id]);
  return r;
}

// ปุ่ม "กินแล้ว" ใน LINE: หลาย dose ใน transaction เดียว ; id ที่ไม่ใช่ของ userId ถูกข้ามโดยไม่แจ้ง (นับ skipped)
// คืน { taken: [id…], already: [id…], already_info: [{ id, slot, at: 'HH:MM', source }], skipped: n, at: 'HH:MM' }
// source = 'line' | 'push' | 'caregiver' ; opts.noHook = true → ไม่เรียก hook ปิดเรื่อง (ผู้เรียกจัดการเอง เช่นญาติกดยืนยัน)
async function takeMany(db, userId, rawIds, source = 'line', opts = {}) {
  const ids = [...new Set((rawIds || []).map(toId).filter((x) => x))].slice(0, 50);
  const res = await db.withTransaction(async (conn) => {
    const out = { taken: [], already: [], already_info: [], skipped: 0, at: null };
    for (const id of ids) {
      const r = await takeInTx(conn, userId, id, source);
      if (r.status === 200) out.taken.push(id);
      else if (r.status === 409) out.already.push(id);
      else out.skipped++;
    }
    if (out.already.length) {
      const [info] = await conn.query("SELECT id, slot, DATE_FORMAT(taken_at, '%H:%i') AS at, source FROM dose_logs WHERE id IN (?) AND user_id = ?", [out.already, userId]);
      out.already_info = info;
    }
    const [[t]] = await conn.query("SELECT DATE_FORMAT(NOW(), '%H:%i') AS t");
    out.at = t.t;
    return out;
  });
  if (!opts.noHook) fireAfterTaken(res.taken);
  return res;
}

async function undo(db, userId, rawId) {
  const id = toId(rawId);
  if (!id) return notFound();
  return db.withTransaction(async (conn) => {
    const [rows] = await conn.query(LOCK_SQL, [id, userId]);
    if (!rows.length) return notFound();
    const d = rows[0];
    if (d.status !== 'taken') return err(409, 'NOT_TAKEN', 'รอบนี้ยังไม่ได้บันทึกว่ากินแล้ว จึงยกเลิกไม่ได้');
    if (d.secs_since_taken > UNDO_WINDOW_MIN * 60) return err(409, 'UNDO_EXPIRED', 'ยกเลิกได้ภายใน ' + UNDO_WINDOW_MIN + ' นาทีหลังกดเท่านั้น');
    // กฎ: เคยแจ้งญาติไปแล้ว (escalated_at ไม่ว่าง) → กลับเป็น missed (กันแจ้งญาติซ้ำ) ; ไม่เคย → กลับเป็น pending
    const back = d.escalated_at ? 'missed' : 'pending';
    await conn.query('UPDATE dose_logs SET status = ?, taken_at = NULL, source = NULL WHERE id = ?', [back, id]);
    if (d.remaining_qty != null) {
      // คืนไม่เกิน total_qty (ถ้ามี) เผื่อตอนกดกินถูก clamp ที่ 0
      await conn.query(
        'UPDATE medications SET remaining_qty = LEAST(remaining_qty + ?, COALESCE(total_qty, remaining_qty + ?)) WHERE id = ?',
        [d.dose_per_time, d.dose_per_time, d.med_id]);
      await stock.resetRecovered(async (sql, params) => (await conn.query(sql, params))[0], process.env, d.med_id);   // คืนยาจนพ้นเกณฑ์ = ล้างการจองแจ้งใกล้หมด
    }
    return { status: 200, body: await snapshot(conn, id) };
  });
}

// cron 00:05: สร้างรอบของวันนี้ทุกคน (ไม่กรองเวลา)
async function generateToday(db) {
  const res = await db.query(GENERATE_TODAY_SQL(false, false));
  return { inserted: res.affectedRows };
}

// cron 03:00: รอบของวันก่อนๆ ที่ยัง pending = ไม่ได้กิน → missed (Dashboard นับ taken ÷ (taken + missed)) ; รันซ้ำได้ ; ไม่แตะวันนี้/taken
// env.REMINDER_ONLY_EMAIL_SUFFIX (เฉพาะรันเทส) = แตะเฉพาะ user ที่อีเมลลงท้ายด้วยค่านี้
async function closeStaleDoses(db, env = process.env) {
  const { userFilter } = require('./reminder-service');
  const f = userFilter(env);
  const res = await db.query("UPDATE dose_logs d JOIN users u ON u.id = d.user_id SET d.status = 'missed' WHERE d.status = 'pending' AND d.scheduled_at < CURDATE()" + f.sql, f.params);
  return { missed: res.affectedRows };
}

module.exports = { setAfterTaken, closeStaleDoses, todayQuery, shapeToday, take, takeInTx, takeMany, undo, generateToday };
