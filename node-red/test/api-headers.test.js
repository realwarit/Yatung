const test = require('node:test');
const assert = require('node:assert/strict');
const { noStoreApi } = require('../data/lib/api-headers');

const run = (path, headers = {}) => {
  const req = { path, url: path + '?x=1', headers: { ...headers } };
  const set = {};
  const res = { setHeader: (k, v) => { set[k] = v; } };
  let nexted = 0;
  noStoreApi(req, res, () => { nexted++; });
  return { req, set, nexted };
};

test('/api/* → Cache-Control: private, no-store และตัด validator ของคำขอ (ไม่มี 304)', () => {
  const r = run('/api/medications', { 'if-none-match': 'W/"abc"', 'if-modified-since': 'x', authorization: 'Bearer t' });
  assert.equal(r.set['Cache-Control'], 'private, no-store');
  assert.equal(r.req.headers['if-none-match'], undefined);
  assert.equal(r.req.headers['if-modified-since'], undefined);
  assert.equal(r.req.headers.authorization, 'Bearer t');   // ไม่แตะ header อื่น
  assert.equal(r.nexted, 1);
});

test('path อื่น (webhook, editor, /apikey) ไม่ถูกแตะ', () => {
  for (const p of ['/line/webhook', '/', '/flows', '/apikey', '/api']) {
    const r = run(p, { 'if-none-match': 'W/"abc"' });
    assert.deepEqual(r.set, {}, p);
    assert.equal(r.req.headers['if-none-match'], 'W/"abc"', p);
    assert.equal(r.nexted, 1);
  }
});
