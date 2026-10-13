const test = require('node:test');
const os = require('node:os');
const fsx = require('node:fs');
const pathx = require('node:path');
// ห้ามเขียนลง node-red/data/logs/errors.log จริงตอนทดสอบ
process.env.ERROR_LOG_FILE = pathx.join(fsx.mkdtempSync(pathx.join(os.tmpdir(), 'yt-errlog-')), 'errors.log');
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

test('report เขียนบรรทัดเดียวกันต่อท้ายไฟล์ พร้อมเวลาไทยนำหน้า (ไม่มี body/token)', () => {
  const lib = require('../data/lib/error-log');
  const file = process.env.ERROR_LOG_FILE;
  const line = lib.report({ error: () => {} }, msgOf('boom'));
  const text = fsx.readFileSync(file, 'utf8');
  assert.match(text, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} unexpected_error method=POST path=\/api\/medications /);
  assert.ok(text.includes(line));
  for (const secret of ['hunter2', 'SECRETTOKEN', 'x=1']) assert.ok(!text.includes(secret), secret);
});

test('stamp เป็นเวลาไทย (UTC+7) ไม่พึ่ง TZ ของ process', () => {
  assert.equal(require('../data/lib/error-log').stamp(new Date('2026-10-13T17:30:05Z')), '2026-10-14 00:30:05');
});

test('หมุนไฟล์เมื่อเกิน 1 MB เก็บ 3 ไฟล์ (errors.log, .1, .2) และเขียนไฟล์ไม่ได้ไม่ทำให้พัง', () => {
  const lib = require('../data/lib/error-log');
  const dir = fsx.mkdtempSync(pathx.join(os.tmpdir(), 'yt-rot-'));
  const file = pathx.join(dir, 'errors.log');
  const big = 'x'.repeat(lib.MAX_FILE_BYTES);
  for (let i = 0; i < 4; i++) { fsx.writeFileSync(file, big); assert.equal(lib.appendToFile('บรรทัดใหม่ ' + i, new Date(), file), true); }
  const names = fsx.readdirSync(dir).sort();
  assert.deepEqual(names, ['errors.log', 'errors.log.1', 'errors.log.2']);
  assert.match(fsx.readFileSync(file, 'utf8'), /^\d{4}-.* บรรทัดใหม่ 3\n$/);
  assert.equal(lib.appendToFile('x', new Date(), pathx.join(file, 'ไม่มีทาง', 'e.log')), false);
});
