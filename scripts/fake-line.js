// LINE Messaging API ปลอมสำหรับทดสอบ (ไม่ส่งข้อความจริง ไม่เปลืองโควตา): node scripts/fake-line.js [port]
// ชี้ Node-RED มาที่นี่ด้วย LINE_API_BASE=http://host.docker.internal:<port>
// endpoint ที่ LINE จริงมี:
//   POST /v2/bot/message/reply        POST /v2/bot/message/push        GET /v2/bot/profile/:userId
//   GET  /v2/bot/message/quota        GET  /v2/bot/message/quota/consumption
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
let cfg = { mode: 'ok', failCount: null, quota: 200, usage: 0, profiles: {} };
const okKeys = new Set();

const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => (raw += d));
  req.on('end', () => {
    const path = req.url.split('?')[0];
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch (_) { body = raw; }

    if (path === '/_requests') {
      if (req.method === 'DELETE') { requests = []; okKeys.clear(); return json(res, 200, {}); }
      return json(res, 200, requests);
    }
    if (path === '/_config' && req.method === 'POST') {
      cfg = { ...cfg, ...body };
      if (body && body.mode !== undefined && body.failCount === undefined) cfg.failCount = null;
      return json(res, 200, cfg);
    }

    const headers = { ...req.headers };
    if (headers.authorization) headers.authorization = 'Bearer ***';
    requests.push({ method: req.method, path, headers, body });
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
      return json(res, 200, { sentMessages: [] });
    }
    if (path === '/v2/bot/message/push' && req.method === 'POST') {
      const key = req.headers['x-line-retry-key'];
      if (key && okKeys.has(key)) return json(res, 409, { message: 'The retry key is already accepted' });
      const f = failing();
      if (f) return json(res, f, { message: 'forced ' + f });
      if (!body || !body.to || !Array.isArray(body.messages)) return json(res, 400, { message: 'bad request' });
      if (key) okKeys.add(key);
      return json(res, 200, {});
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
