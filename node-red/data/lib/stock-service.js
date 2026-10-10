// ยาใกล้หมด (วันที่ 7B) — ฟังก์ชันกลางเดียวของ "ใกล้หมด" ใช้ร่วมกันทั้งเว็บ (GET /api/medications → is_low), LINE และ cron
// สูตร "พอใช้กี่วัน" อยู่ที่ SQL view v_medication_supply.days_left เท่านั้น (ไม่เขียนซ้ำที่นี่) ;
// เกณฑ์ใกล้หมด : ยาประจำ days_left ≤ medications.refill_alert_days (ต่อยา) · ยาเมื่อมีอาการ remaining_qty ≤ LOW_STOCK_QTY_PRN (ค่าเริ่มต้น 5)
// กันแจ้งซ้ำ : medications.refill_alerted_at (ตั้งตอนจองก่อนส่ง ; ล้างเมื่อยาพ้นเกณฑ์ — resetRecovered เรียกจากเติมยา/แก้ยา/undo และ cron)
// ช่องทางส่ง : LINE (kind=low_stock ใช้งบเตือนปกติ หยุดที่ cap − reserve) ; ผู้ใช้ที่ไม่ได้เชื่อม LINE ข้าม (Web Push = 7C)
const M = require('./line-messages');

const DEFAULT_PRN_QTY = 5;
const DEFAULT_NOTIFY_AT = '09:00';
const err = (status, error, details, extra = {}) => ({ status, body: { error, details, ...extra } });

function prnQty(env = process.env) {
  const n = Number(env && env.LOW_STOCK_QTY_PRN);
  return Number.isFinite(n) && n >= 0 && String(env.LOW_STOCK_QTY_PRN).trim() !== '' ? n : DEFAULT_PRN_QTY;
}
function notifyAt(env = process.env) {
  const v = String((env && env.LOW_STOCK_NOTIFY_AT) || '').trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : DEFAULT_NOTIFY_AT;
}

// row ต้องมี is_active, as_needed, remaining_qty, days_left, refill_alert_days (ค่าจาก SQL ที่เป็น string/number/boolean ก็ได้)
function isLow(row, env = process.env) {
  if (!Number(row.is_active)) return false;
  if (row.remaining_qty == null) return false;
  const remaining = Number(row.remaining_qty);
  if (Number(row.as_needed)) return remaining <= prnQty(env);
  if (row.days_left == null) return false;
  return Number(row.days_left) <= Number(row.refill_alert_days);
}

const LOW_SELECT =
  'SELECT m.id, m.user_id, m.name, m.strength, m.unit, m.as_needed, m.is_active, m.remaining_qty, m.refill_alert_days, ' +
  '(m.refill_alerted_at IS NOT NULL) AS alerted, v.days_left, u.line_user_id, u.email ' +
  'FROM medications m JOIN users u ON u.id = m.user_id LEFT JOIN v_medication_supply v ON v.medication_id = m.id ';

const likeEscape = (v) => v.replace(/[!%_]/g, (c) => '!' + c);
function userFilter(env) {
  const suf = String((env && env.REMINDER_ONLY_EMAIL_SUFFIX) || '').trim();
  return suf ? { sql: " AND u.email LIKE ? ESCAPE '!'", params: ['%' + likeEscape(suf)] } : { sql: '', params: [] };
}

// ยาที่ใกล้หมดของผู้ใช้ทุกคน (หรือ userId เดียว) เรียงตาม user, ชื่อ
async function lowRows(q, env, userId = null) {
  const f = userFilter(env);
  const rows = await q(
    LOW_SELECT + 'WHERE m.is_active = 1 AND m.remaining_qty IS NOT NULL' + (userId ? ' AND m.user_id = ?' : '') + f.sql + ' ORDER BY m.user_id, m.name, m.id',
    [...(userId ? [userId] : []), ...f.params]);
  return rows.filter((r) => isLow(r, env));
}

// ล้าง refill_alerted_at ของยาที่พ้นเกณฑ์แล้ว (เติมยาจนพ้น / แก้ปริมาณ / undo / หยุดยา) — เรียกที่ใดก็ได้ ซ้ำได้
// q = (sql, params) => Promise<rows> (db.query หรือ query ของ conn ใน transaction) ; medId ไม่ใส่ = ทุกยา
async function resetRecovered(q, env = process.env, medId = null) {
  const rows = await q(
    LOW_SELECT + 'WHERE m.refill_alerted_at IS NOT NULL' + (medId ? ' AND m.id = ?' : ''), medId ? [medId] : []);
  const ids = rows.filter((r) => !isLow(r, env)).map((r) => r.id);
  if (ids.length) await q('UPDATE medications SET refill_alerted_at = NULL WHERE id IN (?)', [ids]);
  return ids;
}

// จองก่อนส่ง : เฉพาะยาที่ยังไม่เคยแจ้ง → คืน id ที่จองได้ (รันซ้อนกัน 2 process ได้ 1 ข้อความ)
async function claim(db, ids) {
  if (!ids.length) return [];
  return db.withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT id FROM medications WHERE id IN (?) AND is_active = 1 AND refill_alerted_at IS NULL FOR UPDATE', [ids]);
    const mine = rows.map((r) => r.id);
    if (mine.length) await conn.query('UPDATE medications SET refill_alerted_at = NOW() WHERE id IN (?)', [mine]);
    return mine;
  });
}

const medOf = (r) => ({ name: r.name, strength: r.strength, unit: r.unit, remaining_qty: Number(r.remaining_qty), days_left: r.days_left == null ? null : Number(r.days_left), as_needed: !!Number(r.as_needed) });

async function pushLow(db, client, userId, lineUserId, rows, env) {
  const msg = M.buildLowStock(rows.map(medOf), env);
  const r = await client.push(lineUserId, [msg], { db, userId, kind: 'low_stock', recipient: 'patient' });
  return r.ok;
}

// cron : ส่ง 1 ข้อความต่อผู้ป่วย รวมยาที่ "เพิ่งใกล้หมด" (ยังไม่เคยแจ้งในรอบนี้) ; คืนสรุป (ไม่มีข้อมูลส่วนตัว)
async function run(db, client, env = process.env) {
  const out = { users: 0, sent: 0, failed: 0, quota_skipped: 0, claimed_by_other: 0, reset: 0 };
  out.reset = (await resetRecovered((s, p) => db.query(s, p), env)).length;
  const fresh = (await lowRows((s, p) => db.query(s, p), env)).filter((r) => !Number(r.alerted) && r.line_user_id);
  const byUser = new Map();
  for (const r of fresh) { if (!byUser.has(r.user_id)) byUser.set(r.user_id, []); byUser.get(r.user_id).push(r); }
  out.users = byUser.size;
  for (const [userId, rows] of byUser) {
    try {
      const q = await client.canPush(db, 'low_stock', 1);
      if (!q.allowed) { out.quota_skipped++; console.log(`low_stock_quota_skipped left=${q.left}`); continue; }
      const mine = new Set(await claim(db, rows.map((r) => r.id)));
      const send = rows.filter((r) => mine.has(r.id));
      if (!send.length) { out.claimed_by_other++; continue; }
      if (await pushLow(db, client, userId, rows[0].line_user_id, send, env)) out.sent++; else out.failed++;
    } catch (e) {
      out.failed++;
      console.log('low_stock_user_error ' + String(e.message).slice(0, 200));
    }
  }
  if (out.users) console.log(`low_stock_run users=${out.users} sent=${out.sent} failed=${out.failed} quota_skipped=${out.quota_skipped} claimed_by_other=${out.claimed_by_other} reset=${out.reset}`);
  return out;
}

const pad = (n) => String(n).padStart(2, '0');
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localHM = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// ถึงเวลาส่งหรือยัง : หลัง LOW_STOCK_NOTIFY_AT และวันนี้ยังไม่เคยรัน (ตัวนับอยู่ใน state ของ flow ; หายตอน restart ก็ไม่ซ้ำเพราะจองก่อนส่ง)
function isDue(now, state, env = process.env) {
  return localHM(now) >= notifyAt(env) && state.day !== localDay(now);
}

// cron ทุก 1 นาที เรียกฟังก์ชันนี้ ; คืน null ถ้ายังไม่ถึงเวลา
async function tick(db, client, env = process.env, state = {}, now = new Date()) {
  if (!isDue(now, state, env)) return null;
  const r = await run(db, client, env);
  state.day = localDay(now);   // ตั้งหลังรันสำเร็จ (ถ้า throw จะลองใหม่นาทีถัดไป)
  return r;
}

// ---------- โหมดเดโม ----------
// ส่งยาที่ใกล้หมดตอนนี้ทั้งหมดของผู้ใช้ ทันที ไม่สนเวลา : จองเฉพาะตัวที่ยังไม่เคยแจ้ง ; ถ้าแจ้งทุกตัวแล้ว → 409 ALREADY_NOTIFIED (body.force = true ส่งซ้ำ resent:true)
async function notifyNow(db, client, userId, body = {}, env = process.env) {
  const u = await db.query('SELECT line_user_id, email FROM users WHERE id = ?', [userId]);
  if (!u.length) return err(404, 'NOT_FOUND', 'ไม่พบข้อมูลที่ต้องการ');
  const suf = String((env && env.REMINDER_ONLY_EMAIL_SUFFIX) || '').trim();
  if (suf && !String(u[0].email).endsWith(suf)) return err(409, 'TEST_MODE_ONLY', 'กำลังรันชุดทดสอบ จึงส่งเฉพาะบัญชีทดสอบ');
  if (!u[0].line_user_id) return err(409, 'LINE_NOT_LINKED', 'ยังไม่ได้เชื่อม LINE กรุณาเชื่อม LINE ในหน้าตั้งค่าก่อนค่ะ');
  const rows = await lowRows((s, p) => db.query(s, p), env, userId);
  if (!rows.length) return err(409, 'NO_LOW_STOCK', 'ตอนนี้ยังไม่มียาที่ใกล้หมดค่ะ ลองลดจำนวนยาคงเหลือของยาสักตัวในหน้า "ยาของฉัน" ก่อนนะคะ');
  const force = !!(body && body.force === true);
  const fresh = rows.filter((r) => !Number(r.alerted));
  const quota = await client.quotaStatus(db);
  if (!fresh.length && !force) {
    return err(409, 'ALREADY_NOTIFIED', 'แจ้งยาใกล้หมดชุดนี้ไปแล้วค่ะ', { quota_left: quota.remaining_for_reminders, reserve: quota.reserve });
  }
  const q = await client.canPush(db, 'low_stock', 1);
  if (!q.allowed) return err(429, 'LINE_QUOTA', 'โควตาข้อความ LINE ของเดือนนี้ใกล้หมดแล้ว จึงไม่ส่งแจ้งเพิ่มค่ะ');
  if (fresh.length) await claim(db, fresh.map((r) => r.id));
  else console.log('low_stock_force user_meds=' + rows.length);
  const ok = await pushLow(db, client, userId, u[0].line_user_id, rows, env);
  if (!ok) return err(502, 'LINE_PUSH_FAILED', 'ส่งข้อความไป LINE ไม่สำเร็จ กรุณาลองใหม่ภายหลังค่ะ');
  const message = `ส่งแจ้งยาใกล้หมด ${rows.length} รายการเข้า LINE แล้วค่ะ${fresh.length ? '' : ' — ส่งซ้ำรายการที่แจ้งไปแล้ว'}`;
  return { status: 200, body: { sent: 1, meds: rows.length, resent: !fresh.length, message } };
}

// inject ในหน้า editor : แจ้งยาใกล้หมดให้บัญชีเดโม (ต้อง DEMO_MODE=true)
async function notifyDemoUser(db, client, env = process.env, email = 'demo@yatung.app') {
  if (env.DEMO_MODE !== 'true') return err(404, 'NOT_FOUND', 'โหมดเดโมปิดอยู่ (DEMO_MODE ไม่ใช่ true)');
  const u = await db.query('SELECT id FROM users WHERE email = ?', [email]);
  if (!u.length) return err(404, 'NOT_FOUND', 'ไม่พบบัญชีเดโม ' + email);
  return notifyNow(db, client, u[0].id, {}, env);
}

module.exports = { isLow, prnQty, notifyAt, lowRows, resetRecovered, claim, run, tick, isDue, notifyNow, notifyDemoUser, LOW_SELECT, DEFAULT_PRN_QTY, DEFAULT_NOTIFY_AT };
