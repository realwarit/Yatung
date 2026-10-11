const test = require('node:test');
const assert = require('node:assert/strict');

// ค่าทดสอบประกอบตอนรันเพื่อไม่ให้ตัวสแกนเจอตัวไฟล์เทสเอง และไม่ฝังความลับจริง
const rnd = (n, alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') => Array.from(require('node:crypto').randomBytes(n), (b) => alpha[b % alpha.length]).join('');
const bcrypt = () => '$' + '2y$08$' + rnd(53, './ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');

test('ไฟล์ต้องห้าม: .env / flows_cred / .sessions / *.backup / .config.*.json ; .env.example ผ่าน', async () => {
  const { FORBIDDEN_FILE: F } = await import('../../scripts/lib/secret-scan.mjs');
  for (const f of ['.env', 'a/.env', 'node-red/data/flows_cred.json', 'node-red/data/.sessions.json', 'node-red/data/.config.users.json.backup', 'x.backup', 'node-red/data/.config.nodes.json', 'k.pem']) assert.ok(F.test(f), f);
  for (const f of ['.env.example', 'node-red/data/flows.json', 'docs/backup-notes.md', 'node-red/data/lib/admin-auth.js']) assert.ok(!F.test(f), f);
});

test('รูปแบบความลับ: พบชนิดที่ถูกต้อง และ placeholder/ว่างไม่ถูกจับ', async () => {
  const { scanLine } = await import('../../scripts/lib/secret-scan.mjs');
  assert.deepEqual(scanLine('LINE_CHANNEL_SECRET=' + rnd(32, '0123456789abcdef')), ['LINE channel secret']);
  assert.deepEqual(scanLine('LINE_CHANNEL_ACCESS_TOKEN=' + rnd(120)), ['LINE access token']);
  assert.deepEqual(scanLine('NGROK_AUTHTOKEN=' + rnd(40)), ['ngrok authtoken']);
  assert.ok(scanLine('key: AIza' + rnd(35)).includes('Gemini/Google API key'));
  assert.deepEqual(scanLine('VAPID_PRIVATE_KEY=' + rnd(43)), ['VAPID private key']);
  assert.deepEqual(scanLine('JWT_SECRET=' + rnd(40)), ['JWT_SECRET ค่าจริง']);
  assert.deepEqual(scanLine('DB_PASSWORD=' + rnd(16)), ['DB password ค่าจริง']);
  assert.deepEqual(scanLine('x = "' + 'eyJ' + rnd(30) + '.' + rnd(30) + '.' + rnd(20) + '"'), ['JWT/Bearer token']);
  for (const ok of ['LINE_CHANNEL_SECRET=', 'JWT_SECRET=change-me-to-a-long-random-string', 'VAPID_PRIVATE_KEY=', 'NGROK_AUTHTOKEN=${X}', 'LLM_API_KEY=', 'DB_PASSWORD=${DB_PASSWORD}']) assert.deepEqual(scanLine(ok), [], ok);
});

test('bcrypt: อนุญาตเฉพาะไฟล์ที่ระบุ (demo1234 สาธารณะ) ที่อื่นถูกบล็อก', async () => {
  const { scanLine } = await import('../../scripts/lib/secret-scan.mjs');
  const line = "const GOOD = '" + bcrypt() + "';";
  assert.deepEqual(scanLine(line, 'node-red/test/x.test.js'), ['bcrypt hash']);
  assert.deepEqual(scanLine(line, 'db/init/02_seed.sql'), []);
});

test('scanPatch: อ่าน diff แล้วรายงานไฟล์/บรรทัด/commit โดยไม่คืนค่า', async () => {
  const { scanPatch } = await import('../../scripts/lib/secret-scan.mjs');
  const secret = rnd(32, '0123456789abcdef');
  const patch = ['@@C abc1234', 'diff --git a/app.js b/app.js', '--- a/app.js', '+++ b/app.js', '@@ -1,0 +5,2 @@', '+const ok = 1;', '+LINE_CHANNEL_SECRET=' + secret, '-LINE_CHANNEL_SECRET=' + secret].join('\n');
  const r = scanPatch(patch);
  assert.deepEqual(r, [{ type: 'LINE channel secret', file: 'app.js', ref: 'abc1234', line: 6 }]);
  assert.ok(!JSON.stringify(r).includes(secret));
});
