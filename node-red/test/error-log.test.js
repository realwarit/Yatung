const test = require('node:test');
const assert = require('node:assert/strict');
const { describe, format, report, codeOf, pathOf, MAX_MESSAGE } = require('../data/lib/error-log');

const msgOf = (message, extra = {}) => ({ error: { message, source: { id: 'abc123', type: 'mysql' }, ...extra }, req: { method: 'post', originalUrl: '/api/medications?token=SECRET&x=1', headers: { authorization: 'Bearer SECRETTOKEN' } }, payload: { password: 'hunter2' } });

test('มี code, message, method, path ครบ และ path ไม่มี query', () => {
  const d = describe(msgOf('Error: ER_BAD_FIELD_ERROR: Unknown column \'tts_name\' in \'field list\''));
  assert.equal(d.code, 'ER_BAD_FIELD_ERROR');
  assert.equal(d.method, 'POST');
  assert.equal(d.path, '/api/medications');
  assert.match(d.message, /Unknown column/);
  assert.equal(d.node, 'abc123');
});

test('err.code มาก่อนการดึงจากข้อความ', () => {
  assert.equal(codeOf({ code: 'ECONNREFUSED', message: 'ER_X' }), 'ECONNREFUSED');
  assert.equal(codeOf({ message: 'ไม่มีรหัส' }), 'none');
  assert.equal(codeOf(undefined), 'none');
});

test('ตัดข้อความไม่เกิน 200 ตัวอักษร', () => {
  const d = describe(msgOf('x'.repeat(5000)));
  assert.ok(d.message.length <= MAX_MESSAGE);
});

test('ไม่รั่ว body / token / header / query ใน log', () => {
  const line = format(msgOf('boom'));
  for (const secret of ['hunter2', 'SECRETTOKEN', 'SECRET', 'authorization', 'Bearer', 'x=1']) assert.ok(!line.includes(secret), secret);
});

test('ปิดข้อมูลส่วนตัวในข้อความ: JWT, อีเมล, Duplicate entry, เลข 13 หลัก', () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = [b64({ alg: 'HS256' }), b64({ sub: '1' }), 'c2lnbmF0dXJl'].join('.');   // สร้างตอนรัน ไม่ฝังค่าที่หน้าตาเป็น token
  const line = format(msgOf(`dup Duplicate entry 'somchai@example.com' for key 'email' jwt ${jwt} id 1234567890123 Bearer abc.def`));
  assert.ok(!line.includes('somchai'));
  assert.ok(!line.includes('eyJhbGci'));
  assert.ok(!line.includes('1234567890123'));
  assert.ok(!line.includes('abc.def'));
  assert.match(line, /Duplicate entry '\[value\]'/);
});

test('ข้อความหลายบรรทัดกลายเป็นบรรทัดเดียว (กัน log injection)', () => {
  const line = format(msgOf('a\nFAKE LINE\r\nb'));
  assert.ok(!/[\r\n]/.test(line));
});

test('ไม่มี req (cron) ใช้ - และ token ยาวใน path ถูกซ่อน', () => {
  const d = describe({ error: { message: 'x' } });
  assert.equal(d.method, '-');
  assert.equal(d.path, '-');
  assert.equal(pathOf({ originalUrl: '/api/push/' + 'a'.repeat(40) + '?q=1' }), '/api/push/:x');
  assert.equal(pathOf({ url: '/api/doses/12/take' }), '/api/doses/12/take');
});

test('msg ว่าง/ไม่มี error ไม่ throw', () => {
  assert.doesNotThrow(() => format({}));
  assert.doesNotThrow(() => format(undefined));
});

test('report เรียก node.error ด้วยสตริงอย่างเดียว (ไม่ส่ง msg → catch ไม่วน)', () => {
  const calls = [];
  const line = report({ error: (...a) => calls.push(a) }, msgOf('boom'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 1);
  assert.equal(calls[0][0], line);
  assert.match(line, /^unexpected_error method=POST path=\/api\/medications code=none/);
});
