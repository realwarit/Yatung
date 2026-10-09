// LINE Messaging API ปลอมสำหรับทดสอบ (ไม่ส่งข้อความจริง ไม่เปลืองโควตา): node scripts/fake-line.js [port]
// ชี้ Node-RED มาที่นี่ด้วย LINE_API_BASE=http://host.docker.internal:<port>
// endpoint ที่ LINE จริงมี:
//   POST /v2/bot/message/reply        POST /v2/bot/message/push        GET /v2/bot/profile/:userId
//   GET  /v2/bot/message/quota        GET  /v2/bot/message/quota/consumption
//   POST /v2/bot/message/validate/reply|push   (ตรวจ messages: ≤ 5, type, altText ≤ 400, quickReply ≤ 13, label ≤ 20, postback ≤ 300 — ตอบ 400 พร้อม details)
//   rich menu: POST /v2/bot/richmenu/validate · POST /v2/bot/richmenu · GET /v2/bot/richmenu/list · DELETE /v2/bot/richmenu/:id ·
//              POST /v2/bot/richmenu/:id/content (api-data ชี้มา host เดียวกัน ; บันทึกแค่ content-type + จำนวน byte) · POST /v2/bot/user/all/richmenu/:id (ตั้งค่าเริ่มต้น)
//   GET /_richmenus  → { menus: [...], default: id|null, images: { id: {type, bytes} } }
//   reply/push จริงก็ตรวจ messages ด้วยกฎเดียวกับ validate (จับข้อความผิดกฎตั้งแต่ตอนเทส)
// endpoint ควบคุมสำหรับเทส (ขึ้นต้น _):
//   GET    /_requests            รายการคำขอที่รับไว้ [{ method, path, headers, body }] (authorization ถูกแทนด้วย "Bearer ***")
//   DELETE /_requests            ล้างรายการ
//   POST   /_config  {mode, failCount, quota, usage, profiles}
//            mode: "ok" (ปกติ) | "500" | "429" — ใช้กับ reply/push ; failCount = จำนวนครั้งที่ล้มเหลวก่อนกลับเป็น ok (ไม่ใส่ = ล้มตลอด)
//            quota: เลขโควตา หรือ null (= type none) ; usage: ยอดใช้ไป หรือ null (= consumption ตอบ 500)
//            profiles: { "<userId>": "<ชื่อ>" } (ไม่มี = 404)
//   ทุก push ที่มี X-Line-Retry-Key ซ้ำ key เดิมที่เคยสำเร็จ → 409 (เหมือน LINE จริง)
const http = require('http');

const port = Number(process.argv[2] || 8798);
let requests = [];
let menus = [];            // rich menu ที่สร้างไว้ { richMenuId, ...object }
let defaultMenu = null;
const images = {};
let menuSeq = 0;
let cfg = { mode: 'ok', failCount: null, quota: 200, usage: 0, profiles: {} };
const okKeys = new Set();

// ตรวจ messages ตามขีดจำกัดของ LINE (บางส่วน) : คืนข้อความ error หรือ null
function validateMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) return 'messages must not be empty';
  if (messages.length > 5) return 'messages: max 5';
  for (const m of messages) {
    if (!m || !['text', 'flex', 'image'].includes(m.type)) return 'invalid message type';
    if (m.type === 'text' && (!m.text || m.text.length > 5000)) return 'text: 1-5000 chars';
    if (m.type === 'flex') {
      if (!m.altText || m.altText.length > 400) return 'altText: 1-400 chars';
      if (!m.contents || Buffer.byteLength(JSON.stringify(m.contents)) > 30000) return 'contents: missing or over 30KB';
    }
    if (m.quickReply) {
      const it = m.quickReply.items;
      if (!Array.isArray(it) || !it.length || it.length > 13) return 'quickReply.items: 1-13';
      for (const i of it) if (!i.action || !i.action.label || i.action.label.length > 20) return 'quickReply label: 1-20 chars';
    }
    const walk = (o) => {
      if (!o || typeof o !== 'object') return null;
      if (o.type === 'postback' && (!o.data || o.data.length > 300)) return 'postback data: 1-300 chars';
      if (o.type === 'message' && o.text && o.text.length > 300) return 'message action text over 300';
      for (const v of Object.values(o)) { const r = walk(v); if (r) return r; }
      return null;
    };
    const w = walk(m); if (w) return w;
  }
  return null;
}
function validateMenu(o) {
  if (!o || !o.size || ![843, 1686].includes(o.size.height) || o.size.width !== 2500) return 'size must be 2500x843 or 2500x1686';
  if (!o.name || o.name.length > 300 || !o.chatBarText || o.chatBarText.length > 14) return 'name/chatBarText invalid';
  if (!Array.isArray(o.areas) || !o.areas.length || o.areas.length > 20) return 'areas: 1-20';
  for (const a of o.areas) { const b = a.bounds; if (!b || b.x < 0 || b.y < 0 || b.x + b.width > 2500 || b.y + b.height > o.size.height || !a.action) return 'area out of bounds'; }
  return null;
}
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (d) => chunks.push(d));
  req.on('end', () => {
    const buf = Buffer.concat(chunks);
    const isBinary = /^image\//.test(req.headers['content-type'] || '');
    const raw = isBinary ? '' : buf.toString('utf8');
    const path = req.url.split('?')[0];
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch (_) { body = raw; }

    if (path === '/_requests') {
      if (req.method === 'DELETE') { requests = []; okKeys.clear(); return json(res, 200, {}); }
      return json(res, 200, requests);
    }
    if (path === '/_richmenus') return json(res, 200, { menus, default: defaultMenu, images });
    if (path === '/_config' && req.method === 'POST') {
      cfg = { ...cfg, ...body };
      if (body && body.mode !== undefined && body.failCount === undefined) cfg.failCount = null;
      return json(res, 200, cfg);
    }

    const headers = { ...req.headers };
    if (headers.authorization) headers.authorization = 'Bearer ***';
    requests.push({ method: req.method, path, headers, body: isBinary ? { _binary: true, bytes: buf.length } : body });
    console.log(`REQ ${req.method} ${path}`);

    const failing = () => {
      if (cfg.mode === 'ok') return null;
      if (cfg.failCount !== null) { if (cfg.failCount <= 0) return null; cfg.failCount--; }
      return Number(cfg.mode);
    };

    if (!/^Bearer .+/.test(req.headers.authorization || '')) return json(res, 401, { message: 'Authentication failed' });

    if (path === '/v2/bot/message/reply' && req.method === 'POST') {
      const f = failing();
      if (f) return json(res, f, { message: 'forced ' + f });
      if (!body || !body.replyToken || !Array.isArray(body.messages)) return json(res, 400, { message: 'bad request' });
      { const bad = validateMessages(body.messages); if (bad) return json(res, 400, { message: bad }); }
      return json(res, 200, { sentMessages: [] });
    }
    if (path === '/v2/bot/message/push' && req.method === 'POST') {
      const key = req.headers['x-line-retry-key'];
      if (key && okKeys.has(key)) return json(res, 409, { message: 'The retry key is already accepted' });
      const f = failing();
      if (f) return json(res, f, { message: 'forced ' + f });
      if (!body || !body.to || !Array.isArray(body.messages)) return json(res, 400, { message: 'bad request' });
      { const bad = validateMessages(body.messages); if (bad) return json(res, 400, { message: bad }); }
      if (key) okKeys.add(key);
      return json(res, 200, {});
    }
    // ---- validate ข้อความ (ไม่ส่งจริง) ----
    if ((path === '/v2/bot/message/validate/reply' || path === '/v2/bot/message/validate/push') && req.method === 'POST') {
      const bad = validateMessages(body && body.messages);
      return bad ? json(res, 400, { message: 'The request body has 1 error(s)', details: [{ message: bad, property: 'messages' }] }) : json(res, 200, {});
    }
    // ---- rich menu ----
    if (path === '/v2/bot/richmenu/validate' && req.method === 'POST') { const bad = validateMenu(body); return bad ? json(res, 400, { message: bad }) : json(res, 200, {}); }
    if (path === '/v2/bot/richmenu' && req.method === 'POST') {
      const bad = validateMenu(body); if (bad) return json(res, 400, { message: bad });
      const richMenuId = 'richmenu-' + String(++menuSeq).padStart(4, '0') + 'fake' + Math.random().toString(16).slice(2, 10);
      menus.push({ richMenuId, ...body }); return json(res, 200, { richMenuId });
    }
    if (path === '/v2/bot/richmenu/list' && req.method === 'GET') return json(res, 200, { richmenus: menus });
    let rm = path.match(/^\/v2\/bot\/richmenu\/([^/]+)\/content$/);
    if (rm && req.method === 'POST') {
      if (!menus.find((x) => x.richMenuId === rm[1])) return json(res, 404, { message: 'richmenu not found' });
      if (!/^image\/(png|jpeg)$/.test(req.headers['content-type'] || '') || buf.length > 1000000 || !buf.length) return json(res, 400, { message: 'bad image' });
      images[rm[1]] = { type: req.headers['content-type'], bytes: buf.length }; return json(res, 200, {});
    }
    rm = path.match(/^\/v2\/bot\/richmenu\/([^/]+)$/);
    if (rm && req.method === 'DELETE') {
      if (!menus.find((x) => x.richMenuId === rm[1])) return json(res, 404, { message: 'richmenu not found' });
      menus = menus.filter((x) => x.richMenuId !== rm[1]); delete images[rm[1]]; if (defaultMenu === rm[1]) defaultMenu = null; return json(res, 200, {});
    }
    rm = path.match(/^\/v2\/bot\/user\/all\/richmenu\/([^/]+)$/);
    if (rm && req.method === 'POST') {
      if (!menus.find((x) => x.richMenuId === rm[1]) || !images[rm[1]]) return json(res, 404, { message: 'richmenu not found or no image' });
      defaultMenu = rm[1]; return json(res, 200, {});
    }
    const m = path.match(/^\/v2\/bot\/profile\/([^/]+)$/);
    if (m && req.method === 'GET') {
      const id = decodeURIComponent(m[1]);
      return cfg.profiles[id] ? json(res, 200, { userId: id, displayName: cfg.profiles[id] }) : json(res, 404, { message: 'Not found' });
    }
    if (path === '/v2/bot/message/quota') return json(res, 200, cfg.quota == null ? { type: 'none' } : { type: 'limited', value: cfg.quota });
    if (path === '/v2/bot/message/quota/consumption') return cfg.usage == null ? json(res, 500, { message: 'no consumption' }) : json(res, 200, { totalUsage: cfg.usage });
    json(res, 404, { message: 'not found' });
  });
}).listen(port, '0.0.0.0', () => console.log('fake-line listening on ' + port));
