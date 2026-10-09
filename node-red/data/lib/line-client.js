// ตัวเรียก LINE Messaging API ที่เดียว: reply / push / getProfile / quota
// - ใช้ LINE_API_BASE (ทดสอบชี้ไป scripts/fake-line.js), timeout 10 วินาที
// - push ใส่ X-Line-Retry-Key (UUID) และลองใหม่ 1 ครั้งเมื่อ 5xx / 429 / เครือข่ายล่ม (key เดิม → LINE ไม่ส่งซ้ำ)
// - ทุกการส่งบันทึก notification_logs (ถ้ารู้ user_id) ; ห้าม log token / secret / ข้อความ / userId เต็ม (ได้แค่ 6 ตัวท้าย)
// - โควตา: effective_cap = min(LINE_PUSH_MONTHLY_CAP, quota จริงจาก LINE) ; kind=reminder หยุดที่ (cap - RESERVE), escalation ไปได้ถึง cap
const crypto = require('crypto');

const TIMEOUT_MS = 10000;
const QUOTA_CACHE_MS = 5 * 60 * 1000;
const RETRY_DELAY_MS = 800;

const tail6 = (id) => (id ? String(id).slice(-6) : '-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createClient(opts = {}) {
  const env = opts.env || process.env;
  const fetchImpl = opts.fetch || ((...a) => fetch(...a));
  const log = opts.log || ((m) => console.log(m));
  const retryDelay = opts.retryDelayMs == null ? RETRY_DELAY_MS : opts.retryDelayMs;
  const cache = { at: 0, value: null };

  const base = () => String(env.LINE_API_BASE || 'https://api.line.me').replace(/\/+$/, '');
  const token = () => env.LINE_CHANNEL_ACCESS_TOKEN || '';
  const monthlyCap = () => {
    const n = Number(env.LINE_PUSH_MONTHLY_CAP);
    return Number.isFinite(n) && n >= 0 && env.LINE_PUSH_MONTHLY_CAP !== '' && env.LINE_PUSH_MONTHLY_CAP != null ? n : 200;
  };
  const reserve = () => {
    const n = Number(env.LINE_PUSH_RESERVE);
    return Number.isFinite(n) && n >= 0 && env.LINE_PUSH_RESERVE !== '' && env.LINE_PUSH_RESERVE != null ? n : 30;
  };

  // คืน { status, json, text } ; status เป็น string (ETIMEDOUT / ECONNREFUSED …) เมื่อเครือข่ายล้ม
  async function call(method, path, { body, headers } = {}) {
    try {
      const res = await fetchImpl(base() + path, {
        method,
        headers: { Authorization: 'Bearer ' + token(), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(headers || {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch (_) { /* ไม่ใช่ JSON */ }
      return { status: res.status, json, text };
    } catch (e) {
      return { status: e.name === 'TimeoutError' ? 'ETIMEDOUT' : (e.cause && e.cause.code) || e.name || 'ERROR', json: null, text: '' };
    }
  }

  async function logNotification(db, meta, channel, ok, errorMessage) {
    if (!db || !meta || !meta.userId) return;
    try {
      await db.query(
        'INSERT INTO notification_logs (user_id, dose_log_id, channel, kind, recipient, success, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [meta.userId, meta.doseLogId || null, channel, meta.kind || 'other', meta.recipient || 'patient', ok ? 1 : 0, ok ? null : String(errorMessage || '').slice(0, 500)]);
    } catch (e) {
      log('line_log_error ' + e.message);
    }
  }

  const errText = (r) => 'LINE ' + r.status + (r.json && r.json.message ? ': ' + String(r.json.message).slice(0, 200) : '');

  // reply ฟรี ไม่นับโควตา ; meta = { db, userId, kind }
  async function reply(replyToken, messages, meta = {}) {
    const r = await call('POST', '/v2/bot/message/reply', { body: { replyToken, messages } });
    const ok = r.status === 200;
    log(`line_reply status=${r.status} n=${messages.length}`);
    await logNotification(meta.db, meta, 'line_reply', ok, errText(r));
    return { ok, status: r.status };
  }

  // push นับโควตา ; meta = { db, userId, doseLogId, kind, recipient }
  async function push(to, messages, meta = {}) {
    const retryKey = crypto.randomUUID();
    let r = await call('POST', '/v2/bot/message/push', { body: { to, messages }, headers: { 'X-Line-Retry-Key': retryKey } });
    let attempts = 1;
    if (r.status === 429 || typeof r.status !== 'number' || r.status >= 500) {
      // 409 = key นี้เคยสำเร็จแล้ว (ถือว่าสำเร็จ) ; ที่เหลือลองใหม่ 1 ครั้งด้วย key เดิม
      await sleep(retryDelay);
      attempts = 2;
      r = await call('POST', '/v2/bot/message/push', { body: { to, messages }, headers: { 'X-Line-Retry-Key': retryKey } });
    }
    const ok = r.status === 200 || r.status === 409;
    log(`line_push to=…${tail6(to)} status=${r.status} attempts=${attempts} kind=${meta.kind || 'other'}`);
    await logNotification(meta.db, meta, 'line_push', ok, errText(r));
    return { ok, status: r.status, attempts };
  }

  async function getProfile(lineUserId) {
    const r = await call('GET', '/v2/bot/profile/' + encodeURIComponent(lineUserId));
    if (r.status !== 200 || !r.json) return null;
    return { displayName: r.json.displayName || null };
  }

  // quota จริงของเดือนนี้ ; cache 5 นาที ; คืน { quota: number|null, used: number|null }
  async function fetchQuota(force = false) {
    if (!force && cache.value && Date.now() - cache.at < QUOTA_CACHE_MS) return cache.value;
    const [q, c] = await Promise.all([call('GET', '/v2/bot/message/quota'), call('GET', '/v2/bot/message/quota/consumption')]);
    const value = {
      quota: q.status === 200 && q.json && q.json.type === 'limited' ? Number(q.json.value) : null,
      quotaType: q.status === 200 && q.json ? q.json.type : null,
      used: c.status === 200 && c.json && Number.isFinite(Number(c.json.totalUsage)) ? Number(c.json.totalUsage) : null
    };
    if (q.status === 200 || c.status === 200) { cache.at = Date.now(); cache.value = value; }
    return value;
  }

  // ยอด push สำเร็จเดือนนี้จาก notification_logs (สำรองเมื่อเรียก LINE ไม่ได้)
  async function usedFromLogs(db) {
    const rows = await db.query(
      "SELECT COUNT(*) AS n FROM notification_logs WHERE channel = 'line_push' AND success = 1 AND sent_at >= DATE_FORMAT(NOW(), '%Y-%m-01')");
    return Number(rows[0].n);
  }

  // สรุปโควตา: { cap, effective_cap, used, used_source, reserve, remaining_for_reminders, remaining_for_escalation, quota }
  async function quotaStatus(db, force = false) {
    const real = await fetchQuota(force);
    const cap = monthlyCap();
    const effective = real.quota == null ? cap : Math.min(cap, real.quota);
    let used, source;
    if (real.used != null) { used = real.used; source = 'line'; } else { used = await usedFromLogs(db); source = 'logs'; }
    const rsv = reserve();
    return {
      cap, quota: real.quota, effective_cap: effective, used, used_source: source, reserve: rsv,
      remaining_for_reminders: Math.max(effective - rsv - used, 0),
      remaining_for_escalation: Math.max(effective - used, 0)
    };
  }

  // ตัดสินใจว่าส่ง push ชนิดนี้ได้อีก n ข้อความไหม ; kind=escalation ใช้ได้ถึง effective_cap, ชนิดอื่นหยุดที่ (cap - reserve)
  async function canPush(db, kind, n = 1) {
    const s = await quotaStatus(db);
    const left = kind === 'escalation' ? s.remaining_for_escalation : s.remaining_for_reminders;
    return { allowed: left >= n, left, status: s };
  }

  return { reply, push, getProfile, fetchQuota, quotaStatus, canPush, usedFromLogs, tail6 };
}

module.exports = { createClient, tail6 };
