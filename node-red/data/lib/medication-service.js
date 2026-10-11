// logic ของ tab 3-Medications (ยา + เวลามื้อ) — function node แค่เรียกฟังก์ชันที่นี่
// ทุกฟังก์ชันรับ (db, userId, ...) และคืน { status, body } ; ข้อมูลที่ไม่ใช่ของ userId = 404 เสมอ
const { validateMedication, SLOTS, MAX_QTY } = require('./validate-medication');
const stock = require('./stock-service');

const err = (status, error, details) => ({ status, body: { error, details } });
const notFound = () => err(404, 'NOT_FOUND', 'ไม่พบข้อมูลที่ต้องการ');
const toId = (v) => (/^\d+$/.test(String(v)) ? Number(v) : null);

// SQL สร้าง dose_logs ของวันนี้ — INSERT IGNORE + NOT EXISTS (มื้อ, วัน) + UNIQUE ทั้ง (medication_id, scheduled_at) และ (medication_id, slot, วัน) = สร้างซ้ำกี่ครั้งก็ไม่เกิดแถวซ้ำ
// byMedication : เฉพาะยา id เดียว (ต้องส่ง id เป็นพารามิเตอร์) ; onlyFuture : เฉพาะรอบที่ยังไม่ถึงเวลา (POST/PUT)
// cron 00:05 เรียกแบบไม่กรองทั้งสองอย่าง
const GENERATE_TODAY_SQL = (byMedication, onlyFuture) =>
  'INSERT IGNORE INTO dose_logs (medication_id, user_id, slot, scheduled_at) ' +
  'SELECT m.id, m.user_id, s.slot, TIMESTAMP(CURDATE(), t.slot_time) ' +
  'FROM medications m ' +
  'JOIN medication_slots s ON s.medication_id = m.id ' +
  'JOIN user_slot_times t ON t.user_id = m.user_id AND t.slot = s.slot ' +
  'WHERE m.is_active = 1 AND m.as_needed = 0 AND m.start_date <= CURDATE() ' +
  'AND (m.end_date IS NULL OR m.end_date >= CURDATE())' +
  // กฎหลัก: ยา 1 ตัวมีได้ไม่เกิน 1 dose ต่อ (มื้อ, วัน) — มีรอบของมื้อนี้วันนี้แล้ว (สถานะอะไรก็ตาม, เวลาเดิมหรือที่ย้ายมา) ไม่สร้างเพิ่ม
  // (UNIQUE uq_dose_med_slot_day ใน DB เป็นด่านสุดท้าย ; migration 005)
  ' AND NOT EXISTS (SELECT 1 FROM dose_logs x WHERE x.medication_id = m.id AND x.slot = s.slot AND DATE(x.scheduled_at) = CURDATE())' +
  (byMedication ? ' AND m.id = ?' : '') +
  (onlyFuture ? ' AND TIMESTAMP(CURDATE(), t.slot_time) > NOW()' : '');

// วันที่/เวลาแปลงเป็น string ใน SQL (DATE_FORMAT) เพื่อให้ผลเหมือนกันไม่ว่าจะมาจาก db.query (mysql2) หรือ node `mysql` ของ Node-RED
const DT = (col) => "DATE_FORMAT(" + col + ", '%Y-%m-%d %H:%i:%s')";
const D = (col) => "DATE_FORMAT(" + col + ", '%Y-%m-%d')";
const MED_SELECT =
  'SELECT m.id, m.name, m.strength, m.dose_per_time, m.unit, m.meal_relation, m.as_needed, m.indication, ' +
  'm.warnings, m.total_qty, m.remaining_qty, m.refill_alert_days, ' + D('m.start_date') + ' AS start_date, ' +
  D('m.end_date') + ' AS end_date, m.is_active, ' + DT('m.created_at') + ' AS created_at, ' + DT('m.updated_at') + ' AS updated_at, ' +
  'v.days_left, (SELECT JSON_ARRAYAGG(s.slot) FROM medication_slots s WHERE s.medication_id = m.id) AS slots ' +
  'FROM medications m LEFT JOIN v_medication_supply v ON v.medication_id = m.id ';

const parseJson = (v, fallback) => {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return fallback; } }
  return v;
};

function shape(row) {
  const slots = parseJson(row.slots, []).slice().sort((a, b) => SLOTS.indexOf(a) - SLOTS.indexOf(b));
  const num = (v) => (v == null ? null : Number(v));
  return {
    id: row.id, name: row.name, strength: row.strength,
    dose_per_time: Number(row.dose_per_time), unit: row.unit, meal_relation: row.meal_relation,
    as_needed: !!row.as_needed, slots, indication: row.indication,
    warnings: parseJson(row.warnings, []),
    total_qty: num(row.total_qty), remaining_qty: num(row.remaining_qty), days_left: num(row.days_left),
    refill_alert_days: row.refill_alert_days,
    is_low: stock.isLow(row),   // เกณฑ์เดียวกับแจ้งเตือน LINE (lib/stock-service.js)
    start_date: row.start_date, end_date: row.end_date, is_active: !!row.is_active,
    created_at: row.created_at, updated_at: row.updated_at
  };
}

// q = (sql, params) => Promise<rows> ; ใช้ได้ทั้ง db.query และ conn ใน transaction
const connQ = (conn) => async (sql, params) => (await conn.query(sql, params))[0];

async function fetchOne(q, userId, id) {
  const rows = await q(MED_SELECT + 'WHERE m.id = ? AND m.user_id = ?', [id, userId]);
  return rows.length ? shape(rows[0]) : null;
}

// ---- endpoint อ่านอย่างเดียว: flow ใช้ node mysql → function สร้าง query กับจัดรูป response เรียกคู่นี้ ----
function listQuery(userId, activeParam) {
  let where = 'WHERE m.user_id = ?';
  if (activeParam === '1' || activeParam === 'true') where += ' AND m.is_active = 1';
  else if (activeParam === '0' || activeParam === 'false') where += ' AND m.is_active = 0';
  return { sql: MED_SELECT + where + ' ORDER BY m.is_active DESC, m.name, m.id', params: [userId] };
}
const shapeList = (rows) => ({ status: 200, body: (rows || []).map(shape) });

function getQuery(userId, rawId) {
  // id ที่ไม่ใช่ตัวเลข → ใช้ 0 ซึ่งไม่มีแถวตรง จึงได้ 404 เหมือนไม่พบ
  return { sql: MED_SELECT + 'WHERE m.id = ? AND m.user_id = ?', params: [toId(rawId) || 0, userId] };
}
const shapeOne = (rows) => (rows && rows.length ? { status: 200, body: shape(rows[0]) } : notFound());

const slotTimesQuery = (userId) => ({ sql: 'SELECT slot, slot_time FROM user_slot_times WHERE user_id = ?', params: [userId] });


// มื้อของวันนี้ที่เวลาผ่านไปแล้ว (จึงไม่ถูกสร้างรอบ) — ใช้ตอบ skipped_slots_today
async function skippedSlotsToday(q, medId) {
  const rows = await q(
    'SELECT s.slot FROM medications m JOIN medication_slots s ON s.medication_id = m.id ' +
    'JOIN user_slot_times t ON t.user_id = m.user_id AND t.slot = s.slot ' +
    'WHERE m.id = ? AND m.is_active = 1 AND m.as_needed = 0 AND m.start_date <= CURDATE() ' +
    'AND (m.end_date IS NULL OR m.end_date >= CURDATE()) AND TIMESTAMP(CURDATE(), t.slot_time) <= NOW() ' +
    'ORDER BY t.slot_time', [medId]);
  return rows.map((r) => r.slot);
}

async function replaceSlots(conn, medId, slots) {
  await conn.query('DELETE FROM medication_slots WHERE medication_id = ?', [medId]);
  if (slots.length) await conn.query('INSERT INTO medication_slots (medication_id, slot) VALUES ?', [slots.map((s) => [medId, s])]);
}

// สร้างยา 1 ตัวใน transaction ที่เปิดไว้แล้ว (m = ค่าที่ผ่าน validateMedication) — ใช้ซ้ำใน POST /api/medications และ confirm ผลสแกน
// prescriptionId = ผลสแกนที่ยานี้มาจาก (NULL = กรอกเอง)
async function createInTx(conn, userId, m, prescriptionId) {
  const q = connQ(conn);
  const remaining = m.remaining_qty != null ? m.remaining_qty : m.total_qty;
  const [res] = await conn.query(
    'INSERT INTO medications (user_id, prescription_id, name, strength, dose_per_time, unit, meal_relation, as_needed, indication, ' +
    'warnings, total_qty, remaining_qty, start_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURDATE()))',
    [userId, prescriptionId || null, m.name, m.strength, m.dose_per_time, m.unit, m.meal_relation, m.as_needed ? 1 : 0, m.indication,
      JSON.stringify(m.warnings), m.total_qty, remaining, m.start_date]);
  const id = res.insertId;
  await replaceSlots(conn, id, m.slots);
  await conn.query(GENERATE_TODAY_SQL(true, true), [id]);
  const med = await fetchOne(q, userId, id);
  med.skipped_slots_today = await skippedSlotsToday(q, id);
  return med;
}

async function create(db, userId, body) {
  const v = validateMedication(body);
  if (!v.ok) return err(400, 'VALIDATION', v.details);
  return db.withTransaction(async (conn) => ({ status: 201, body: await createInTx(conn, userId, v.value, null) }));
}

async function update(db, userId, rawId, body) {
  const id = toId(rawId);
  if (!id) return notFound();
  const v = validateMedication(body);
  if (!v.ok) return err(400, 'VALIDATION', v.details);
  const m = v.value;
  return db.withTransaction(async (conn) => {
    const q = connQ(conn);
    const [cur] = await conn.query('SELECT remaining_qty FROM medications WHERE id = ? AND user_id = ? FOR UPDATE', [id, userId]);
    if (!cur.length) return notFound();
    // ไม่ส่ง remaining_qty: คงค่าเดิม (ถ้าเดิมไม่มีค่า ใช้ total_qty) — กัน PUT แก้ชื่อแล้วจำนวนยาถูกรีเซ็ต
    const remaining = m.remaining_qty != null ? m.remaining_qty : (cur[0].remaining_qty != null ? cur[0].remaining_qty : m.total_qty);
    await conn.query(
      'UPDATE medications SET name = ?, strength = ?, dose_per_time = ?, unit = ?, meal_relation = ?, as_needed = ?, ' +
      'indication = ?, warnings = ?, total_qty = ?, remaining_qty = ?, start_date = COALESCE(?, start_date) WHERE id = ?',
      [m.name, m.strength, m.dose_per_time, m.unit, m.meal_relation, m.as_needed ? 1 : 0, m.indication,
        JSON.stringify(m.warnings), m.total_qty, remaining, m.start_date, id]);
    await replaceSlots(conn, id, m.slots);
    await stock.resetRecovered(q, process.env, id);   // แก้จำนวน/มื้อจนพ้นเกณฑ์ = เริ่มรอบแจ้งใหม่
    // เวลา/มื้ออาจเปลี่ยน → ลบรอบ pending ที่ยังไม่ถึงเวลา แล้วสร้างของวันนี้ใหม่
    await conn.query("DELETE FROM dose_logs WHERE medication_id = ? AND status = 'pending' AND scheduled_at > NOW()", [id]);
    await conn.query(GENERATE_TODAY_SQL(true, true), [id]);
    const med = await fetchOne(q, userId, id);
    med.skipped_slots_today = await skippedSlotsToday(q, id);
    return { status: 200, body: med };
  });
}

async function stop(db, userId, rawId) {
  const id = toId(rawId);
  if (!id) return notFound();
  return db.withTransaction(async (conn) => {
    const q = connQ(conn);
    const [cur] = await conn.query('SELECT is_active FROM medications WHERE id = ? AND user_id = ? FOR UPDATE', [id, userId]);
    if (!cur.length) return notFound();
    if (cur[0].is_active) {
      await conn.query('UPDATE medications SET is_active = 0, end_date = CURDATE() WHERE id = ?', [id]);
      // ลบ pending ทั้งหมด (ทั้งที่เลยเวลาแล้วและยังไม่ถึง) — คงไว้เฉพาะ taken/missed เป็นประวัติ
      await conn.query("DELETE FROM dose_logs WHERE medication_id = ? AND status = 'pending'", [id]);
    }
    return { status: 200, body: await fetchOne(q, userId, id) };
  });
}

// กลับมาใช้ยาที่หยุดไว้: สร้างรอบของวันนี้เฉพาะที่ยังไม่ถึงเวลา (SQL กลางเดิม) แล้วตอบ skipped_slots_today
async function resume(db, userId, rawId) {
  const id = toId(rawId);
  if (!id) return notFound();
  return db.withTransaction(async (conn) => {
    const q = connQ(conn);
    const [cur] = await conn.query('SELECT is_active FROM medications WHERE id = ? AND user_id = ? FOR UPDATE', [id, userId]);
    if (!cur.length) return notFound();
    if (!cur[0].is_active) {
      await conn.query('UPDATE medications SET is_active = 1, end_date = NULL WHERE id = ?', [id]);
      await conn.query(GENERATE_TODAY_SQL(true, true), [id]);
    }
    const med = await fetchOne(q, userId, id);
    med.skipped_slots_today = await skippedSlotsToday(q, id);
    return { status: 200, body: med };
  });
}

// ข้อความ error ของจำนวนที่เติม (null = ใช้ได้)
const refillQtyError = (qty) =>
  (typeof qty !== 'number' || !Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY)
    ? 'จำนวนยาที่เติม (qty) ต้องเป็นตัวเลขมากกว่า 0 และไม่เกิน ' + MAX_QTY : null;

// เติมจำนวนยาใน transaction ที่เปิดไว้แล้ว → { ok:true, med } | { ok:false, status, body } (ผู้เรียกต้อง rollback เองเมื่อ ok:false)
async function refillInTx(conn, userId, id, qty) {
  const q = connQ(conn);
  const [cur] = await conn.query('SELECT total_qty, remaining_qty FROM medications WHERE id = ? AND user_id = ? FOR UPDATE', [id, userId]);
  if (!cur.length) return { ok: false, ...notFound() };
  const r = Math.round(((cur[0].remaining_qty || 0) + qty) * 100) / 100;
  const t = Math.round(((cur[0].total_qty || 0) + qty) * 100) / 100;
  if (r > MAX_QTY || t > MAX_QTY) return { ok: false, ...err(400, 'VALIDATION', 'จำนวนยารวมเกินที่ระบบรองรับ (' + MAX_QTY + ')') };
  await conn.query('UPDATE medications SET remaining_qty = ?, total_qty = ? WHERE id = ?', [r, t, id]);
  await stock.resetRecovered(q, process.env, id);   // ล้างการจอง "แจ้งใกล้หมดแล้ว" เฉพาะเมื่อเติมจนพ้นเกณฑ์
  return { ok: true, med: await fetchOne(q, userId, id) };
}

async function refill(db, userId, rawId, body) {
  const id = toId(rawId);
  if (!id) return notFound();
  const bad = refillQtyError(body && body.qty);
  if (bad) return err(400, 'VALIDATION', bad);
  return db.withTransaction(async (conn) => {
    const r = await refillInTx(conn, userId, id, body.qty);
    return r.ok ? { status: 200, body: r.med } : { status: r.status, body: r.body };
  });
}

// ---------------- เวลามื้อ ----------------
const toHM = (t) => String(t).slice(0, 5);

function shapeSlotTimes(rows) {
  const out = {};
  for (const s of SLOTS) { const r = (rows || []).find((x) => x.slot === s); if (r) out[s] = toHM(r.slot_time); }
  return { status: 200, body: out };
}

// ---------------- ย้ายรอบวันนี้เมื่อเปลี่ยนเวลามื้อ ----------------
// กฎ: ยา 1 ตัวมีได้ไม่เกิน 1 dose ต่อ (มื้อ, วัน) → "ย้าย" แถวเดิม ไม่สร้างแถวใหม่
//  - เฉพาะ status='pending' (ไม่ว่าเตือนแล้วหรือยัง) ; taken/missed ไม่ย้าย ; มื้อที่มี dose taken/missed วันนี้ → ไม่แตะรอบอื่นของมื้อนั้น
//  - เวลาใหม่ > now : ล้าง reminded_at + followup_at (เตือนใหม่ที่เวลาใหม่) ; เวลาใหม่ <= now : คง reminded_at (เตือนไปแล้ว ไม่เตือนซ้ำ)
//  - เวลาไม่เปลี่ยน = ไม่แตะอะไร (ไม่ล้าง reminded_at) ; escalated_at และ dose_escalations คงเดิม (ไม่แจ้งญาติซ้ำ)
// rows = dose_logs ของวันนี้ทุกสถานะ { id, medication_id, slot, status, scheduled_at 'YYYY-MM-DD HH:MM:SS' } ; times = { morning:'HH:MM', … } ; now = 'YYYY-MM-DD HH:MM:SS'
// คืน [{ id, to, clear }] — ฟังก์ชันล้วน ทดสอบด้วย node --test
function planSlotMoves(rows, times, now) {
  const groups = new Map();
  for (const r of rows) {
    const k = r.medication_id + '|' + r.slot;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const moves = [];
  for (const g of groups.values()) {
    // ข้อมูลเก่าที่ซ้ำ (มี taken/missed หรือ pending > 1 แถวในมื้อเดียว) ไม่เดา — ปล่อยให้ scripts/fix-duplicate-doses.mjs จัดการ
    if (g.length !== 1 || g[0].status !== 'pending') continue;
    const r = g[0];
    const t = times[r.slot];
    if (!t) continue;
    const to = String(r.scheduled_at).slice(0, 10) + ' ' + t + ':00';
    if (to === String(r.scheduled_at).slice(0, 19)) continue;
    moves.push({ id: r.id, to, clear: to > now });
  }
  return moves;
}

async function moveTodayDoses(conn, userId, times) {
  const [rows] = await conn.query(
    "SELECT id, medication_id, slot, status, DATE_FORMAT(scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at, DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS now_ts " +
    'FROM dose_logs WHERE user_id = ? AND DATE(scheduled_at) = CURDATE() FOR UPDATE', [userId]);
  if (!rows.length) return [];
  const moves = planSlotMoves(rows, times, rows[0].now_ts);
  if (!moves.length) return moves;
  // ย้ายสองจังหวะผ่านปี +100 เพื่อไม่ให้ชน UNIQUE(medication_id, scheduled_at) ระหว่างย้าย (เช่น เช้า 08:00→12:00 ขณะที่แถวกลางวันเดิมคือ 12:00)
  await conn.query('UPDATE dose_logs SET scheduled_at = scheduled_at + INTERVAL 100 YEAR WHERE id IN (?)', [moves.map((m) => m.id)]);
  for (const m of moves) {
    await conn.query(
      'UPDATE dose_logs SET scheduled_at = ?' + (m.clear ? ', reminded_at = NULL, followup_at = NULL' : '') + ' WHERE id = ?', [m.to, m.id]);
  }
  return moves;
}

async function putSlotTimes(db, userId, body) {
  const hm = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const labels = { morning: 'เช้า', noon: 'กลางวัน', evening: 'เย็น', bedtime: 'ก่อนนอน' };
  if (!body || typeof body !== 'object') return err(400, 'VALIDATION', 'รูปแบบข้อมูลไม่ถูกต้อง');
  for (const s of SLOTS) {
    if (typeof body[s] !== 'string' || !hm.test(body[s])) {
      return err(400, 'VALIDATION', 'เวลามื้อ' + labels[s] + ' ต้องอยู่ในรูปแบบ HH:MM (00:00–23:59)');
    }
  }
  for (let i = 1; i < SLOTS.length; i++) {
    if (body[SLOTS[i]] <= body[SLOTS[i - 1]]) {
      return err(400, 'VALIDATION', 'เวลาต้องเรียงจากเช้า < กลางวัน < เย็น < ก่อนนอน (มื้อ' + labels[SLOTS[i]] + 'ต้องหลังมื้อ' + labels[SLOTS[i - 1]] + ')');
    }
  }
  try {
    await db.withTransaction(async (conn) => {
      for (const s of SLOTS) {
        await conn.query(
          'INSERT INTO user_slot_times (user_id, slot, slot_time) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE slot_time = VALUES(slot_time)',
          [userId, s, body[s] + ':00']);
      }
      await moveTodayDoses(conn, userId, body);
    });
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') return err(409, 'SLOT_CONFLICT', 'เวลาใหม่ชนกับรอบอื่นของยาตัวเดียวกันที่มีอยู่แล้วของวันนี้ กรุณาเลือกเวลาอื่น');
    throw e;
  }
  const q = slotTimesQuery(userId);
  return shapeSlotTimes(await db.query(q.sql, q.params));
}

module.exports = {
  listQuery, shapeList, getQuery, shapeOne, slotTimesQuery, shapeSlotTimes,
  create, createInTx, update, stop, resume, refill, refillInTx, refillQtyError, putSlotTimes, planSlotMoves, _moveTodayDoses: moveTodayDoses, GENERATE_TODAY_SQL
};
