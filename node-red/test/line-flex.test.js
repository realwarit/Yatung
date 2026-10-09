const test = require('node:test');
const assert = require('node:assert/strict');
const flex = require('../data/lib/line-flex');

const ENV = { PUBLIC_BASE_URL: 'https://demo.ngrok-free.dev' };
const doses = [
  { id: 101, name: 'Metformin', strength: '500 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'after' },
  { id: 102, name: 'Amlodipine', strength: null, dose_per_time: 0.5, unit: 'tablet', meal_relation: 'any' }
];
const group = { slot: 'morning', scheduled_at: '2026-10-09 08:00:00', doses };
const all = (o, out = []) => { if (Array.isArray(o)) o.forEach((x) => all(x, out)); else if (o && typeof o === 'object') { out.push(o); Object.values(o).forEach((x) => all(x, out)); } return out; };

test('altText ตามแผน', () => {
  assert.equal(flex.buildReminder(group, ENV).altText, '⏰ ถึงเวลากินยามื้อเช้าแล้ว (2 รายการ)');
  assert.equal(flex.buildReminder({ ...group, slot: 'bedtime', doses: [doses[0]] }, ENV).altText, '⏰ ถึงเวลากินยามื้อก่อนนอนแล้ว (1 รายการ)');
});

test('ส่วนหัว: ข้อความ "ถึงเวลากินยามื้อเช้าแล้วนะคะ" + เวลา "08:00 น." + รูปน้องยาตรง', () => {
  const m = flex.buildReminder(group, ENV);
  const nodes = all(m.contents.header);
  assert.ok(nodes.some((n) => n.type === 'text' && n.text === 'ถึงเวลากินยามื้อเช้าแล้วนะคะ'));
  assert.ok(nodes.some((n) => n.type === 'text' && n.text === '08:00 น.'));
  const img = nodes.find((n) => n.type === 'image');
  assert.equal(img.url, 'https://demo.ngrok-free.dev/line/mascot.png');
});

test('LINE_MASCOT_URL override ได้ ; ไม่ใช่ https = ไม่ใส่รูปแต่ยังส่งข้อความได้', () => {
  assert.equal(flex.mascotUrl({ PUBLIC_BASE_URL: 'https://a.b/', LINE_MASCOT_URL: 'https://cdn.example/m.png' }), 'https://cdn.example/m.png');
  assert.equal(flex.mascotUrl({ PUBLIC_BASE_URL: 'https://a.b/' }), 'https://a.b/line/mascot.png');
  assert.equal(flex.mascotUrl({ PUBLIC_BASE_URL: 'http://localhost:8080' }), null);
  assert.equal(flex.mascotUrl({}), null);
  const m = flex.buildReminder(group, { PUBLIC_BASE_URL: 'http://localhost:8080' });
  assert.ok(!all(m.contents).some((n) => n.type === 'image'));
});

test('เนื้อหา: ชื่อยา+ความแรงตัวใหญ่ (xl) และบรรทัดรองภาษาไทยเดียวกับเว็บ', () => {
  const body = all(flex.buildReminder(group, ENV).contents.body);
  const t1 = body.find((n) => n.type === 'text' && n.text === 'Metformin 500 mg');
  assert.ok(t1);
  assert.equal(t1.size, 'xl');
  assert.ok(body.some((n) => n.text === 'ครั้งละ 1 เม็ด · หลังอาหาร'));
  assert.ok(body.some((n) => n.text === 'Amlodipine' && n.size === 'xl'));
  assert.ok(body.some((n) => n.text === 'ครั้งละ ½ เม็ด · ไม่เกี่ยวกับอาหาร'));
});

test('ปุ่มหลัก "✓ กินแล้ว" สี #0f766e เป็น postback + displayText ; ปุ่มรอง "เปิดแอป" ไป /today', () => {
  const footer = flex.buildReminder(group, ENV).contents.footer.contents;
  const primary = footer[0];
  assert.equal(primary.style, 'primary');
  assert.equal(primary.color, '#0f766e');
  assert.equal(primary.action.type, 'postback');
  assert.equal(primary.action.label, '✓ กินแล้ว');
  assert.equal(primary.action.displayText, 'กินยามื้อเช้าแล้ว');
  assert.equal(primary.action.data, 'a=take&d=101,102');
  assert.equal(footer[1].action.type, 'uri');
  assert.equal(footer[1].action.label, 'เปิดแอป');
  assert.equal(footer[1].action.uri, 'https://demo.ngrok-free.dev/today');
  assert.equal(flex.buildReminder(group, {}).contents.footer.contents.length, 1);   // ไม่มี PUBLIC_BASE_URL = ไม่มีปุ่มเปิดแอป
});

test('postback data ≤ 300 ตัวอักษรเสมอ (แบ่งก้อน) และไม่เกิน 15 รายการ/ข้อความ', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ ...doses[0], id: 9000000000000 + i }));
  const chunks = flex.chunkDoses(many);
  assert.equal(chunks.flat().length, 60);
  for (const c of chunks) {
    assert.ok(c.length <= flex.MAX_DOSES_PER_MESSAGE);
    assert.ok(flex.postbackData(c.map((d) => d.id)).length <= 300);
    assert.ok(flex.buildReminder({ ...group, doses: c }, ENV).contents.footer.contents[0].action.data.length <= 300);
  }
  assert.equal(flex.chunkDoses(doses).length, 1);
  assert.deepEqual(flex.chunkDoses([]), []);
});

test('ข้อความไม่มีชื่อผู้ป่วย/userId และ altText ไม่เกิน 400', () => {
  const m = flex.buildReminder({ ...group, doses: Array.from({ length: 15 }, (_, i) => ({ ...doses[0], id: i + 1 })) }, ENV);
  assert.ok(m.altText.length <= 400);
  assert.ok(!JSON.stringify(m).includes('line_user_id'));
  assert.equal(m.type, 'flex');
  assert.equal(m.contents.type, 'bubble');
});
