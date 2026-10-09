// logic ผู้ดูแล/ญาติ (วันที่ 6A) : CRUD + ออกรหัสเชื่อม LINE ; รับ (db, userId, …) คืน { status, body }
// ข้อมูลที่ไม่ใช่ของ userId = 404 เสมอ (ไม่ใช่ 403)
const lineService = require('./line-service');

const err = (status, error, details) => ({ status, body: { error, details } });
const notFound = () => err(404, 'NOT_FOUND', 'ไม่พบข้อมูลที่ต้องการ');
const toId = (v) => (/^\d+$/.test(String(v)) ? Number(v) : null);
const invalid = (details) => err(400, 'VALIDATION', details);

const shape = (r) => ({
  id: r.id, name: r.name, relation: r.relation || null, escalate_after_min: Number(r.escalate_after_min),
  line_linked: !!r.line_user_id, line_display_name: r.line_display_name || null
});
const COLS = 'id, name, relation, escalate_after_min, line_user_id, line_display_name';

// ตรวจ body ; partial = true (PATCH) ตรวจเฉพาะ field ที่ส่งมา ; คืน { value } หรือ { error }
function validate(body, partial) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const out = {};
  if (!partial || b.name !== undefined) {
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name) return { error: 'กรุณาใส่ชื่อผู้ดูแล' };
    if (name.length > 100) return { error: 'ชื่อผู้ดูแลยาวเกิน 100 ตัวอักษร' };
    out.name = name;
  }
  if (b.relation !== undefined) {
    if (b.relation !== null && typeof b.relation !== 'string') return { error: 'ความสัมพันธ์ต้องเป็นข้อความ' };
    const rel = b.relation == null ? '' : b.relation.trim();
    if (rel.length > 50) return { error: 'ความสัมพันธ์ยาวเกิน 50 ตัวอักษร' };
    out.relation = rel || null;
  }
  if (b.escalate_after_min !== undefined) {
    const n = b.escalate_after_min;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 10 || n > 720) return { error: 'เวลาก่อนแจ้งผู้ดูแลต้องเป็นจำนวนเต็ม 10–720 นาที' };
    out.escalate_after_min = n;
  } else if (!partial) out.escalate_after_min = 60;
  return { value: out };
}

async function list(db, userId) {
  const rows = await db.query(`SELECT ${COLS} FROM caregivers WHERE user_id = ? AND is_active = 1 ORDER BY id`, [userId]);
  return { status: 200, body: { caregivers: rows.map(shape) } };
}

async function create(db, userId, body) {
  const v = validate(body, false);
  if (v.error) return invalid(v.error);
  const [{ n }] = await db.query('SELECT COUNT(*) AS n FROM caregivers WHERE user_id = ? AND is_active = 1', [userId]);
  if (Number(n) >= 10) return invalid('เพิ่มผู้ดูแลได้ไม่เกิน 10 คน');
  const r = await db.query('INSERT INTO caregivers (user_id, name, relation, escalate_after_min) VALUES (?, ?, ?, ?)',
    [userId, v.value.name, v.value.relation ?? null, v.value.escalate_after_min]);
  const rows = await db.query(`SELECT ${COLS} FROM caregivers WHERE id = ?`, [r.insertId]);
  return { status: 201, body: shape(rows[0]) };
}

async function update(db, userId, rawId, body) {
  const id = toId(rawId);
  if (!id) return notFound();
  const v = validate(body, true);
  if (v.error) return invalid(v.error);
  const keys = Object.keys(v.value);
  if (!keys.length) return invalid('ไม่มีข้อมูลที่จะแก้ไข');
  const res = await db.query(`UPDATE caregivers SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ? AND user_id = ? AND is_active = 1`,
    [...keys.map((k) => v.value[k]), id, userId]);
  if (!res.affectedRows) {
    const ex = await db.query('SELECT id FROM caregivers WHERE id = ? AND user_id = ? AND is_active = 1', [id, userId]);   // affectedRows=0 ได้เมื่อค่าไม่เปลี่ยน
    if (!ex.length) return notFound();
  }
  const rows = await db.query(`SELECT ${COLS} FROM caregivers WHERE id = ?`, [id]);
  return { status: 200, body: shape(rows[0]) };
}

async function remove(db, userId, rawId) {
  const id = toId(rawId);
  if (!id) return notFound();
  const res = await db.query('DELETE FROM caregivers WHERE id = ? AND user_id = ?', [id, userId]);
  if (!res.affectedRows) return notFound();
  return { status: 200, body: { deleted: true } };
}

async function linkCode(db, userId, rawId, env = process.env) {
  const id = toId(rawId);
  if (!id) return notFound();
  const ex = await db.query('SELECT id FROM caregivers WHERE id = ? AND user_id = ? AND is_active = 1', [id, userId]);
  if (!ex.length) return notFound();
  const out = await lineService.issueCode(db, { kind: 'caregiver', userId, caregiverId: id });
  return { status: 200, body: lineService.codeBody(out, env) };
}

module.exports = { validate, list, create, update, remove, linkCode };
