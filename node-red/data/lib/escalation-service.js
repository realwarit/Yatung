// แจ้งญาติเมื่อลืมกินยา (วันที่ 7A) : cron ทุก 1 นาที (tab 7, ต่อจากส่งเตือน) และปุ่ม/inject เดโมใช้ sendGroup ตัวเดียวกัน
// กฎ: dose pending/missed · ยา active ไม่ใช่ as_needed · เลยเวลา ≥ escalate_after_min ของผู้ดูแลแต่ละคน · ผู้ดูแลเชื่อม LINE แล้ว · ยังไม่เคยแจ้งผู้ดูแลคนนั้นสำหรับ dose นี้ ;
//     กันส่งย้อนหลังเป็นกอง: แจ้งเฉพาะ scheduled_at ≥ NOW − (escalate_after_min + 60 นาที) ;
//     จองก่อนส่ง = INSERT IGNORE dose_escalations (UNIQUE dose+ผู้ดูแล) ใน transaction ที่ SELECT … FOR UPDATE แถว dose (รันซ้อนกันได้ 1 ข้อความ) ;
//     1 ข้อความต่อ (ผู้ดูแล, ผู้ป่วย, scheduled_at) ; โควตา kind=escalation ไปได้ถึง effective_cap ; เต็ม = log แล้วไม่ส่ง (ไม่จอง ลองใหม่ได้ในหน้าต่าง) ;
//     ผู้ป่วยกินทีหลัง (ทุกช่องทาง) → ปิดเรื่อง 1 ครั้งต่อ (ผู้ดูแล, dose) ยกเว้นคนที่กดยืนยันเอง
//     REMINDER_ONLY_EMAIL_SUFFIX (เฉพาะรันเทส) = แตะเฉพาะผู้ป่วยที่อีเมลลงท้ายด้วยค่านี้
const lineFlex = require('./line-flex');
const M = require('./line-messages');
const doseService = require('./dose-service');
const { SLOT_LABEL } = require('./labels-th');
const { userFilter } = require('./reminder-service');

const BACKFILL_EXTRA_MIN = 60;
const err = (status, error, details, extra = {}) => ({ status, body: { error, details, ...extra } });
const toIds = (raw) => [...new Set((raw || []).map((x) => (/^\d{1,15}$/.test(String(x)) ? Number(x) : null)).filter((x) => x))].slice(0, 50);

const COLS = "d.id, d.user_id, d.slot, DATE_FORMAT(d.scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at, TIMESTAMPDIFF(SECOND, d.scheduled_at, NOW()) AS late_sec, " +
  'm.name, m.strength, m.dose_per_time, m.unit, m.meal_relation, u.display_name AS patient';

// dose ที่ถึงเวลาแจ้งญาติ (ต่อผู้ดูแล) — ผู้ดูแลที่เชื่อม LINE และ active เท่านั้น
const dueSql = (extra = '') =>
  `SELECT ${COLS}, c.id AS caregiver_id, c.line_user_id AS cg_line, c.escalate_after_min ` +
  'FROM dose_logs d JOIN medications m ON m.id = d.medication_id JOIN users u ON u.id = d.user_id ' +
  'JOIN caregivers c ON c.user_id = d.user_id AND c.is_active = 1 AND c.line_user_id IS NOT NULL ' +
  'LEFT JOIN dose_escalations e ON e.dose_id = d.id AND e.caregiver_id = c.id ' +
  "WHERE d.status IN ('pending', 'missed') AND m.is_active = 1 AND m.as_needed = 0 AND e.id IS NULL " +
  'AND d.scheduled_at <= NOW() - INTERVAL c.escalate_after_min MINUTE ' +
  `AND d.scheduled_at >= NOW() - INTERVAL (c.escalate_after_min + ${BACKFILL_EXTRA_MIN}) MINUTE` + extra +
  ' ORDER BY c.id, d.user_id, d.scheduled_at, m.name, d.id';
const DUE_SQL = dueSql();

// แถว → กลุ่ม (ผู้ดูแล, ผู้ป่วย, scheduled_at) ตามลำดับเดิม
function groupRows(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.caregiver_id + '|' + r.user_id + '|' + r.scheduled_at;
    if (!map.has(key)) {
      map.set(key, {
        caregiver_id: r.caregiver_id, cg_line: r.cg_line, escalate_after_min: Number(r.escalate_after_min || 0), user_id: r.user_id, patient: r.patient,
        slot: r.slot, scheduled_at: r.scheduled_at, late_sec: Number(r.late_sec), doses: []
      });
    }
    map.get(key).doses.push({ id: r.id, name: r.name, strength: r.strength, dose_per_time: r.dose_per_time, unit: r.unit, meal_relation: r.meal_relation });
  }
  return [...map.values()];
}

// จอง (dose, ผู้ดูแล) → คืน id ของ dose ที่จองได้จริง ; dose ที่ผู้ป่วยกินไปแล้วระหว่างนั้นไม่ถูกจอง
async function claim(db, group) {
  return db.withTransaction(async (conn) => {
    const [rows] = await conn.query("SELECT id FROM dose_logs WHERE id IN (?) AND status IN ('pending', 'missed') FOR UPDATE", [group.doses.map((d) => d.id)]);
    const mine = [];
    for (const r of rows) {
      const [res] = await conn.query('INSERT IGNORE INTO dose_escalations (dose_id, caregiver_id, user_id) VALUES (?, ?, ?)', [r.id, group.caregiver_id, group.user_id]);
      if (res.affectedRows === 1) mine.push(r.id);
    }
    if (mine.length) await conn.query('UPDATE dose_logs SET escalated_at = COALESCE(escalated_at, NOW()) WHERE id IN (?)', [mine]);   // undo อ่านค่านี้ (กลับเป็น missed ไม่ใช่ pending)
    return mine;
  });
}

// ส่งแจ้งญาติ 1 กลุ่ม ; opts = { claim: true (ค่าเริ่มต้น), env } ; คืน { sent, failed, doses, skipped?: 'quota'|'claimed' }
async function sendGroup(db, client, group, opts = {}) {
  const env = opts.env || process.env;
  let doses = group.doses;
  const q = await client.canPush(db, 'escalation', lineFlex.chunkDoses(doses, M.cgTakeData).length);
  if (!q.allowed) {
    console.log(`escalation_quota_skipped left=${q.left}`);   // โควตาเต็ม: log แล้วไม่ส่ง ไม่จอง
    return { sent: 0, failed: 0, doses: doses.length, skipped: 'quota', quota: q.status };
  }
  if (opts.claim !== false) {
    const mine = new Set(await claim(db, group));
    doses = doses.filter((d) => mine.has(d.id));
    if (!doses.length) return { sent: 0, failed: 0, doses: 0, skipped: 'claimed' };
  }
  const esc = await db.query('SELECT id, dose_id FROM dose_escalations WHERE caregiver_id = ? AND dose_id IN (?)', [group.caregiver_id, doses.map((d) => d.id)]);
  const escOf = new Map(esc.map((e) => [Number(e.dose_id), e.id]));
  let sent = 0, failed = 0;
  for (const part of lineFlex.chunkDoses(doses, M.cgTakeData)) {
    const msg = M.buildEscalation({
      patient: group.patient, slot: group.slot, scheduled_at: group.scheduled_at, late_min: (group.late_sec || 0) / 60,
      doses: part, escalation_ids: part.map((d) => escOf.get(Number(d.id))).filter((x) => x)
    }, env);
    const r = await client.push(group.cg_line, [msg], { db, userId: group.user_id, doseLogId: part[0].id, kind: 'escalation', recipient: 'caregiver' });
    if (r.ok) sent++;
    else {
      failed++;
      await db.query("UPDATE dose_escalations SET status = 'failed' WHERE caregiver_id = ? AND dose_id IN (?)", [group.caregiver_id, part.map((d) => d.id)]);   // ไม่คืนการจอง (ไม่ส่งซ้ำรัวๆ)
    }
  }
  return { sent, failed, doses: doses.length };
}

// cron ทุก 1 นาที ; คืนสรุป (ไม่มีข้อมูลส่วนตัว)
async function run(db, client, env = process.env) {
  const f = userFilter(env);
  const groups = groupRows(await db.query(dueSql(f.sql), f.params));
  const out = { groups: groups.length, sent: 0, failed: 0, quota_skipped: 0, claimed_by_other: 0 };
  for (const g of groups) {
    try {
      const r = await sendGroup(db, client, g, { env });
      out.sent += r.sent; out.failed += r.failed;
      if (r.skipped === 'quota') out.quota_skipped++;
      if (r.skipped === 'claimed') out.claimed_by_other++;
    } catch (e) {
      out.failed++;
      console.log('escalation_group_error ' + String(e.message).slice(0, 200));
    }
  }
  if (out.groups) console.log(`escalation_run groups=${out.groups} sent=${out.sent} failed=${out.failed} quota_skipped=${out.quota_skipped} claimed_by_other=${out.claimed_by_other}`);
  return out;
}

// ---------- ผู้ดูแลกดปุ่มใน LINE ----------
// "รับทราบ" : escIds = dose_escalations.id ; ต้องเป็นของ LINE นี้เท่านั้น → { found }
async function acknowledge(db, lineId, rawIds) {
  const ids = toIds(rawIds);
  if (!ids.length) return { found: 0 };
  const rows = await db.query('SELECT e.id FROM dose_escalations e JOIN caregivers c ON c.id = e.caregiver_id WHERE e.id IN (?) AND c.line_user_id = ?', [ids, lineId]);
  if (!rows.length) return { found: 0 };
  await db.query('UPDATE dose_escalations SET acknowledged_at = COALESCE(acknowledged_at, NOW()) WHERE id IN (?)', [rows.map((r) => r.id)]);
  return { found: rows.length };
}

// "ยืนยันว่ากินแล้ว" : ต้องเป็นผู้ดูแล (active) ของผู้ป่วยเจ้าของ dose จริง ; โดยไม่มีสิทธิ์เลย → { noauth: true } (ผู้เรียกต้องแจ้งผู้กด ไม่ใช่เงียบ)
// → { noauth, taken: [{ name, slot }], already: [{ name, slot, at, by }], unauthorized }
async function confirmTaken(db, client, lineId, rawIds, env = process.env) {
  const ids = toIds(rawIds);
  const rows = ids.length ? await db.query(
    'SELECT d.id, d.user_id, d.slot, u.display_name AS patient, MIN(c.id) AS caregiver_id FROM dose_logs d JOIN users u ON u.id = d.user_id ' +
    'JOIN caregivers c ON c.user_id = d.user_id AND c.is_active = 1 AND c.line_user_id = ? WHERE d.id IN (?) GROUP BY d.id, d.user_id, d.slot, u.display_name',
    [lineId, ids]) : [];
  const out = { noauth: false, taken: [], already: [], unauthorized: ids.length - rows.length };
  if (!rows.length) { out.noauth = true; return out; }
  const byUser = new Map();
  for (const r of rows) { if (!byUser.has(r.user_id)) byUser.set(r.user_id, []); byUser.get(r.user_id).push(r); }
  const allTaken = [];
  for (const [userId, list] of byUser) {
    const r = await doseService.takeMany(db, userId, list.map((x) => x.id), 'caregiver', { noHook: true });
    const meta = new Map(list.map((x) => [Number(x.id), x]));
    const seen = new Set();
    for (const id of r.taken) {
      const x = meta.get(Number(id));
      if (seen.has(x.slot)) continue;
      seen.add(x.slot); out.taken.push({ name: x.patient, slot: x.slot });
    }
    for (const a of r.already_info || []) {
      const x = meta.get(Number(a.id));
      if (seen.has('a' + a.slot)) continue;
      seen.add('a' + a.slot); out.already.push({ name: x.patient, slot: a.slot, at: a.at, by: a.source === 'caregiver' ? 'caregiver' : 'self' });
    }
    // ผู้ดูแลที่ใช้ LINE นี้ทั้งหมดของผู้ป่วยคนนี้ : taken = ยืนยัน, already = รับทราบ
    const cgIds = (await db.query('SELECT id FROM caregivers WHERE user_id = ? AND line_user_id = ?', [userId, lineId])).map((c) => c.id);
    if (r.taken.length) await db.query('UPDATE dose_escalations SET confirmed_at = COALESCE(confirmed_at, NOW()), acknowledged_at = COALESCE(acknowledged_at, NOW()) WHERE dose_id IN (?) AND caregiver_id IN (?)', [r.taken, cgIds]);
    if (r.already.length) await db.query('UPDATE dose_escalations SET acknowledged_at = COALESCE(acknowledged_at, NOW()) WHERE dose_id IN (?) AND caregiver_id IN (?)', [r.already, cgIds]);
    allTaken.push(...r.taken);
  }
  if (allTaken.length) await notifyResolved(db, client, allTaken, env).catch((e) => console.log('escalation_resolved_error ' + String(e.message).slice(0, 200)));   // บอกญาติคนอื่นที่ถูกแจ้งไว้
  return out;
}

// ---------- ปิดเรื่อง ----------
// ผู้ป่วยกิน (ทุกช่องทาง) หลังที่แจ้งญาติไปแล้ว → push บอกญาติที่ถูกแจ้งไว้ 1 ครั้งต่อ (ผู้ดูแล, dose) ; ข้ามคนที่กดยืนยันเอง (confirmed_at) ; จองก่อนส่ง
async function notifyResolved(db, client, doseIds, env = process.env) {
  const ids = toIds(doseIds);
  if (!ids.length) return { groups: 0, sent: 0 };
  const rows = await db.query(
    "SELECT e.id, e.caregiver_id, e.user_id, c.line_user_id AS cg_line, d.id AS dose_id, d.slot, DATE_FORMAT(d.scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at, DATE_FORMAT(d.taken_at, '%H:%i') AS taken_hm, d.source, u.display_name AS patient " +
    'FROM dose_escalations e JOIN caregivers c ON c.id = e.caregiver_id AND c.is_active = 1 AND c.line_user_id IS NOT NULL ' +
    'JOIN dose_logs d ON d.id = e.dose_id JOIN users u ON u.id = e.user_id ' +
    "WHERE e.dose_id IN (?) AND e.status = 'sent' AND e.resolved_notified_at IS NULL AND e.confirmed_at IS NULL AND d.status = 'taken' ORDER BY e.caregiver_id, d.scheduled_at, e.id", [ids]);
  const map = new Map();
  for (const r of rows) {
    const key = r.caregiver_id + '|' + r.user_id + '|' + r.scheduled_at;
    if (!map.has(key)) map.set(key, { caregiver_id: r.caregiver_id, cg_line: r.cg_line, user_id: r.user_id, patient: r.patient, slot: r.slot, scheduled_at: r.scheduled_at, esc: [], doses: [], at: r.taken_hm, source: r.source, first_dose: r.dose_id });
    map.get(key).esc.push(r.id);
    map.get(key).doses.push(r.dose_id);
  }
  const out = { groups: map.size, sent: 0 };
  for (const g of map.values()) {
    const q = await client.canPush(db, 'escalation', 1);
    if (!q.allowed) { console.log(`escalation_quota_skipped kind=resolved left=${q.left}`); continue; }
    const mine = await db.withTransaction(async (conn) => {
      const [sel] = await conn.query('SELECT id FROM dose_escalations WHERE id IN (?) AND resolved_notified_at IS NULL AND confirmed_at IS NULL FOR UPDATE', [g.esc]);
      const m = sel.map((x) => x.id);
      if (m.length) await conn.query('UPDATE dose_escalations SET resolved_notified_at = NOW() WHERE id IN (?)', [m]);
      return m;
    });
    if (!mine.length) continue;
    const r = await client.push(g.cg_line, [M.buildEscalationResolved(g, env)], { db, userId: g.user_id, doseLogId: g.first_dose, kind: 'escalation', recipient: 'caregiver' });
    if (r.ok) out.sent++;
  }
  return out;
}

// ---------- ประวัติสำหรับหน้า Settings ----------
// คืน Map caregiver_id → [{ sent_at, scheduled_at, slot, time, doses, outcome: 'confirmed'|'acknowledged'|'none'|'failed' }] ล่าสุด 5 กลุ่มต่อผู้ดูแล
async function recentFor(db, caregiverIds, limit = 5) {
  const out = new Map();
  if (!caregiverIds.length) return out;
  const rows = await db.query(
    "SELECT e.caregiver_id, DATE_FORMAT(MIN(e.sent_at), '%Y-%m-%d %H:%i:%s') AS sent_at, d.slot, DATE_FORMAT(d.scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at, COUNT(*) AS doses, " +
    'MAX(e.confirmed_at IS NOT NULL) AS confirmed, MAX(e.acknowledged_at IS NOT NULL) AS acked, MAX(e.status = \'sent\') AS delivered ' +
    'FROM dose_escalations e JOIN dose_logs d ON d.id = e.dose_id WHERE e.caregiver_id IN (?) GROUP BY e.caregiver_id, d.scheduled_at, d.slot ORDER BY MIN(e.sent_at) DESC, d.scheduled_at DESC', [caregiverIds]);
  for (const r of rows) {
    if (!out.has(r.caregiver_id)) out.set(r.caregiver_id, []);
    const list = out.get(r.caregiver_id);
    if (list.length >= limit) continue;
    const outcome = Number(r.confirmed) ? 'confirmed' : Number(r.acked) ? 'acknowledged' : !Number(r.delivered) ? 'failed' : 'none';
    list.push({ sent_at: r.sent_at, scheduled_at: r.scheduled_at, slot: r.slot, time: String(r.scheduled_at).slice(11, 16), doses: Number(r.doses), outcome });
  }
  return out;
}

// ---------- โหมดเดโม ----------
// กลุ่ม pending ของวันนี้ที่ scheduled_at ใกล้เวลาปัจจุบันที่สุด แจ้งผู้ดูแลที่เชื่อม LINE ทุกคนทันที (ข้าม escalate_after_min ; ยังจองก่อนส่ง)
// ถ้าแจ้งผู้ดูแลทุกคนไปแล้ว: 409 ALREADY_ESCALATED ; body.force = true → ส่งซ้ำโดยไม่จอง (resent: true) และ log
async function escalateNow(db, client, userId, body = {}, env = process.env) {
  const u = await db.query('SELECT email FROM users WHERE id = ?', [userId]);
  if (!u.length) return err(404, 'NOT_FOUND', 'ไม่พบข้อมูลที่ต้องการ');
  const suf = String((env && env.REMINDER_ONLY_EMAIL_SUFFIX) || '').trim();
  if (suf && !String(u[0].email).endsWith(suf)) return err(409, 'TEST_MODE_ONLY', 'กำลังรันชุดทดสอบ จึงส่งเฉพาะบัญชีทดสอบ');
  const force = !!(body && body.force === true);
  const cgs = await db.query('SELECT id, line_user_id, escalate_after_min FROM caregivers WHERE user_id = ? AND is_active = 1 AND line_user_id IS NOT NULL ORDER BY id', [userId]);
  if (!cgs.length) return err(409, 'NO_CAREGIVER_LINKED', 'ยังไม่มีญาติ/ผู้ดูแลที่เชื่อม LINE ค่ะ เพิ่มญาติและส่งรหัสให้เชื่อม LINE ก่อนนะคะ');
  const rows = await db.query(
    `SELECT ${COLS} FROM dose_logs d JOIN medications m ON m.id = d.medication_id JOIN users u ON u.id = d.user_id ` +
    "WHERE d.user_id = ? AND DATE(d.scheduled_at) = CURDATE() AND d.status = 'pending' AND m.is_active = 1 AND m.as_needed = 0 " +
    'ORDER BY ABS(TIMESTAMPDIFF(SECOND, d.scheduled_at, NOW())), d.scheduled_at, m.name, d.id', [userId]);
  if (!rows.length) return err(409, 'NO_PENDING_DOSE', 'วันนี้ไม่มีรอบยาที่รอกินแล้วค่ะ ลองเพิ่มยา หรือกด "ยกเลิก" รอบที่กินไปแล้วในหน้าวันนี้ก่อน');
  const first = rows[0];
  const sel = rows.filter((r) => r.scheduled_at === first.scheduled_at);
  const ids = sel.map((r) => r.id);
  const already = new Set((await db.query('SELECT caregiver_id, dose_id FROM dose_escalations WHERE dose_id IN (?)', [ids])).map((e) => e.caregiver_id + '|' + e.dose_id));
  const done = (cg) => ids.every((id) => already.has(cg.id + '|' + id));
  const quota = await client.quotaStatus(db);
  if (!force && cgs.every(done)) {
    return err(409, 'ALREADY_ESCALATED', 'แจ้งญาติรอบนี้ไปแล้วค่ะ', { quota_left: quota.remaining_for_escalation, reserve: quota.reserve });
  }
  let sent = 0, failed = 0, quotaSkipped = 0, resent = false, doses = 0;
  for (const cg of cgs) {
    const g = groupRows(sel.map((r) => ({ ...r, caregiver_id: cg.id, cg_line: cg.line_user_id, escalate_after_min: cg.escalate_after_min })))[0];
    // เดโมข้ามเวลารอ แต่การ์ดแสดงเวลาที่เลยมาจริง (now − scheduled_at) ; ยังไม่ถึงเวลา = "ใกล้ถึงเวลา"
    const resend = done(cg);
    if (resend && !force) continue;
    if (resend) { resent = true; console.log('escalate_force caregiver_id=' + cg.id + ' doses=' + ids.length); }
    const r = await sendGroup(db, client, g, { claim: !resend, env });
    sent += r.sent; failed += r.failed; doses = Math.max(doses, r.doses);
    if (r.skipped === 'quota') quotaSkipped++;
  }
  if (quotaSkipped && !sent) return err(429, 'LINE_QUOTA', 'โควตาข้อความ LINE ของเดือนนี้หมดแล้ว จึงแจ้งญาติเพิ่มไม่ได้ค่ะ');
  if (failed && !sent) return err(502, 'LINE_PUSH_FAILED', 'ส่งข้อความไป LINE ไม่สำเร็จ กรุณาลองใหม่ภายหลังค่ะ');
  const time = lineFlex.timeText(first.scheduled_at);
  const message = `แจ้งญาติ ${cgs.length} คน เรื่องมื้อ${SLOT_LABEL[first.slot]} ${time} น. (${ids.length} รายการ) เข้า LINE แล้วค่ะ${resent ? ' — ส่งซ้ำรอบที่แจ้งไปแล้ว' : ''}`;
  return { status: 200, body: { sent, caregivers: cgs.length, doses: ids.length, slot: first.slot, time, resent, message } };
}

// inject ในหน้า editor: แจ้งญาติทดสอบให้บัญชีเดโม (ต้อง DEMO_MODE=true)
async function escalateDemoUser(db, client, env = process.env, email = 'demo@yatung.app') {
  if (env.DEMO_MODE !== 'true') return err(404, 'NOT_FOUND', 'โหมดเดโมปิดอยู่ (DEMO_MODE ไม่ใช่ true)');
  const u = await db.query('SELECT id FROM users WHERE email = ?', [email]);
  if (!u.length) return err(404, 'NOT_FOUND', 'ไม่พบบัญชีเดโม ' + email);
  return escalateNow(db, client, u[0].id, {}, env);
}

module.exports = { run, sendGroup, claim, groupRows, acknowledge, confirmTaken, notifyResolved, recentFor, escalateNow, escalateDemoUser, DUE_SQL, dueSql, BACKFILL_EXTRA_MIN };
