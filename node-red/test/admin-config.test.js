const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveAdmin, SAMPLE_HASH } = require('../data/lib/admin-auth');
const { createRawBodyMiddleware } = require('../data/lib/raw-body');

const GOOD = '$2y$08$.qmTU89S4pEYKqR79sdRWumIek4cytzn1bUFUpsmmxwHbnkZzi0x2';

test('admin: ไม่มี / ว่าง / ช่องว่างล้วน → fail closed (ไม่มี hash สำรอง)', () => {
  for (const env of [{}, { NODE_RED_ADMIN_HASH: '' }, { NODE_RED_ADMIN_HASH: '   ' }, { NODE_RED_ADMIN_USER: 'admin' }]) {
    const r = resolveAdmin(env);
    assert.equal(r.enabled, false);
    assert.equal(r.adminAuth, undefined);
    assert.ok(r.reason);
  }
});
test('admin: รูปแบบไม่ใช่ bcrypt (เช่น วาง hash ผิดที่/ตัดครึ่ง/รหัสผ่านตรงๆ) → fail closed และ reason ไม่มีค่า hash', () => {
  for (const h of ['demo1234', GOOD.slice(0, 30), '$2y$08$short', 'x'.repeat(60), GOOD + 'extra']) {
    const r = resolveAdmin({ NODE_RED_ADMIN_HASH: h });
    assert.equal(r.enabled, false, h);
    assert.ok(!r.reason.includes(h.slice(0, 12)) || h.length < 12);
  }
});
test('admin: hash ถูกต้อง ($2a/$2b/$2y) → เปิดพร้อมผู้ใช้ที่กำหนด', () => {
  const r = resolveAdmin({ NODE_RED_ADMIN_HASH: GOOD, NODE_RED_ADMIN_USER: 'boss' });
  assert.equal(r.enabled, true);
  assert.equal(r.adminAuth.users[0].username, 'boss');
  assert.equal(r.adminAuth.users[0].password, GOOD);
  assert.equal(r.adminAuth.users[0].permissions, '*');
  assert.equal(resolveAdmin({ NODE_RED_ADMIN_HASH: GOOD }).adminAuth.users[0].username, 'admin');
  assert.equal(resolveAdmin({ NODE_RED_ADMIN_HASH: GOOD.replace('$2y$', '$2b$') }).enabled, true);
});
test('admin: hash ตัวอย่าง demo1234 เปิดได้แต่ถูกทำเครื่องหมาย sample (ให้ log เตือน)', () => {
  const r = resolveAdmin({ NODE_RED_ADMIN_HASH: SAMPLE_HASH });
  assert.equal(r.enabled, true);
  assert.equal(r.sample, true);
  assert.equal(resolveAdmin({ NODE_RED_ADMIN_HASH: GOOD }).sample, false);
});

// ---- raw body middleware ----
function run(method, path) {
  const calls = [];
  const fakeExpress = { raw: () => (req, res, next) => { calls.push('raw'); next(); } };
  const mw = createRawBodyMiddleware(fakeExpress);
  mw({ method, path }, {}, () => calls.push('next'));
  return calls;
}
test('raw body: จับเฉพาะ POST /line/webhook แบบ exact', () => {
  assert.deepEqual(run('POST', '/line/webhook'), ['raw', 'next']);
});
test('raw body: method อื่น / path อื่น / trailing slash / ตัวพิมพ์ต่าง / prefix → ข้าม (ไม่แตะ body ของ route อื่น)', () => {
  for (const [m, p] of [['GET', '/line/webhook'], ['PUT', '/line/webhook'], ['POST', '/line/webhook/'], ['POST', '/LINE/webhook'], ['POST', '/line/webhook2'],
    ['POST', '/api/auth/login'], ['POST', '/flows'], ['POST', '/auth/token'], ['POST', '/'], ['POST', '/api/line/link-code'], ['POST', '/x/line/webhook']]) {
    assert.deepEqual(run(m, p), ['next'], m + ' ' + p);
  }
});
