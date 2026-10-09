const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const svc = require('../data/lib/line-service');
const cg = require('../data/lib/caregiver-service');

const SECRET = 'test-secret-ไม่ใช่ของจริง';
const sign = (buf) => crypto.createHmac('sha256', SECRET).update(buf).digest('base64');

test('signature: ถูกต้อง (ASCII และภาษาไทยที่มีช่องว่าง/escape แปลกๆ)', () => {
  for (const body of ['{"events":[]}', '{"events":[{"message":{"text":"สวัสดี  ค่ะ \\" \\\\ \\u0e01 \\n"}}], "x" :  1}']) {
    const buf = Buffer.from(body, 'utf8');
    assert.equal(svc.verifySignature(buf, sign(buf), SECRET), true);
  }
});
test('signature: ผิด / ไม่มี / secret ว่าง / body ถูกจัดรูปใหม่', () => {
  const buf = Buffer.from('{"events":[]}');
  assert.equal(svc.verifySignature(buf, sign(Buffer.from('{"events": []}')), SECRET), false);   // JSON.stringify ซ้ำ = bytes ต่าง
  assert.equal(svc.verifySignature(buf, undefined, SECRET), false);
  assert.equal(svc.verifySignature(buf, '', SECRET), false);
  assert.equal(svc.verifySignature(buf, sign(buf), ''), false);
  assert.equal(svc.verifySignature(buf, sign(buf), undefined), false);
  assert.equal(svc.verifySignature('ไม่ใช่ Buffer', sign(buf), SECRET), false);
});
test('signature: ความยาวต่างกันต้องไม่ throw', () => {
  const buf = Buffer.from('{}');
  for (const h of ['abc', 'a', '====', sign(buf) + 'AAAA', sign(buf).slice(0, 10), 'ไทย']) {
    assert.doesNotThrow(() => svc.verifySignature(buf, h, SECRET));
    assert.equal(svc.verifySignature(buf, h, SECRET), false);
  }
});

test('randomCode: 6 หลักเสมอ รวมเลขนำหน้า 0', () => {
  assert.equal(svc.randomCode(() => 7), '000007');
  assert.equal(svc.randomCode(() => 999999), '999999');
  for (let i = 0; i < 200; i++) assert.match(svc.randomCode(), /^\d{6}$/);
});
test('randomCode: ใช้ crypto.randomInt (0..1,000,000)', () => {
  let args;
  svc.randomCode((a, b) => { args = [a, b]; return 1; });
  assert.deepEqual(args, [0, 1000000]);
});
test('parseCode: ตัด space / ขีด / เลขไทย', () => {
  assert.equal(svc.parseCode('482913'), '482913');
  assert.equal(svc.parseCode(' 482 913 '), '482913');
  assert.equal(svc.parseCode('482-913'), '482913');
  assert.equal(svc.parseCode('๔๘๒๙๑๓'), '482913');
  assert.equal(svc.parseCode('000007'), '000007');
});
test('parseCode: ไม่ใช่เลข 6 หลักล้วน → null', () => {
  for (const t of ['12345', '1234567', 'abc123', '48291a', 'รหัส 482913', '', '   ', null, undefined, 482913]) assert.equal(svc.parseCode(t), null);
});
test('formatCode', () => assert.equal(svc.formatCode('482913'), '482 913'));

test('oaMessageUrl: @ เป็น %40 และเลขรหัสต่อท้าย', () => {
  assert.equal(svc.oaMessageUrl('@014rktvr', '482913'), 'https://line.me/R/oaMessage/%40014rktvr/?482913');
  assert.equal(svc.oaMessageUrl('', '482913'), null);
  assert.equal(svc.oaMessageUrl(undefined, '1'), null);
});

test('dedup: webhookEventId ซ้ำภายใน 10 นาทีถูกข้าม หลังจากนั้นผ่าน', () => {
  const dup = svc.createDedup(10 * 60 * 1000);
  assert.equal(dup('a', 1000), false);
  assert.equal(dup('a', 2000), true);
  assert.equal(dup('b', 2000), false);
  assert.equal(dup('a', 1000 + 10 * 60 * 1000 + 1), false);
  assert.equal(dup(undefined), false);
});
test('guess limiter: ผิดครบ 5 ครั้งใน 10 นาทีถูกบล็อก ; reset ปลดล็อก ; หมดหน้าต่างปลดเอง', () => {
  const l = svc.createGuessLimiter(5, 600000);
  for (let i = 0; i < 4; i++) l.fail('U1', 1000 + i);
  assert.equal(l.blocked('U1', 2000), false);
  l.fail('U1', 2001);
  assert.equal(l.blocked('U1', 2002), true);
  assert.equal(l.blocked('U2', 2002), false);
  assert.equal(l.blocked('U1', 1000 + 600000 + 2002), false);
  l.reset('U1');
  assert.equal(l.blocked('U1', 2002), false);
});

test('todaySummaryText: จัดตามมื้อ มีสถานะ และใช้ป้ายไทย', () => {
  const shaped = { body: { summary: { total: 2, taken: 1, pending: 1, missed: 0 }, slots: [
    { slot: 'morning', time: '08:00', doses: [
      { name: 'Metformin', strength: '500 mg', dose_per_time: 0.5, unit: 'tablet', meal_relation: 'after', status: 'taken' },
      { name: 'Amlodipine', strength: null, dose_per_time: 1, unit: 'tablet', meal_relation: 'any', status: 'pending' }] }] } };
  const t = svc.todaySummaryText(shaped);
  assert.match(t, /ยาของวันนี้ 2 รายการ/);
  assert.match(t, /มื้อเช้า 08:00 น\./);
  assert.match(t, /✓ Metformin 500 mg ครั้งละ ½ เม็ด · หลังอาหาร/);
  assert.match(t, /• Amlodipine ครั้งละ 1 เม็ด/);
  assert.equal(svc.todaySummaryText({ body: { summary: { total: 0 }, slots: [] } }), null);
});

test('caregiver validate: ค่าเริ่มต้นและขอบเขต 10–720', () => {
  assert.deepEqual(cg.validate({ name: ' ลูกสาว ' }, false).value, { name: 'ลูกสาว', escalate_after_min: 60 });
  assert.equal(cg.validate({ name: 'ก', escalate_after_min: 10 }, false).value.escalate_after_min, 10);
  assert.equal(cg.validate({ name: 'ก', escalate_after_min: 720 }, false).value.escalate_after_min, 720);
  for (const n of [9, 721, 10.5, '60', null]) assert.ok(cg.validate({ name: 'ก', escalate_after_min: n }, false).error, String(n));
  assert.ok(cg.validate({}, false).error);
  assert.ok(cg.validate({ name: '   ' }, false).error);
  assert.ok(cg.validate({ name: 'x'.repeat(101) }, false).error);
  assert.ok(cg.validate({ name: 'ก', relation: 'x'.repeat(51) }, false).error);
  assert.deepEqual(cg.validate({ relation: '' }, true).value, { relation: null });
  assert.deepEqual(cg.validate({}, true).value, {});
});
