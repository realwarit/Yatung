// Web Push (วันที่ 7C) — ส่งแจ้งเตือนไปเครื่องของผู้ใช้ที่ "แจ้งเตือนบนเครื่องนี้" ไว้ (ไม่นับโควตา LINE)
//   - subscription: upsert ตาม endpoint (endpoint เคยเป็นของ user อื่น = ย้ายมาเป็นของ user ปัจจุบัน) ; endpoint ต้องเป็น https ของผู้ให้บริการ push ที่รู้จัก (กัน SSRF)
//   - ส่ง: TTL 1 ชม., urgency high ; 404/410 = ลบ subscription ; error อื่น = fail_count+1 ; ทุกครั้งบันทึก notification_logs (channel=web_push)
//   - payload ห้ามมีชื่อยา/ข้อมูลสุขภาพ (เห็นบนหน้าจอล็อก) : มีแค่ชื่อมื้อ + จำนวนรายการ
//   - ปุ่ม "✓ กินแล้ว": service worker ไม่มี JWT จึงใช้ action token (HMAC-SHA256, ผูก user + dose ids, อายุ 12 ชม.)
//     ngsw ทำ sendRequest ได้แค่ GET → ปุ่มเปิด /today#take=<token> (fragment ไม่ไปถึงเซิร์ฟเวอร์/access log) แล้วแอปเรียก POST /api/push/take เอง (ดู docs/day7-plan.md คำถามข้อ 1-A)
//   - log: status/จำนวน/สาเหตุสั้นๆ เท่านั้น — ห้าม log endpoint เต็ม, คีย์, JWT, payload
const crypto = require('crypto');
const { SLOT_LABEL } = require('./labels-th');

const TTL_SECONDS = 3600;
const TOKEN_TTL_SECONDS = 12 * 3600;
const MAX_TOKEN_IDS = 50;
const ICON = '/icons/icon-192x192.png';
const BADGE = '/icons/badge-96.png';
const err = (status, error, details, extra = {}) => ({ status, body: { error, details, ...extra } });

// ---------- action token ----------
const b64u = (buf) => Buffer.from(buf).toString('base64url');
function tokenKey(secret) { return crypto.createHmac('sha256', String(secret)).update('push-take').digest(); }
const sign = (secret, body) => b64u(crypto.createHmac('sha256', tokenKey(secret)).update(body).digest());

// token = base64url("uid.id1-id2-….exp") + "." + base64url(HMAC)
function signActionToken(secret, { uid, ids, exp }) {
  if (!secret) throw new Error('JWT_SECRET ไม่ได้ตั้ง');
  const clean = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_TOKEN_IDS);
  const body = b64u(`${Number(uid)}.${clean.join('-')}.${Math.floor(exp)}`);
  return body + '.' + sign(secret, body);
}
const newActionToken = (secret, uid, ids, nowSec = Math.floor(Date.now() / 1000)) => signActionToken(secret, { uid, ids, exp: nowSec + TOKEN_TTL_SECONDS });

// คืน { ok:true, uid, ids } หรือ { ok:false, reason:'format'|'signature'|'expired' } — ไม่ throw แม้ input แปลก
function verifyActionToken(secret, token, nowSec = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string' || token.length > 2000 || !secret) return { ok: false, reason: 'format' };
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return { ok: false, reason: 'format' };
  const want = Buffer.from(sign(secret, parts[0])), got = Buffer.from(parts[1]);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return { ok: false, reason: 'signature' };
  const m = /^(\d+)\.([\d-]*)\.(\d+)$/.exec(Buffer.from(parts[0], 'base64url').toString('utf8'));
  if (!m) return { ok: false, reason: 'format' };
  if (Number(m[3]) < nowSec) return { ok: false, reason: 'expired' };
  const ids = m[2] ? m[2].split('-').map(Number).filter((n) => n > 0) : [];
  if (!ids.length) return { ok: false, reason: 'format' };
  return { ok: true, uid: Number(m[1]), ids };
}

// ---------- payload (รูปแบบของ Angular service worker: { notification: {…} }) ----------
const open = (url) => ({ operation: 'navigateLastFocusedOrOpen', url });
function build({ title, body, tag, url, actions, takeUrl, requireInteraction = false }) {
  const onActionClick = { default: open(url) };
  if (takeUrl) onActionClick.take = open(takeUrl);
  const notification = { title, body, icon: ICON, badge: BADGE, lang: 'th', tag, renotify: true, requireInteraction, data: { onActionClick } };
  if (actions && actions.length) notification.actions = actions;
  return { notification };
}
const TAKE_ACTION = [{ action: 'take', title: '✓ กินแล้ว' }];

// เตือนกินยา / เตือนซ้ำ : ไม่มีชื่อยา มีแค่ชื่อมื้อ + จำนวน ; token ผูกกับ dose ids ของกลุ่มนี้
function reminderPayload({ slot, count, token, followup = false }) {
  const meal = SLOT_LABEL[slot] || '';
  return build({
    title: followup ? `⏰ ยังไม่ได้กินยามื้อ${meal}นะคะ` : `⏰ ถึงเวลากินยามื้อ${meal}แล้ว`,
    body: `${count} รายการ · แตะเพื่อดูและบันทึก`,
    tag: `yt-dose-${slot || 'x'}`, url: '/today',
    actions: token ? TAKE_ACTION : null, takeUrl: token ? `/today#take=${token}` : null, requireInteraction: true
  });
}
function lowStockPayload({ count }) {
  return build({ title: '💊 ยาใกล้หมดแล้วนะคะ', body: `${count} รายการ · แตะเพื่อดูและเติมยา`, tag: 'yt-low-stock', url: '/medications' });
}
function testPayload() {
  return build({ title: '🔔 ทดลองแจ้งเตือนจากยาตรง', body: 'เห็นข้อความนี้ แปลว่าเครื่องนี้พร้อมรับการแจ้งเตือนแล้วค่ะ', tag: 'yt-test', url: '/settings' });
}

// ---------- endpoint ที่รับได้ ----------
const BUILTIN_HOSTS = ['googleapis.com', 'mozilla.com', 'push.apple.com', 'notify.windows.com'];   // FCM (Chrome/Edge/Android) · Firefox · Safari/iOS · Windows
function allowedHosts(env) {
  const extra = String((env && env.PUSH_ENDPOINT_ALLOW) || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);   // เฉพาะทดสอบ (fake-push)
  return [...BUILTIN_HOSTS, ...extra];
}
function validateEndpoint(endpoint, env = process.env) {
  if (typeof endpoint !== 'string' || !endpoint || endpoint.length > 500) return false;
  let u;
  try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  return allowedHosts(env).some((h) => host === h || host.endsWith('.' + h));
}
const B64URL = /^[A-Za-z0-9_-]+$/;
function validateSubscription(body, env = process.env) {
  const b = body && typeof body === 'object' ? body : {};
  const keys = b.keys && typeof b.keys === 'object' ? b.keys : {};
  if (!validateEndpoint(b.endpoint, env)) return 'endpoint ของการแจ้งเตือนไม่ถูกต้อง';
  if (typeof keys.p256dh !== 'string' || !B64URL.test(keys.p256dh) || keys.p256dh.length > 200) return 'ข้อมูลกุญแจของเครื่อง (p256dh) ไม่ถูกต้อง';
  if (typeof keys.auth !== 'string' || !B64URL.test(keys.auth) || keys.auth.length > 100) return 'ข้อมูลกุญแจของเครื่อง (auth) ไม่ถูกต้อง';
  return null;
}
const shortUa = (ua) => String(ua || '').replace(/\s+/g, ' ').slice(0, 120) || null;

// สาเหตุที่อ่านเข้าใจ (ห้ามมี JWT/ endpoint) — Apple ตอบ 403 + {"reason":"BadJwtToken"} เมื่อ VAPID_SUBJECT ไม่ถูกใจ
function describeFailure(e, host) {
  const status = e && e.statusCode ? Number(e.statusCode) : 0;
  let reason = '';
  try { reason = String(JSON.parse(e.body || '{}').reason || '').slice(0, 40); } catch { /* body ไม่ใช่ JSON */ }
  const apple = /(^|\.)push\.apple\.com$/.test(host || '');
  let hint = '';
  if (apple && (status === 403 || reason === 'BadJwtToken')) hint = ' hint=VAPID_SUBJECT_ของ_Apple_ไม่ผ่าน(แก้เป็น_https://<NGROK_DOMAIN>_แล้ว_recreate_nodered)';
  else if (status === 401 || status === 403) hint = ' hint=VAPID_ไม่ตรงกับ_subscription(เปิดแจ้งเตือนใหม่ถ้าเพิ่งเปลี่ยนคีย์)';
  else if (status === 413) hint = ' hint=payload_ใหญ่เกิน';
  else if (status === 429) hint = ' hint=ผู้ให้บริการ_push_จำกัดความถี่';
  return { status, reason, hint, text: `push ${status || 'network'}${reason ? ' ' + reason : ''}` };
}

function createPushService(opts = {}) {
  const env = opts.env || process.env;
  const log = opts.log || ((m) => console.log(m));
  const webpush = opts.webpush || (() => { try { return require('web-push'); } catch { return null; } })();
  const secret = () => env.JWT_SECRET;
  const vapid = () => ({ subject: String(env.VAPID_SUBJECT || '').trim(), publicKey: String(env.VAPID_PUBLIC_KEY || '').trim(), privateKey: String(env.VAPID_PRIVATE_KEY || '').trim() });
  const configured = () => { const v = vapid(); return !!(v.publicKey && v.privateKey && v.subject); };
  const insecure = () => env.PUSH_ALLOW_INSECURE_TLS === 'true';   // เฉพาะทดสอบกับ fake-push (cert ที่เซ็นเอง)

  // sender จริง = web-push ; ทดสอบ/unit inject เองได้ → (subscription, bodyString, options) → Promise<{statusCode}> หรือ throw {statusCode, body}
  const sender = opts.sender || (async (sub, body, options) => {
    if (!webpush) throw new Error('web-push ไม่พร้อมใช้งาน');
    const o = { ...options };
    if (insecure()) o.agent = new (require('https').Agent)({ rejectUnauthorized: false });
    return webpush.sendNotification(sub, body, o);
  });

  async function logSend(db, userId, kind, doseLogId, ok, message) {
    try {
      await db.query('INSERT INTO notification_logs (user_id, dose_log_id, channel, kind, recipient, success, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, doseLogId || null, 'web_push', kind || 'other', 'patient', ok ? 1 : 0, ok ? null : String(message || '').slice(0, 500)]);
    } catch (e) { log('push_log_error ' + e.message); }
  }

  // ส่งหา "ทุกเครื่อง" ของ user ; คืน { subs, sent, failed, removed } ; ไม่ throw
  async function sendToUser(db, userId, payload, meta = {}) {
    const out = { subs: 0, sent: 0, failed: 0, removed: 0 };
    if (!configured()) { out.skipped = 'not_configured'; return out; }
    const v = vapid();
    const subs = await db.query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ? ORDER BY id', [userId]);
    out.subs = subs.length;
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    for (const s of subs) {
      let host = '';
      try { host = new URL(s.endpoint).hostname; } catch { /* ข้าม */ }
      try {
        await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body,
          { TTL: TTL_SECONDS, urgency: 'high', vapidDetails: { subject: v.subject, publicKey: v.publicKey, privateKey: v.privateKey } });
        out.sent++;
        await db.query('UPDATE push_subscriptions SET last_success_at = NOW(), fail_count = 0 WHERE id = ?', [s.id]);
        await logSend(db, userId, meta.kind, meta.doseLogId, true);
      } catch (e) {
        const d = describeFailure(e, host);
        if (d.status === 404 || d.status === 410) {
          out.removed++;
          await db.query('DELETE FROM push_subscriptions WHERE id = ?', [s.id]);
          await logSend(db, userId, meta.kind, meta.doseLogId, false, `${d.text} (เครื่องนี้ยกเลิกการแจ้งเตือนแล้ว — ลบออก)`);
        } else {
          out.failed++;
          await db.query('UPDATE push_subscriptions SET fail_count = fail_count + 1 WHERE id = ?', [s.id]);
          await logSend(db, userId, meta.kind, meta.doseLogId, false, d.text);
        }
        log(`web_push_error user_tail=${String(userId).slice(-4)} host=${host || '-'} status=${d.status || 'network'}${d.reason ? ' reason=' + d.reason : ''}${d.hint}`);
      }
    }
    return out;
  }

  // ---------- endpoint logic (คืน { status, body }) ----------
  function publicKey() {
    if (!configured()) return err(503, 'PUSH_NOT_CONFIGURED', 'ยังไม่ได้ตั้งค่าการแจ้งเตือนบนเครื่อง (VAPID) ในระบบ');
    return { status: 200, body: { publicKey: vapid().publicKey } };
  }

  async function subscribe(db, userId, body, userAgent) {
    const bad = validateSubscription(body, env);
    if (bad) return err(400, 'VALIDATION', bad);
    // endpoint ซ้ำ = อัปเดต (ย้ายเจ้าของเป็น user ปัจจุบัน ถ้าเคยเป็นของคนอื่น) ; นับ fail_count ใหม่
    await db.query(
      'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, fail_count) VALUES (?, ?, ?, ?, ?, 0) ' +
      'ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent), fail_count = 0',
      [userId, body.endpoint, body.keys.p256dh, body.keys.auth, shortUa(userAgent)]);
    const n = await db.query('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?', [userId]);
    return { status: 200, body: { subscribed: true, devices: Number(n[0].n) } };
  }

  async function unsubscribe(db, userId, body) {
    const endpoint = body && typeof body.endpoint === 'string' ? body.endpoint : '';
    if (!endpoint || endpoint.length > 500) return err(400, 'VALIDATION', 'ต้องระบุ endpoint ของเครื่องที่จะยกเลิก');
    const r = await db.query('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', [userId, endpoint]);
    if (!r.affectedRows) return err(404, 'NOT_FOUND', 'ไม่พบข้อมูลที่ต้องการ');   // ของคนอื่น/ไม่มี = 404 เหมือนกัน
    return { status: 200, body: { subscribed: false } };
  }

  async function sendTest(db, userId) {
    if (!configured()) return err(503, 'PUSH_NOT_CONFIGURED', 'ยังไม่ได้ตั้งค่าการแจ้งเตือนบนเครื่อง (VAPID) ในระบบ');
    const c = await db.query('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?', [userId]);
    if (!Number(c[0].n)) return err(409, 'NO_SUBSCRIPTION', 'เครื่องนี้ยังไม่ได้เปิดการแจ้งเตือน กรุณากด "เปิดการแจ้งเตือน" ก่อนค่ะ');
    const r = await sendToUser(db, userId, testPayload(), { kind: 'other' });
    if (!r.sent) return err(502, 'PUSH_FAILED', 'ส่งแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่ หรือปิดแล้วเปิดการแจ้งเตือนอีกครั้งค่ะ', { devices: r.subs, removed: r.removed });
    return { status: 200, body: { sent: r.sent, failed: r.failed, devices: r.subs } };
  }

  // ปุ่ม "✓ กินแล้ว" : ไม่มี JWT — token คือสิทธิ์ ; token ผิด/หมดอายุ = 401 ; กดซ้ำไม่หักยาซ้ำ (takeMany)
  async function take(db, doseService, token) {
    const v = verifyActionToken(secret(), token);
    if (!v.ok) return err(401, 'INVALID_TOKEN', v.reason === 'expired' ? 'ลิงก์นี้หมดอายุแล้ว กรุณาเปิดแอปแล้วกด "กินแล้ว" ในหน้าวันนี้ค่ะ' : 'ลิงก์นี้ใช้ไม่ได้ กรุณาเปิดแอปแล้วกด "กินแล้ว" ในหน้าวันนี้ค่ะ');
    const r = await doseService.takeMany(db, v.uid, v.ids, 'push');
    return { status: 200, body: { taken: r.taken.length, already: r.already.length, at: r.at } };
  }

  return { configured, publicKey, subscribe, unsubscribe, sendTest, sendToUser, take, newActionToken: (uid, ids) => newActionToken(secret(), uid, ids) };
}

module.exports = {
  createPushService, signActionToken, verifyActionToken, newActionToken, reminderPayload, lowStockPayload, testPayload,
  validateEndpoint, validateSubscription, describeFailure, TTL_SECONDS, TOKEN_TTL_SECONDS, ICON, BADGE
};
