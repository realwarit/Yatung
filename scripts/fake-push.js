#!/usr/bin/env node
// Push service ปลอมสำหรับทดสอบ Web Push (วันที่ 7C) — รับ POST จาก web-push, ถอดรหัส payload (aes128gcm, RFC 8291) ด้วยคีย์ของ subscriber ปลอมที่เทสลงทะเบียนไว้,
// ตรวจลายเซ็น VAPID (ES256) แล้วเก็บ request ไว้ให้เทสอ่าน ; จำลองสถานะ 201 / 404 / 410 / 500 / 403 ของ Apple / 429 ได้
//   node scripts/fake-push.js [port]        (ค่าเริ่มต้น 8799)   HTTPS ด้วยใบรับรองที่เซ็นเอง (สร้างด้วย openssl ตอนเริ่ม ไม่ commit กุญแจ)
// ควบคุม (HTTPS เช่นกัน ใช้ curl -k):
//   POST   /_config {mode:"201"|"404"|"410"|"500"|"403apple"|"429", only?:"<id>"}   mode ใช้กับทุก endpoint หรือเฉพาะ /p/<id> ที่ระบุ
//   POST   /_subs   {id, privateKey, publicKey, auth}   ลงทะเบียนคีย์ของ subscriber ปลอม (base64url) เพื่อถอดรหัส payload ของ /p/<id>
//   GET    /_requests            รายการคำขอที่รับไว้ (id, ttl, urgency, vapid:{ok,aud,sub,k,exp_ok}, payload (ถอดแล้ว), bytes)
//   DELETE /_requests            ล้าง
// endpoint ของ subscriber ปลอม = https://host.docker.internal:<port>/p/<id>  (nodered ต้องตั้ง PUSH_ALLOW_INSECURE_TLS=true และ PUSH_ENDPOINT_ALLOW=host.docker.internal)
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const port = Number(process.argv[2] || 8799);
let cfg = { mode: '201', only: null };
const subs = new Map();
let requests = [];

function makeCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-push-'));
  const key = path.join(dir, 'k.pem'), crt = path.join(dir, 'c.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '2', '-subj', '/CN=host.docker.internal',
    '-addext', 'subjectAltName=DNS:host.docker.internal,DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore', env: { ...process.env, MSYS_NO_PATHCONV: '1', MSYS2_ARG_CONV_EXCL: '*' } });
  const out = { key: fs.readFileSync(key), cert: fs.readFileSync(crt) };
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

const b64u = (s) => Buffer.from(s, 'base64url');
const hkdf = (ikm, salt, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));

// RFC 8291 : aes128gcm
function decrypt(body, sub) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPub = body.subarray(21, 21 + idlen);
  const cipher = body.subarray(21 + idlen);
  const ua = crypto.createECDH('prime256v1');
  ua.setPrivateKey(b64u(sub.privateKey));
  const uaPub = b64u(sub.publicKey);
  const secret = ua.computeSecret(asPub);
  const ikm = hkdf(secret, b64u(sub.auth), Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32);
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(cipher.subarray(cipher.length - 16));
  let plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
  let end = plain.length;
  while (end > 0 && plain[end - 1] === 0) end--;
  if (end > 0 && plain[end - 1] === 2) end--;   // ตัวคั่นท้ายระเบียนสุดท้าย
  return plain.subarray(0, end).toString('utf8');
}

// Authorization: vapid t=<jwt>,k=<public key>
function checkVapid(auth, url) {
  const out = { ok: false };
  const m = /^vapid\s+t=([^,\s]+),\s*k=(\S+)$/i.exec(String(auth || ''));
  if (!m) return out;
  try {
    const [h, p, s] = m[1].split('.');
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    const pub = b64u(m[2]);
    const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33, 65).toString('base64url') }, format: 'jwk' });
    out.ok = crypto.verify('sha256', Buffer.from(h + '.' + p), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
    out.aud = claims.aud; out.sub = claims.sub; out.k = m[2];
    out.aud_ok = claims.aud === url.origin;
    out.exp_ok = claims.exp > Date.now() / 1000 && claims.exp - Date.now() / 1000 <= 24 * 3600 + 60;
  } catch { /* ok:false */ }
  return out;
}

function readBody(req) { return new Promise((resolve) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => resolve(Buffer.concat(c))); }); }
const json = (res, status, obj) => { const s = JSON.stringify(obj); res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(s) }); res.end(s); };

const server = https.createServer(makeCert(), async (req, res) => {
  const url = new URL(req.url, 'https://localhost');
  const body = await readBody(req);
  if (url.pathname === '/_config' && req.method === 'POST') { cfg = { mode: '201', only: null, ...JSON.parse(body.toString() || '{}') }; return json(res, 200, cfg); }
  if (url.pathname === '/_subs' && req.method === 'POST') { const s = JSON.parse(body.toString()); subs.set(String(s.id), s); return json(res, 200, { ok: true }); }
  if (url.pathname === '/_requests') {
    if (req.method === 'DELETE') { requests = []; return json(res, 200, { ok: true }); }
    return json(res, 200, requests);
  }
  const m = /^\/p\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
  if (m && req.method === 'POST') {
    const id = m[1];
    const rec = {
      id, ttl: req.headers.ttl, urgency: req.headers.urgency, encoding: req.headers['content-encoding'], bytes: body.length,
      vapid: checkVapid(req.headers.authorization, new URL('https://' + req.headers.host)), payload: null
    };
    const sub = subs.get(id);
    if (sub && body.length) { try { rec.payload = decrypt(body, sub); } catch (e) { rec.decrypt_error = e.message; } }
    requests.push(rec);
    const mode = cfg.only && cfg.only !== id ? '201' : cfg.mode;
    if (mode === '404' || mode === '410' || mode === '500' || mode === '429') { res.writeHead(Number(mode)); return res.end(); }
    if (mode === '403apple') return json(res, 403, { reason: 'BadJwtToken' });
    res.writeHead(201, { Location: 'https://localhost/m/' + id });
    return res.end();
  }
  res.writeHead(404); res.end();
});
server.listen(port, '0.0.0.0', () => console.log('fake-push (https) ฟังที่ :' + port));
