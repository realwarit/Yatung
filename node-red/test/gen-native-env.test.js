const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '../../frontend/tools/gen-native-env.mjs')).href);

test('parseEnv แทน ${VAR} จากตัวแปรที่ประกาศก่อนหน้า และข้ามคอมเมนต์', async () => {
  const { parseEnv } = await load();
  const v = parseEnv('# c\nA=host.example.test\nB=https://${A}\nC="q"\nD=https://${LATER}\nLATER=x\r\n');
  assert.strictEqual(v.B, 'https://host.example.test');
  assert.strictEqual(v.C, 'q');
  assert.strictEqual(v.D, 'https://');   // ประกาศหลัง = ว่าง (เหมือน Compose)
});

test('checkApiBase รับเฉพาะ https โดเมนล้วน ไม่มี / ท้าย', async () => {
  const { checkApiBase } = await load();
  assert.strictEqual(checkApiBase('https://a.example.test').value, 'https://a.example.test');
  assert.strictEqual(checkApiBase('https://a.example.test/').value, 'https://a.example.test');
  for (const bad of ['', undefined, 'http://a.example.test', 'https://', 'https://localhost', 'https://a.example.test/api', 'https://a.example.test?x=1', 'ไม่ใช่url'])
    assert.ok(checkApiBase(bad).error, `ต้องปฏิเสธ: ${bad}`);
});

test('render ไม่ใส่อะไรนอกจาก native + apiBase', async () => {
  const { render } = await load();
  const out = render('https://a.example.test');
  assert.match(out, /native: true, apiBase: "https:\/\/a\.example\.test"/);
});
