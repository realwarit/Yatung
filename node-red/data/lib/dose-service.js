// logic ของ tab 4-Doses (ตารางวันนี้ / กินแล้ว / ยกเลิก) และ SQL ของ cron ที่ tab 6
const { SLOTS } = require('./validate-medication');
const { GENERATE_TODAY_SQL } = require('./medication-service');

const err = (status, error, details) => ({ status, body: { error, details } });
const notFound = () => err(404, 'NOT_FOUND', 'ไม่พบข้อมูลที่ต้องการ');
const toId = (v) => (/^\d+$/.test(String(v)) ? Number(v) : null);
const UNDO_WINDOW_MIN = 10;

// ---- GET /api/doses/today: flow ใช้ node mysql → function สร้าง query กับจัดรูป response เรียกคู่นี้ ----
const DT = (col) => "DATE_FORMAT(" + col + ", '%Y-%m-%d %H:%i:%s')";
function todayQuery(userId) {
  return {
    sql: 'SELECT d.id, d.medication_id, d.slot, ' + DT('d.scheduled_at') + ' AS scheduled_at, d.status, ' + DT('d.taken_at') + ' AS taken_at, ' +
      "(d.status = 'pending' AND NOW() > d.scheduled_at + INTERVAL 30 MINUTE) AS is_overdue, " +
      'm.name, m.strength, m.dose_per_time, m.unit, m.meal_relation ' +
      'FROM dose_logs d JOIN medications m ON m.id = d.medication_id ' +
      'WHERE d.user_id = ? AND DATE(d.scheduled_at) = CURDATE() ORDER BY d.scheduled_at, m.name, d.id',
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
      scheduled_at: r.scheduled_at, status: r.status, taken_at: r.taken_at, is_overdue: !!Number(r.is_overdue)
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

async function take(db, userId, rawId) {
  const id = toId(rawId);
  if (!id) return notFound();
  return db.withTransaction(async (conn) => {
    const [rows] = await conn.query(LOCK_SQL, [id, userId]);
    if (!rows.length) return notFound();
    const d = rows[0];
    if (d.status === 'taken') return err(409, 'ALREADY_TAKEN', 'บันทึกว่ากินยารอบนี้แล้ว');
    // status = missed ก็กดได้ (กินช้า) ไม่แจ้งใครเพิ่ม
    await conn.query("UPDATE dose_logs SET status = 'taken', taken_at = NOW(), source = 'app' WHERE id = ?", [id]);
    if (d.remaining_qty != null) {
      await conn.query('UPDATE medications SET remaining_qty = GREATEST(remaining_qty - ?, 0) WHERE id = ?', [d.dose_per_time, d.med_id]);
    }
    return { status: 200, body: await snapshot(conn, id) };
  });
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
    }
    return { status: 200, body: await snapshot(conn, id) };
  });
}

// cron 00:05: สร้างรอบของวันนี้ทุกคน (ไม่กรองเวลา)
async function generateToday(db) {
  const res = await db.query(GENERATE_TODAY_SQL(false, false));
  return { inserted: res.affectedRows };
}

module.exports = { todayQuery, shapeToday, take, undo, generateToday };
