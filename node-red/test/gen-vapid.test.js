// scripts/gen-vapid.mjs : ไม่เขียนทับคีย์เดิม · รักษาลำดับ/คอมเมนต์/CRLF · คีย์ที่สร้างเป็นคู่ที่ถูกต้อง · ไม่พิมพ์ private key
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const SCRIPT = path.resolve(__dirname, '../../scripts/gen-vapid.mjs');
const load = () => import(pathToFileURL(SCRIPT).href);
const tmp = (content) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vapid-')); const p = path.join(d, '.env'); fs.writeFileSync(p, content); return p; };

const ENV = ['A=1', '# ---------- Web Push ----------', 'VAPID_PUBLIC_KEY=   # คอมเมนต์ท้ายบรรทัด', 'VAPID_PRIVATE_KEY=', 'VAPID_SUBJECT=mailto:me@yatung.example', 'Z=9', ''];

test('คีย์ที่สร้างเป็นคู่ P-256 ที่ถูกต้อง (public 65 ไบต์ / private 32 ไบต์ / base64url)', async () => {
  const { generateVapidKeys } = await load();
  const { publicKey, privateKey } = generateVapidKeys();
  const pub = Buffer.from(publicKey, 'base64url'), priv = Buffer.from(privateKey, 'base64url');
  assert.equal(pub.length, 65); assert.equal(pub[0], 4); assert.equal(priv.length, 32);
  assert.match(publicKey + privateKey, /^[A-Za-z0-9_-]+$/);
  const e = crypto.createECDH('prime256v1'); e.setPrivateKey(priv);
  assert.equal(e.getPublicKey().toString('base64url'), publicKey);
});

for (const nl of ['\n', '\r\n']) {
  test('เขียนเฉพาะ 2 บรรทัด คงลำดับ/คอมเมนต์/ตัวคั่นบรรทัดเดิม (' + JSON.stringify(nl) + ')', async () => {
    const { run } = await load();
    const p = tmp(ENV.join(nl));
    const r = run({ envPath: p });
    assert.equal(r.action, 'created');
    const out = fs.readFileSync(p, 'utf8'), lines = out.split(nl);
    assert.equal(lines[0], 'A=1'); assert.equal(lines[1], ENV[1]);
    assert.match(lines[2], /^VAPID_PUBLIC_KEY=[A-Za-z0-9_-]{87}\s+# คอมเมนต์ท้ายบรรทัด$/);
    assert.match(lines[3], /^VAPID_PRIVATE_KEY=[A-Za-z0-9_-]{43}$/);
    assert.equal(lines[4], ENV[4]); assert.equal(lines[5], 'Z=9');
    assert.equal(out.includes(nl === '\n' ? '\r' : '\n\n'), false);
    assert.equal(lines.length, ENV.length);
    assert.equal(r.publicKey, lines[2].match(/=([A-Za-z0-9_-]+)/)[1]);
    assert.equal(JSON.stringify(r).includes(lines[3].split('=')[1]), false, 'ผลที่คืนต้องไม่มี private key');
  });
}

test('มีคีย์ครบแล้ว = ไม่เขียนทับ ไม่แก้ไฟล์', async () => {
  const { run } = await load();
  const text = ['VAPID_PUBLIC_KEY=PUB', 'VAPID_PRIVATE_KEY=PRIV', ''].join('\n');
  const p = tmp(text);
  const r = run({ envPath: p });
  assert.deepEqual(r, { action: 'exists', publicKey: 'PUB' });
  assert.equal(fs.readFileSync(p, 'utf8'), text);
});

test('มีแค่ตัวเดียว = หยุด ไม่แก้ไฟล์', async () => {
  const { run } = await load();
  for (const text of ['VAPID_PUBLIC_KEY=PUB\nVAPID_PRIVATE_KEY=\n', 'VAPID_PUBLIC_KEY=\nVAPID_PRIVATE_KEY=PRIV\n']) {
    const p = tmp(text);
    assert.equal(run({ envPath: p }).action, 'partial');
    assert.equal(fs.readFileSync(p, 'utf8'), text);
  }
});

test('ไม่มีบรรทัด VAPID เลย = ต่อท้ายไฟล์ ; dry-run ไม่เขียน', async () => {
  const { run } = await load();
  const p = tmp('A=1');
  assert.equal(run({ envPath: p, dryRun: true }).action, 'dry-run');
  assert.equal(fs.readFileSync(p, 'utf8'), 'A=1');
  run({ envPath: p });
  assert.match(fs.readFileSync(p, 'utf8'), /^A=1\nVAPID_PUBLIC_KEY=\S+\nVAPID_PRIVATE_KEY=\S+\n$/);
});

test('CLI: พิมพ์เฉพาะ public key ไม่พิมพ์ private key ; รันซ้ำไม่เขียนทับ', () => {
  const p = tmp(ENV.join('\n'));
  const out1 = execFileSync(process.execPath, [SCRIPT, '--env', p], { encoding: 'utf8' });
  const priv = fs.readFileSync(p, 'utf8').match(/^VAPID_PRIVATE_KEY=(\S+)/m)[1];
  assert.equal(out1.includes(priv), false);
  assert.match(out1, /VAPID_PUBLIC_KEY=[A-Za-z0-9_-]{87}/);
  const before = fs.readFileSync(p, 'utf8');
  const out2 = execFileSync(process.execPath, [SCRIPT, '--env', p], { encoding: 'utf8' });
  assert.match(out2, /ไม่เขียนทับ/);
  assert.equal(fs.readFileSync(p, 'utf8'), before);
  assert.equal(out2.includes(priv), false);
});
