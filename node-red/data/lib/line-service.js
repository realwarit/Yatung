// logic เชื่อมบัญชี LINE (วันที่ 6A): ตรวจ signature, รหัส 6 หลัก, event ของ webhook
// ไฟล์นี้ไม่เรียก LINE เอง — รับ client (lib/line-client.js) เข้ามา ; แก้แล้วต้อง docker compose restart nodered
const crypto = require('crypto');
const { SLOT_LABEL, MEAL_LABEL, doseText, unitInDose } = require('./labels-th');
const doseService = require('./dose-service');

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

// ---------- ข้อความตอบกลับ (น้ำเสียง "ค่ะ/นะคะ") ----------
const text = (t) => ({ type: 'text', text: t });
const MSG = {
  welcome: () => text(
    'สวัสดีค่ะ น้องยาตรงยินดีที่ได้ดูแลเรื่องกินยาของคุณนะคะ 💊\n\n' +
    'เชื่อมบัญชีง่ายๆ 3 ขั้นตอน\n' +
    '1) เปิดแอปยาตรง ไปที่หน้า "ตั้งค่า" > "เชื่อม LINE"\n' +
    '2) กด "รับรหัสเชื่อม LINE" จะได้เลข 6 หลัก\n' +
    '3) พิมพ์เลข 6 หลักนั้นส่งมาในแชทนี้ได้เลยค่ะ'),
  patientLinked: (name) => text(`เชื่อมบัญชีสำเร็จแล้วค่ะ 🎉${name ? ' ยินดีต้อนรับคุณ ' + name : ''}\nต่อไปนี้น้องยาตรงจะเตือนเวลากินยาที่นี่นะคะ พิมพ์ "วันนี้" เพื่อดูยาของวันนี้ได้เลยค่ะ`),
  caregiverLinked: (patient) => text(`เชื่อมเป็นผู้ดูแลของคุณ ${patient} แล้วค่ะ 💚\nหากคุณ ${patient} ลืมกินยาเกินเวลาที่ตั้งไว้ น้องยาตรงจะแจ้งให้ทราบนะคะ`),
  conflict: () => text('LINE นี้เชื่อมกับบัญชีผู้ป่วยอีกบัญชีหนึ่งอยู่แล้วค่ะ จึงเชื่อมซ้ำไม่ได้\nถ้าต้องการเปลี่ยน ให้กด "ยกเลิกการเชื่อม" ในแอปของบัญชีเดิมก่อน แล้วขอรหัสใหม่นะคะ'),
  invalid: () => text('รหัสนี้ไม่ถูกต้องหรือหมดอายุแล้วค่ะ\nกรุณาเปิดแอปยาตรงแล้วกด "รับรหัสเชื่อม LINE" เพื่อขอรหัสใหม่ (ใช้ได้ ' + CODE_TTL_MIN + ' นาที) แล้วพิมพ์ส่งมาอีกครั้งนะคะ'),
  tooMany: () => text('ใส่รหัสผิดหลายครั้งแล้วค่ะ เพื่อความปลอดภัยกรุณารอสักครู่ (ประมาณ 10 นาที) แล้วลองใหม่นะคะ'),
  help: () => text(
    'น้องยาตรงช่วยอะไรได้บ้างคะ\n' +
    '• พิมพ์ "วันนี้" เพื่อดูยาของวันนี้\n' +
    '• พิมพ์เลข 6 หลักจากแอป เพื่อเชื่อมบัญชี\n' +
    '• เวลาถึงมื้อยา น้องยาตรงจะส่งข้อความเตือนมาให้ค่ะ\n\n' +
    'ข้อมูลนี้ไม่ใช่คำแนะนำทางการแพทย์ หากสงสัยเรื่องยาให้ปรึกษาแพทย์หรือเภสัชกรนะคะ'),
  notLinked: () => text('ยังไม่ได้เชื่อมบัญชีค่ะ เปิดแอปยาตรง > ตั้งค่า > เชื่อม LINE เพื่อรับรหัส 6 หลัก แล้วพิมพ์ส่งมาได้เลยนะคะ'),
  noDosesToday: () => text('วันนี้ยังไม่มีรายการยาค่ะ 🌿')
};

// สรุปยาวันนี้เป็นข้อความ (shaped = ผลของ doseService.shapeToday) ; ไม่มียา → null
function todaySummaryText(shaped) {
  const { slots, summary } = shaped.body;
  if (!summary.total) return null;
  const lines = [`ยาของวันนี้ ${summary.total} รายการ`, `กินแล้ว ${summary.taken} · รอกิน ${summary.pending}${summary.missed ? ' · พลาด ' + summary.missed : ''}`, ''];
  for (const s of slots) {
    lines.push(`มื้อ${SLOT_LABEL[s.slot]} ${s.time} น.`);
    for (const d of s.doses) {
      const mark = d.status === 'taken' ? '✓' : d.status === 'missed' ? '✗' : '•';
      const meal = MEAL_LABEL[d.meal_relation];
      lines.push(`${mark} ${d.name}${d.strength ? ' ' + d.strength : ''} ครั้งละ ${doseText(d.dose_per_time)} ${unitInDose(d.unit)}${meal ? ' · ' + meal : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
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
        'SELECT c.id, c.user_id, u.display_name AS patient FROM caregivers c JOIN users u ON u.id = c.user_id WHERE c.id = ? AND c.link_code = ? AND c.link_code_expires_at > NOW() AND c.is_active = 1 FOR UPDATE', [c[0].id, code]);
      if (!rows.length) return { kind: 'invalid' };
      await conn.query('UPDATE caregivers SET line_user_id = ?, line_display_name = ?, link_code = NULL, link_code_expires_at = NULL WHERE id = ?', [lineId, name, rows[0].id]);
      return { kind: 'caregiver', userId: rows[0].user_id, patient: rows[0].patient };
    });
  }
  return { kind: 'invalid' };
}

// ---------- event ----------
// deps = { db, client, limiter?, isDuplicate?, handlers?: { postback(event, deps) } }  (postback ไว้ให้ปุ่ม "กินแล้ว" ของ 6B)
async function handleEvent(event, deps) {
  const { db, client } = deps;
  const lineId = event && event.source && event.source.userId;
  if (!lineId) return;
  const send = (messages, meta) => (event.replyToken ? client.reply(event.replyToken, messages, { db, ...meta }) : null);

  if (event.type === 'follow') {
    const u = await db.query('SELECT id FROM users WHERE line_user_id = ?', [lineId]);
    await send([MSG.welcome()], { userId: u.length ? u[0].id : null, kind: 'link' });
    return;
  }
  if (event.type === 'unfollow') {
    await db.query('UPDATE users SET line_user_id = NULL, line_display_name = NULL WHERE line_user_id = ?', [lineId]);
    await db.query('UPDATE caregivers SET line_user_id = NULL, line_display_name = NULL WHERE line_user_id = ?', [lineId]);
    return;
  }
  if (event.type === 'postback' && deps.handlers && deps.handlers.postback) return deps.handlers.postback(event, deps);
  if (event.type !== 'message' || !event.message || event.message.type !== 'text') return;

  const raw = event.message.text;
  const code = parseCode(raw);
  if (code) {
    const limiter = deps.limiter || defaultLimiter;
    if (limiter.blocked(lineId)) { await send([MSG.tooMany()], {}); return; }
    const res = await claimCode(db, code, lineId, async () => { const p = await client.getProfile(lineId); return p && p.displayName ? String(p.displayName).slice(0, 100) : null; });
    if (res.kind === 'invalid') { limiter.fail(lineId); await send([MSG.invalid()], {}); return; }
    limiter.reset(lineId);
    if (res.kind === 'conflict') { await send([MSG.conflict()], { userId: res.userId, kind: 'link' }); return; }
    if (res.kind === 'patient') { await send([MSG.patientLinked(res.name)], { userId: res.userId, kind: 'link' }); return; }
    await send([MSG.caregiverLinked(res.patient)], { userId: res.userId, kind: 'link', recipient: 'caregiver' });
    return;
  }

  if (String(raw).trim() === 'วันนี้') {
    const u = await db.query('SELECT id FROM users WHERE line_user_id = ?', [lineId]);
    if (!u.length) { await send([MSG.notLinked()], {}); return; }
    const q = doseService.todayQuery(u[0].id);
    const summary = todaySummaryText(doseService.shapeToday(await db.query(q.sql, q.params)));
    await send([summary ? text(summary) : MSG.noDosesToday()], { userId: u[0].id, kind: 'other' });
    return;
  }
  await send([MSG.help()], {});
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
  issueCode, codeBody, patientLinkCode, status, unlink, claimCode, handleEvent, handleEvents, todaySummaryText, MSG, CODE_TTL_MIN
};
