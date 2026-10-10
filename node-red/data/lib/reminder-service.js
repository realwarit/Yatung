// ส่งเตือนกินยาทาง LINE (วันที่ 6B) : cron ทุก 1 นาที (tab 7) และปุ่ม/inject เดโมใช้ sendGroup ตัวเดียวกัน
// กฎ: จัดกลุ่มตาม (user, scheduled_at) = 1 ข้อความต่อกลุ่ม ; จอง reminded_at ก่อนส่ง (transaction + FOR UPDATE กันส่งซ้ำเมื่อรันพร้อมกัน) ;
//     REMINDER_ONLY_EMAIL_SUFFIX (เฉพาะตอนรันเทส) = แตะเฉพาะ user ที่อีเมลลงท้ายด้วยค่านี้ — กันเทสที่ชี้ LINE ปลอมไปจอง reminded_at ของผู้ใช้จริง ;
//     push ล้มเหลว (หลัง retry) = บันทึกว่าล้มเหลวแต่ไม่คืน reminded_at ; โควตา: kind=reminder หยุดที่ (cap − reserve) ดู lib/line-client.js
const lineFlex = require('./line-flex');
const { SLOT_LABEL } = require('./labels-th');

const WINDOW_MIN = 30;
const err = (status, error, details) => ({ status, body: { error, details } });

const COLS = 'd.id, d.user_id, d.slot, DATE_FORMAT(d.scheduled_at, \'%Y-%m-%d %H:%i:%s\') AS scheduled_at, d.reminded_at IS NOT NULL AS was_reminded, ' +
  'TIMESTAMPDIFF(SECOND, d.scheduled_at, NOW()) AS late_sec, ' +
  'm.name, m.strength, m.dose_per_time, m.unit, m.meal_relation, u.line_user_id';

// ตัวกรองผู้ใช้ตอนรันเทส: REMINDER_ONLY_EMAIL_SUFFIX ตั้งไว้ = เฉพาะอีเมลที่ลงท้ายด้วยค่านี้ (ไม่ตั้ง = ทุกคน)
const onlySuffix = (env) => String((env && env.REMINDER_ONLY_EMAIL_SUFFIX) || '').trim();
const likeEscape = (v) => v.replace(/[!%_]/g, (c) => '!' + c);   // ESCAPE '!' (เลี่ยง backslash ใน SQL)
function userFilter(env) {
  const suf = onlySuffix(env);
  return suf ? { sql: " AND u.email LIKE ? ESCAPE '!'", params: ['%' + likeEscape(suf)] } : { sql: '', params: [] };
}

// dose ที่ถึงเวลาเตือน: pending, ยังไม่เคยเตือน, เลยเวลามาไม่เกิน 30 นาที, ยา active และไม่ใช่ as_needed, user เชื่อม LINE แล้ว
const dueSql = (extra = '') => `SELECT ${COLS} FROM dose_logs d JOIN medications m ON m.id = d.medication_id JOIN users u ON u.id = d.user_id ` +
  "WHERE d.status = 'pending' AND d.reminded_at IS NULL AND d.scheduled_at <= NOW() AND d.scheduled_at >= NOW() - INTERVAL " + WINDOW_MIN + ' MINUTE ' +
  'AND m.is_active = 1 AND m.as_needed = 0 AND u.line_user_id IS NOT NULL' + extra + ' ORDER BY d.user_id, d.scheduled_at, m.name, d.id';
const DUE_SQL = dueSql();

// แถวเป็นกลุ่ม (user_id, scheduled_at) ตามลำดับเดิม
function groupRows(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.user_id + '|' + r.scheduled_at;
    if (!map.has(key)) map.set(key, { user_id: r.user_id, line_user_id: r.line_user_id, slot: r.slot, scheduled_at: r.scheduled_at, late_sec: Number(r.late_sec), doses: [] });
    map.get(key).doses.push({ id: r.id, name: r.name, strength: r.strength, dose_per_time: r.dose_per_time, unit: r.unit, meal_relation: r.meal_relation, was_reminded: !!Number(r.was_reminded) });
  }
  return [...map.values()];
}

// จอง reminded_at ให้ dose ที่ยัง pending และยังไม่เคยเตือน → คืน id ที่จองได้จริง (คนที่มาทีหลังจะเห็นว่าถูกจองแล้ว ได้ [])
async function claim(db, ids) {
  if (!ids.length) return [];
  return db.withTransaction(async (conn) => {
    const [rows] = await conn.query("SELECT id FROM dose_logs WHERE id IN (?) AND status = 'pending' AND reminded_at IS NULL FOR UPDATE", [ids]);
    const mine = rows.map((r) => r.id);
    if (mine.length) await conn.query('UPDATE dose_logs SET reminded_at = NOW() WHERE id IN (?) AND reminded_at IS NULL', [mine]);
    return mine;
  });
}

// ส่งเตือน 1 กลุ่ม ; opts = { claim: true (ค่าเริ่มต้น), env } ; คืน { sent, failed, doses, skipped?: 'quota'|'claimed' }
async function sendGroup(db, client, group, opts = {}) {
  const env = opts.env || process.env;
  let doses = group.doses;
  const chunks = lineFlex.chunkDoses(doses);

  const q = await client.canPush(db, 'reminder', chunks.length);
  if (!q.allowed) return { sent: 0, failed: 0, doses: doses.length, skipped: 'quota', quota: q.status };   // ไม่จอง reminded_at → ลองใหม่ได้ภายในหน้าต่าง 30 นาที

  if (opts.claim !== false) {
    const mine = new Set(await claim(db, doses.map((d) => d.id)));
    doses = doses.filter((d) => mine.has(d.id));
    if (!doses.length) return { sent: 0, failed: 0, doses: 0, skipped: 'claimed' };
  }

  let sent = 0, failed = 0;
  for (const part of lineFlex.chunkDoses(doses)) {
    const msg = lineFlex.buildReminder({ slot: group.slot, scheduled_at: group.scheduled_at, late_min: (group.late_sec || 0) / 60, doses: part }, env);
    const r = await client.push(group.line_user_id, [msg], { db, userId: group.user_id, doseLogId: part[0].id, kind: 'reminder', recipient: 'patient' });
    if (r.ok) sent++; else failed++;
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
      console.log('reminder_group_error ' + String(e.message).slice(0, 200));
    }
  }
  if (out.groups) console.log(`reminder_run groups=${out.groups} sent=${out.sent} failed=${out.failed} quota_skipped=${out.quota_skipped} claimed_by_other=${out.claimed_by_other}`);
  return out;
}

// ---------- เตือนซ้ำผู้ป่วย (REMINDER_FOLLOWUP_MIN นาที ; 0/ไม่ตั้ง = ปิด) ----------
// ส่ง Flex "เลยเวลา" ให้ผู้ป่วย 1 ครั้งต่อกลุ่มเมื่อเลยเวลามาครบ N นาที : เคยเตือนปกติแล้ว (reminded_at), ยัง pending, followup_at ว่าง,
// อยู่ในหน้าต่าง N…N+30 นาที (ระบบล่มแล้วกลับมาไม่ส่งย้อนหลังเป็นกอง) ; จอง followup_at ก่อนส่ง ; kind=reminder ใช้งบเตือนปกติ
const followupMin = (env) => { const n = Number(env && env.REMINDER_FOLLOWUP_MIN); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
const followupSql = (n, extra = '') => `SELECT ${COLS} FROM dose_logs d JOIN medications m ON m.id = d.medication_id JOIN users u ON u.id = d.user_id ` +
  "WHERE d.status = 'pending' AND d.reminded_at IS NOT NULL AND d.followup_at IS NULL " +
  `AND d.scheduled_at <= NOW() - INTERVAL ${n} MINUTE AND d.scheduled_at >= NOW() - INTERVAL ${n + WINDOW_MIN} MINUTE ` +
  'AND m.is_active = 1 AND m.as_needed = 0 AND u.line_user_id IS NOT NULL' + extra + ' ORDER BY d.user_id, d.scheduled_at, m.name, d.id';

async function claimFollowup(db, ids) {
  if (!ids.length) return [];
  return db.withTransaction(async (conn) => {
    const [rows] = await conn.query("SELECT id FROM dose_logs WHERE id IN (?) AND status = 'pending' AND followup_at IS NULL FOR UPDATE", [ids]);
    const mine = rows.map((r) => r.id);
    if (mine.length) await conn.query('UPDATE dose_logs SET followup_at = NOW() WHERE id IN (?) AND followup_at IS NULL', [mine]);
    return mine;
  });
}

async function runFollowup(db, client, env = process.env) {
  const n = followupMin(env);
  const out = { groups: 0, sent: 0, failed: 0, quota_skipped: 0, claimed_by_other: 0 };
  if (!n) return out;
  const f = userFilter(env);
  const groups = groupRows(await db.query(followupSql(n, f.sql), f.params));
  out.groups = groups.length;
  for (const g of groups) {
    try {
      const q = await client.canPush(db, 'reminder', lineFlex.chunkDoses(g.doses).length);
      if (!q.allowed) { out.quota_skipped++; continue; }
      const mine = new Set(await claimFollowup(db, g.doses.map((d) => d.id)));
      const doses = g.doses.filter((d) => mine.has(d.id));
      if (!doses.length) { out.claimed_by_other++; continue; }
      for (const part of lineFlex.chunkDoses(doses)) {
        const msg = lineFlex.buildReminder({ slot: g.slot, scheduled_at: g.scheduled_at, late_min: g.late_sec / 60, doses: part }, env, { followup: true });
        const r = await client.push(g.line_user_id, [msg], { db, userId: g.user_id, doseLogId: part[0].id, kind: 'reminder', recipient: 'patient' });
        if (r.ok) out.sent++; else out.failed++;
      }
    } catch (e) {
      out.failed++;
      console.log('followup_group_error ' + String(e.message).slice(0, 200));
    }
  }
  if (out.groups) console.log(`reminder_followup groups=${out.groups} sent=${out.sent} failed=${out.failed} quota_skipped=${out.quota_skipped}`);
  return out;
}

// โหมดเดโม: กลุ่ม pending ของวันนี้ที่ scheduled_at ใกล้เวลาปัจจุบันที่สุด (ทั้งก่อนและหลัง ; เท่ากัน = มื้อที่เร็วกว่า) ของ userId ;
// ถ้าทุกรายการในกลุ่มเคยเตือนแล้ว = ส่งซ้ำโดยไม่จอง reminded_at ; ห้ามสร้าง dose ปลอม ; หัวข้อ Flex ตามช่วงเวลา (ใกล้ถึง/ถึงเวลา/เลยเวลา)
async function remindNow(db, client, userId, env = process.env) {
  const u = await db.query('SELECT line_user_id, email FROM users WHERE id = ?', [userId]);
  if (!u.length) return err(404, 'NOT_FOUND', 'ไม่พบข้อมูลที่ต้องการ');
  const suf = onlySuffix(env);
  if (suf && !String(u[0].email).endsWith(suf)) return err(409, 'TEST_MODE_ONLY', 'กำลังรันชุดทดสอบ จึงส่งเฉพาะบัญชีทดสอบ');
  if (!u[0].line_user_id) return err(409, 'LINE_NOT_LINKED', 'ยังไม่ได้เชื่อม LINE กรุณาเชื่อม LINE ในหน้าตั้งค่าก่อนค่ะ');
  const rows = await db.query(
    `SELECT ${COLS} FROM dose_logs d JOIN medications m ON m.id = d.medication_id JOIN users u ON u.id = d.user_id ` +
    "WHERE d.user_id = ? AND DATE(d.scheduled_at) = CURDATE() AND d.status = 'pending' AND m.is_active = 1 AND m.as_needed = 0 " +
    'ORDER BY ABS(TIMESTAMPDIFF(SECOND, d.scheduled_at, NOW())), d.scheduled_at, m.name, d.id', [userId]);
  if (!rows.length) return err(409, 'NO_PENDING_DOSE', 'วันนี้ไม่มีรอบยาที่รอกินแล้วค่ะ ลองเพิ่มยา หรือกด "ยกเลิก" รอบที่กินไปแล้วในหน้าวันนี้ก่อน');
  const first = rows[0];
  const group = groupRows(rows.filter((r) => r.scheduled_at === first.scheduled_at))[0];
  const resend = group.doses.every((d) => d.was_reminded);
  const r = await sendGroup(db, client, group, { claim: !resend, env });
  if (r.skipped === 'quota') return err(429, 'LINE_QUOTA', 'โควตาข้อความ LINE ของเดือนนี้ใกล้หมดแล้ว จึงไม่ส่งเตือนเพิ่มค่ะ');
  if (r.skipped === 'claimed') return err(409, 'ALREADY_REMINDED', 'รอบนี้เพิ่งถูกส่งเตือนไปแล้วค่ะ');
  if (r.failed && !r.sent) return err(502, 'LINE_PUSH_FAILED', 'ส่งข้อความไป LINE ไม่สำเร็จ กรุณาลองใหม่ภายหลังค่ะ');
  const time = lineFlex.timeText(group.scheduled_at);
  const lateMin = group.late_sec / 60;
  const state = lineFlex.latenessState(lateMin);
  const when = state === 'soon' ? ` · อีก ${lineFlex.durationText(Math.ceil(-lateMin))} จะถึงเวลา` : state === 'overdue' ? ` · เลยเวลามา ${lineFlex.durationText(Math.floor(lateMin))}` : '';
  const message = `ส่งเตือนมื้อ${SLOT_LABEL[group.slot]} ${time} น. (${r.doses} รายการ) เข้า LINE แล้วค่ะ${when}${resend ? ' — ส่งซ้ำรอบที่เตือนไปแล้ว' : ''}`;
  return { status: 200, body: { sent: r.sent, doses: r.doses, slot: group.slot, time, resent: resend, state, late_min: Math.floor(lateMin), message } };
}

// inject ในหน้า editor: ส่งเตือนทดสอบให้บัญชีเดโม (ต้อง DEMO_MODE=true)
async function remindDemoUser(db, client, env = process.env, email = 'demo@yatung.app') {
  if (env.DEMO_MODE !== 'true') return err(404, 'NOT_FOUND', 'โหมดเดโมปิดอยู่ (DEMO_MODE ไม่ใช่ true)');
  const u = await db.query('SELECT id FROM users WHERE email = ?', [email]);
  if (!u.length) return err(404, 'NOT_FOUND', 'ไม่พบบัญชีเดโม ' + email);
  return remindNow(db, client, u[0].id, env);
}

module.exports = { run, runFollowup, followupSql, followupMin, sendGroup, remindNow, remindDemoUser, groupRows, claim, DUE_SQL, dueSql, userFilter, WINDOW_MIN };
