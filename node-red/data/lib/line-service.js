// logic เชื่อมบัญชี LINE (วันที่ 6A): ตรวจ signature, รหัส 6 หลัก, event ของ webhook
// ไฟล์นี้ไม่เรียก LINE เอง — รับ client (lib/line-client.js) เข้ามา ; แก้แล้วต้อง docker compose restart nodered
const crypto = require('crypto');
const doseService = require('./dose-service');
const lineFlex = require('./line-flex');
const M = require('./line-messages');
const escalation = require('./escalation-service');

const CODE_TTL_MIN = 10;
const GUESS_MAX = 5;
const GUESS_WINDOW_MS = 10 * 60 * 1000;
const DEDUP_TTL_MS = 10 * 60 * 1000;

const err = (status, error, details) => ({ status, body: { error, details } });

// ---------- signature ----------
// HMAC-SHA256(raw body, channel secret) เป็น base64 ; ความยาวไม่เท่าห้าม throw (timingSafeEqual จะ throw)
function verifySignature(rawBuf, header, secret) {
  if (!secret || !header || typeof header !== 'string' || !Buffer.isBuffer(rawBuf)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBuf).digest();
  const given = Buffer.from(header, 'base64');
  // Buffer.from ละเว้นตัวอักษรหลัง '=' → ต้องเข้ารหัสกลับแล้วตรงกับ header เป๊ะ (กันส่วนเกินต่อท้าย)
  if (given.length !== expected.length || given.toString('base64') !== header) return false;
  return crypto.timingSafeEqual(given, expected);
}

// ---------- รหัส ----------
function randomCode(randomInt = crypto.randomInt) {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}
const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
// "482 913" / "482-913" / "๔๘๒๙๑๓" → "482913" ; ไม่ใช่เลข 6 หลักล้วน → null
function parseCode(text) {
  if (typeof text !== 'string') return null;
  const s = text.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d))).replace(/[\s\-–—. ​]/g, '');
  return /^\d{6}$/.test(s) ? s : null;
}
const formatCode = (c) => c.slice(0, 3) + ' ' + c.slice(3);

// https://line.me/R/oaMessage/{basic id, @ → %40}/?{text}  (ตรวจกับ developers.line.biz แล้ว)
function oaMessageUrl(basicId, text) {
  if (!basicId) return null;
  return 'https://line.me/R/oaMessage/' + encodeURIComponent(String(basicId).trim()) + '/?' + encodeURIComponent(text);
}

// ---------- กัน event ซ้ำ / กันเดารหัส (เก็บใน memory ของ process; หายเมื่อ restart) ----------
function createDedup(ttlMs = DEDUP_TTL_MS) {
  const seen = new Map();
  return function isDuplicate(id, now = Date.now()) {
    if (!id) return false;
    for (const [k, t] of seen) if (now - t > ttlMs) seen.delete(k);
    if (seen.has(id)) return true;
    seen.set(id, now);
    return false;
  };
}
function createGuessLimiter(max = GUESS_MAX, windowMs = GUESS_WINDOW_MS) {
  const fails = new Map();
  const recent = (key, now) => {
    const list = (fails.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length) fails.set(key, list); else fails.delete(key);
    return list;
  };
  return {
    blocked: (key, now = Date.now()) => recent(key, now).length >= max,
    fail: (key, now = Date.now()) => { const l = recent(key, now); l.push(now); fails.set(key, l); },
    reset: (key) => fails.delete(key)
  };
}
const defaultDedup = createDedup();
const defaultLimiter = createGuessLimiter();

// ---------- ออกรหัส (ผู้ป่วย / ผู้ดูแล) ----------
// รหัสต้องไม่ซ้ำกับรหัสที่ยังไม่หมดอายุในทั้งสองตาราง ; รหัสที่หมดอายุถูกล้างก่อน (กันชน UNIQUE)
async function issueCode(db, target, opts = {}) {
  const randomInt = opts.randomInt || crypto.randomInt;
  const patient = target.kind === 'patient';
  const tbl = patient ? 'users' : 'caregivers';
  const codeCol = patient ? 'line_link_code' : 'link_code';
  const expCol = patient ? 'line_link_code_expires_at' : 'link_code_expires_at';
  const rowId = patient ? target.userId : target.caregiverId;
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode(randomInt);
    try {
      const out = await db.withTransaction(async (conn) => {
        await conn.query('UPDATE users SET line_link_code = NULL, line_link_code_expires_at = NULL WHERE line_link_code IS NOT NULL AND (line_link_code_expires_at IS NULL OR line_link_code_expires_at <= NOW())');
        await conn.query('UPDATE caregivers SET link_code = NULL, link_code_expires_at = NULL WHERE link_code IS NOT NULL AND (link_code_expires_at IS NULL OR link_code_expires_at <= NOW())');
        const [a] = await conn.query('SELECT 1 FROM users WHERE line_link_code = ? LIMIT 1', [code]);
        const [b] = await conn.query('SELECT 1 FROM caregivers WHERE link_code = ? LIMIT 1', [code]);
        if (a.length || b.length) return null;
        await conn.query(`UPDATE ${tbl} SET ${codeCol} = ?, ${expCol} = NOW() + INTERVAL ? MINUTE WHERE id = ?${patient ? '' : ' AND user_id = ?'}`,
          patient ? [code, CODE_TTL_MIN, rowId] : [code, CODE_TTL_MIN, rowId, target.userId]);
        const [r] = await conn.query(`SELECT DATE_FORMAT(${expCol}, '%Y-%m-%d %H:%i:%s') AS exp, TIMESTAMPDIFF(SECOND, NOW(), ${expCol}) AS secs FROM ${tbl} WHERE id = ?`, [rowId]);
        return { code, expires_at: r[0].exp, expires_in: Number(r[0].secs) };
      });
      if (out) return out;
    } catch (e) {
      if (!(e && e.code === 'ER_DUP_ENTRY')) throw e;   // ชนกันพอดีกับอีกคำขอ → สุ่มใหม่
    }
  }
  throw new Error('ออกรหัสไม่สำเร็จ');
}

const codeBody = (out, env) => ({ code: out.code, expires_at: out.expires_at, expires_in: out.expires_in, oa_message_url: oaMessageUrl((env || process.env).LINE_OA_BASIC_ID, out.code) });

async function patientLinkCode(db, userId, env = process.env) {
  return { status: 200, body: codeBody(await issueCode(db, { kind: 'patient', userId }), env) };
}

async function status(db, userId) {
  const rows = await db.query('SELECT line_user_id, line_display_name FROM users WHERE id = ?', [userId]);
  if (!rows.length) return err(404, 'NOT_FOUND', 'ไม่พบข้อมูลที่ต้องการ');
  return { status: 200, body: { linked: !!rows[0].line_user_id, display_name: rows[0].line_display_name || null } };
}

async function unlink(db, userId) {
  await db.query('UPDATE users SET line_user_id = NULL, line_display_name = NULL, line_link_code = NULL, line_link_code_expires_at = NULL WHERE id = ?', [userId]);
  return { status: 200, body: { linked: false } };
}

// ---------- ข้อความตอบกลับ: สร้างที่ lib/line-messages.js (Flex/text) และ lib/line-flex.js (quick reply) ----------
// สรุปยาวันนี้ของผู้ป่วย (Flex)
async function todayFlex(db, userId, env) {
  const q = doseService.todayQuery(userId, { withDue: true });
  const shaped = doseService.shapeToday(await db.query(q.sql, q.params));
  const [d] = await db.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS d");
  return M.buildToday(shaped, d.d, env);
}

// สรุป "วันนี้" ของผู้ป่วยทุกคนที่ LINE นี้เป็นผู้ดูแล (แบบย่อ ไม่แสดงชื่อยา) ; ไม่ได้ดูแลใครหรือไม่มียาของวันนี้เลย = null
async function caregiverTodayFlex(db, lineId, env) {
  const pats = await db.query('SELECT DISTINCT u.id, u.display_name FROM caregivers c JOIN users u ON u.id = c.user_id WHERE c.line_user_id = ? AND c.is_active = 1 ORDER BY u.id', [lineId]);
  if (!pats.length) return null;
  const list = [];
  for (const p of pats) {
    const q = doseService.todayQuery(p.id, { withDue: true });
    list.push({ name: p.display_name, shaped: doseService.shapeToday(await db.query(q.sql, q.params)) });
  }
  const [d] = await db.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS d");
  return M.buildCaregiverToday(list, d.d, env);
}

// ผู้ใช้ LINE คนนี้คือใคร: ผู้ป่วย (users.line_user_id) / ผู้ดูแลอย่างเดียว / ยังไม่เชื่อม ; ใช้เลือก quick reply และข้อความ
async function whoIs(db, lineId) {
  const p = await db.query('SELECT id, display_name FROM users WHERE line_user_id = ?', [lineId]);
  if (p.length) return { ctx: 'patient', userId: p[0].id, name: p[0].display_name, patients: [] };
  const c = await db.query('SELECT DISTINCT u.id, u.display_name FROM caregivers c JOIN users u ON u.id = c.user_id WHERE c.line_user_id = ? AND c.is_active = 1', [lineId]);
  if (c.length) return { ctx: 'caregiver', userId: null, name: null, patients: c.map((r) => r.display_name) };
  return { ctx: 'unlinked', userId: null, name: null, patients: [] };
}

// ---------- เชื่อมด้วยรหัส ----------
async function claimCode(db, code, lineId, getName) {
  const u = await db.query('SELECT id FROM users WHERE line_link_code = ? AND line_link_code_expires_at > NOW()', [code]);
  if (u.length) {
    const name = await getName();
    return db.withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT id, display_name FROM users WHERE id = ? AND line_link_code = ? AND line_link_code_expires_at > NOW() FOR UPDATE', [u[0].id, code]);
      if (!rows.length) return { kind: 'invalid' };
      const [other] = await conn.query('SELECT id FROM users WHERE line_user_id = ? AND id <> ?', [lineId, rows[0].id]);
      if (other.length) return { kind: 'conflict', userId: rows[0].id };   // ไม่เขียนทับ ไม่ใช้รหัสทิ้ง
      await conn.query('UPDATE users SET line_user_id = ?, line_display_name = ?, line_link_code = NULL, line_link_code_expires_at = NULL WHERE id = ?', [lineId, name, rows[0].id]);
      return { kind: 'patient', userId: rows[0].id, name };
    });
  }
  const c = await db.query('SELECT id FROM caregivers WHERE link_code = ? AND link_code_expires_at > NOW() AND is_active = 1', [code]);
  if (c.length) {
    const name = await getName();
    return db.withTransaction(async (conn) => {
      const [rows] = await conn.query(
        'SELECT c.id, c.user_id, c.escalate_after_min, u.display_name AS patient FROM caregivers c JOIN users u ON u.id = c.user_id WHERE c.id = ? AND c.link_code = ? AND c.link_code_expires_at > NOW() AND c.is_active = 1 FOR UPDATE', [c[0].id, code]);
      if (!rows.length) return { kind: 'invalid' };
      await conn.query('UPDATE caregivers SET line_user_id = ?, line_display_name = ?, link_code = NULL, link_code_expires_at = NULL WHERE id = ?', [lineId, name, rows[0].id]);
      return { kind: 'caregiver', userId: rows[0].user_id, patient: rows[0].patient, escalateAfterMin: rows[0].escalate_after_min };
    });
  }
  return { kind: 'invalid' };
}

// ---------- postback ปุ่ม "กินแล้ว" (data = a=take&d=<dose id คั่นด้วย comma>) ----------
// นับเฉพาะ dose ของผู้ป่วยที่ line_user_id ตรงกับผู้กด ; ใช้ doseService.takeInTx ตัวเดียวกับปุ่มในแอป
// a=preview = ปุ่มในข้อความตัวอย่าง (#ตัวอย่าง) ไม่บันทึกอะไร ; LINE ที่ไม่ใช่ผู้ป่วย (เช่น ผู้ดูแล) กด take → ไม่ทำอะไร
async function handlePostback(event, deps) {
  const { db, client } = deps;
  const env = deps.env || process.env;
  const lineId = event.source && event.source.userId;
  const data = event.postback && event.postback.data;
  if (!lineId || typeof data !== 'string' || data.length > 300) return;
  const p = new URLSearchParams(data);
  const action = p.get('a');
  const send = (messages, ctx, meta) => (event.replyToken ? client.reply(event.replyToken, lineFlex.withQuickReply(messages, ctx, env), { db, ...meta }) : null);
  if (action === 'preview') { await send([M.TEXT.previewNote()], 'patient', {}); return; }
  // ปุ่มของข้อความแจ้งญาติ (ผู้ดูแล) — ตรวจสิทธิ์ผู้ดูแลที่ escalation-service ; ไม่มีสิทธิ์ = แจ้งชัดเจน ไม่เงียบ
  if (action === 'cg_ack') {
    const r = await escalation.acknowledge(db, lineId, String(p.get('e') || '').split(',').filter((x) => /^\d{1,15}$/.test(x)));
    await send([r.found ? M.TEXT.cgAck() : M.TEXT.cgAckNotFound()], 'caregiver', { recipient: 'caregiver' });
    return;
  }
  if (action === 'cg_take') {
    const r = await escalation.confirmTaken(db, client, lineId, String(p.get('d') || '').split(',').filter((x) => /^\d{1,15}$/.test(x)), env);
    await send([r.noauth ? M.TEXT.cgNoAuth() : M.caregiverTakeResult(r)], 'caregiver', { recipient: 'caregiver' });
    return;
  }
  if (action !== 'take') return;
  const ids = String(p.get('d') || '').split(',').filter((x) => /^\d{1,15}$/.test(x)).slice(0, 50);
  if (!ids.length) return;
  const u = await db.query('SELECT id FROM users WHERE line_user_id = ?', [lineId]);
  if (!u.length) return;
  const userId = u[0].id;
  const r = await doseService.takeMany(db, userId, ids, 'line');
  const meta = { userId, kind: 'other' };
  if (r.taken.length) {
    const rows = await db.query(
      'SELECT m.name, m.strength FROM dose_logs d JOIN medications m ON m.id = d.medication_id WHERE d.id IN (?) AND d.user_id = ? ORDER BY d.scheduled_at, m.name, d.id', [r.taken, userId]);
    const q = doseService.todayQuery(userId, { withDue: true });
    const { slots, summary } = doseService.shapeToday(await db.query(q.sql, q.params)).body;
    // มื้อถัดไป = มื้อแรกที่ยังมียาไม่ได้กิน และไม่มีรายการที่ถึงเวลาแล้ว (ยังมาไม่ถึง)
    const next = M.timeRows(slots).find((s) => s.doses.some((d) => d.status !== 'taken') && s.doses.every((d) => d.status === 'taken' || !d.is_due));
    await send([M.buildTaken({
      names: rows.map(lineFlex.medTitle), at: r.at, taken: summary.taken, total: summary.total, next: next ? { slot: next.slot, time: next.time } : null
    }, env)], 'patient', meta);
  } else if (r.already.length) await send([M.TEXT.alreadyTaken()], 'patient', meta);
  else await send([M.TEXT.doseNotFound()], 'patient', meta);   // หาไม่เจอ / ยาถูกหยุดไปแล้ว / ไม่ใช่ของผู้ป่วยคนนี้
}

// ---------- event ----------
// deps = { db, client, env?, limiter?, isDuplicate?, handlers?: { postback(event, deps) } }  (ไม่ใส่ handlers.postback = ใช้ handlePostback ปุ่ม "กินแล้ว")
// env = ตัวแปรที่ใช้สร้างลิงก์/รูป/โหมดเดโม (PUBLIC_BASE_URL, LINE_ASSET_BASE, LINE_MASCOT_URL, DEMO_MODE) ; ไม่ใส่ = process.env
const PREVIEW_RE = /^[#＃]\s*ตัวอย่าง\s*([0-9๐-๙]*)$/;
async function handleEvent(event, deps) {
  const { db, client } = deps;
  const env = deps.env || process.env;
  const lineId = event && event.source && event.source.userId;
  if (!lineId) return;
  // ทุก reply ผ่าน send เพื่อแนบ quick reply ที่ข้อความสุดท้าย (ctx = ประเภทผู้ใช้)
  const send = (messages, ctx, meta) => (event.replyToken ? client.reply(event.replyToken, lineFlex.withQuickReply(messages, ctx, env), { db, ...meta }) : null);

  if (event.type === 'follow') {
    const who = await whoIs(db, lineId);
    await send([M.buildWelcome(who.ctx === 'patient', env)], who.ctx, { userId: who.userId, kind: 'link' });
    return;
  }
  if (event.type === 'unfollow') {
    await db.query('UPDATE users SET line_user_id = NULL, line_display_name = NULL WHERE line_user_id = ?', [lineId]);
    await db.query('UPDATE caregivers SET line_user_id = NULL, line_display_name = NULL WHERE line_user_id = ?', [lineId]);
    return;
  }
  if (event.type === 'postback') return ((deps.handlers && deps.handlers.postback) || handlePostback)(event, deps);
  if (event.type !== 'message' || !event.message || event.message.type !== 'text') return;

  const raw = event.message.text;
  const code = parseCode(raw);
  if (code) {
    const limiter = deps.limiter || defaultLimiter;
    if (limiter.blocked(lineId)) { await send([M.TEXT.tooMany()], 'unlinked', {}); return; }
    const res = await claimCode(db, code, lineId, async () => { const p = await client.getProfile(lineId); return p && p.displayName ? String(p.displayName).slice(0, 100) : null; });
    if (res.kind === 'invalid') { limiter.fail(lineId); await send([M.TEXT.invalid(CODE_TTL_MIN)], 'unlinked', {}); return; }
    limiter.reset(lineId);
    if (res.kind === 'conflict') { await send([M.TEXT.conflict()], 'unlinked', { userId: res.userId, kind: 'link' }); return; }
    if (res.kind === 'patient') { await send([M.buildLinkedPatient(res.name, env)], 'patient', { userId: res.userId, kind: 'link' }); return; }
    await send([M.buildLinkedCaregiver(res.patient, res.escalateAfterMin, env)], 'caregiver', { userId: res.userId, kind: 'link', recipient: 'caregiver' });
    return;
  }

  const cmd = String(raw).trim();
  const who = await whoIs(db, lineId);
  const meta = { userId: who.userId, kind: 'other' };

  if (cmd === 'วันนี้' || cmd === 'ยาวันนี้') {
    const msgs = [];
    if (who.ctx === 'patient') msgs.push(await todayFlex(db, who.userId, env));
    const cg = who.ctx === 'unlinked' ? null : await caregiverTodayFlex(db, lineId, env);   // เป็นผู้ดูแลด้วย → สรุปของผู้ป่วยที่ดูแล (เฉพาะยาวันนี้)
    if (cg) msgs.push(cg);
    if (!msgs.length) await send([who.ctx === 'unlinked' ? M.TEXT.notLinked() : M.TEXT.caregiverOnly(who.patients)], who.ctx, meta);
    else await send(msgs, who.ctx, meta);
    return;
  }
  if (cmd === 'วิธีใช้') { await send([M.buildWelcome(who.ctx === 'patient', env)], who.ctx, meta); return; }
  // #ตัวอย่าง n — เฉพาะ DEMO_MODE=true และผู้ป่วยที่เชื่อมแล้ว ; ข้อมูลตัวอย่างอยู่ในหน่วยความจำ ไม่เขียน DB (DEMO_MODE=false = ข้อความทั่วไป)
  const pm = PREVIEW_RE.exec(cmd);
  if (pm && env.DEMO_MODE === 'true' && who.ctx === 'patient') {
    const n = pm[1] ? Number(pm[1].replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)))) : 1;
    const page = M.buildPreviewPage(n, env);
    if (!page) { await send([M.plain(`มีตัวอย่าง 1 ถึง ${M.previewPageCount(env)} หน้าค่ะ พิมพ์ #ตัวอย่าง 1 เพื่อเริ่มดูนะคะ`)], 'patient', meta); return; }
    const out = lineFlex.withQuickReply(page.messages, 'patient', env);
    if (page.page < page.pages) out[out.length - 1].quickReply.items.push(lineFlex.qrMessage(`➡️ #ตัวอย่าง ${page.page + 1}`, `#ตัวอย่าง ${page.page + 1}`));
    if (event.replyToken) await client.reply(event.replyToken, out, { db, ...meta });
    return;
  }
  await send([M.TEXT.help()], who.ctx, meta);   // "ช่วยเหลือ" และข้อความอื่นๆ ทั้งหมด
}

// raw body (Buffer ที่ผ่านการตรวจ signature แล้ว) → events ; JSON เสีย/ไม่มี events = []
function parseBody(rawBuf) {
  try {
    const o = JSON.parse(Buffer.from(rawBuf).toString('utf8'));
    return o && Array.isArray(o.events) ? o.events : [];
  } catch (_) { return []; }
}
// ตัด event ที่เคยเห็น webhookEventId แล้วภายใน 10 นาที (LINE redelivery)
function dropDuplicates(events, isDuplicate = defaultDedup) {
  return events.filter((ev) => !(ev && ev.webhookEventId && isDuplicate(ev.webhookEventId)));
}

async function handleEvents(events, deps) {
  const isDuplicate = deps.isDuplicate || defaultDedup;
  const results = { handled: 0, duplicate: 0, failed: 0 };
  for (const ev of Array.isArray(events) ? events : []) {
    if (deps.dedup !== false && ev && ev.webhookEventId && isDuplicate(ev.webhookEventId)) { results.duplicate++; continue; }
    try { await handleEvent(ev, deps); results.handled++; }
    catch (e) { results.failed++; console.log('line_event_error type=' + (ev && ev.type) + ' msg=' + String(e.message).slice(0, 200)); }
  }
  return results;
}

module.exports = {
  verifySignature, randomCode, parseCode, formatCode, oaMessageUrl, createDedup, createGuessLimiter, parseBody, dropDuplicates,
  issueCode, codeBody, patientLinkCode, status, unlink, claimCode, handlePostback, caregiverTodayFlex, handleEvent, handleEvents, whoIs, todayFlex, CODE_TTL_MIN
};
