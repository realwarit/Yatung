const test = require('node:test');
const assert = require('node:assert/strict');
const flex = require('../data/lib/line-flex');

const ENV = { PUBLIC_BASE_URL: 'https://demo.ngrok-free.dev' };
const doses = [
  { id: 101, name: 'Metformin', strength: '500 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'after' },
  { id: 102, name: 'Amlodipine', strength: null, dose_per_time: 0.5, unit: 'tablet', meal_relation: 'any' }
];
const group = { slot: 'morning', scheduled_at: '2026-10-09 08:00:00', late_min: 2, doses };
const all = (o, out = []) => { if (Array.isArray(o)) o.forEach((x) => all(x, out)); else if (o && typeof o === 'object') { out.push(o); Object.values(o).forEach((x) => all(x, out)); } return out; };
const texts = (m) => all(m.contents).filter((n) => n.type === 'text').map((n) => n.text);

test('altText ตามช่วงเวลา: ถึงเวลา / เลยเวลา / ใกล้ถึงเวลา', () => {
  assert.equal(flex.buildReminder(group, ENV).altText, '⏰ ถึงเวลากินยามื้อเช้าแล้ว (2 รายการ)');
  assert.equal(flex.buildReminder({ ...group, slot: 'bedtime', doses: [doses[0]] }, ENV).altText, '⏰ ถึงเวลากินยามื้อก่อนนอนแล้ว (1 รายการ)');
  assert.equal(flex.buildReminder({ ...group, late_min: 135 }, ENV).altText, '⏰ ยังไม่ได้กินยามื้อเช้า · เลยเวลามา 2 ชม. 15 นาที');
  assert.equal(flex.buildReminder({ ...group, late_min: 45 }, ENV).altText, '⏰ ยังไม่ได้กินยามื้อเช้า · เลยเวลามา 45 นาที');
  assert.equal(flex.buildReminder({ ...group, late_min: -5 }, ENV).altText, '⏰ อีก 5 นาที ถึงเวลากินยามื้อเช้า');
});

test('ขอบเวลา lateness −1 / 0 / 29 / 30 นาที', () => {
  const head = (late) => texts(flex.buildReminder({ ...group, late_min: late }, ENV));
  assert.ok(head(-1).includes('ใกล้ถึงเวลากินยาแล้วนะคะ'));          // −1 = ใกล้ถึงเวลา
  assert.ok(head(-1).includes('🌅 มื้อเช้า · 08:00 น. (อีก 1 นาที)'));
  assert.ok(head(0).includes('ถึงเวลากินยาแล้วนะคะ'));               // 0 = ถึงเวลา
  assert.ok(head(0).includes('🌅 มื้อเช้า · 08:00 น.'));
  assert.ok(head(29).includes('ถึงเวลากินยาแล้วนะคะ'));              // 29 = ยังปกติ
  assert.ok(head(30).includes('ยังไม่ได้กินยามื้อเช้านะคะ'));          // 30 = เลยเวลา (เหลือง)
  assert.ok(head(30).includes('⏰ เลยเวลามา 30 นาที'));
  assert.equal(flex.latenessState(-0.01), 'soon');
  assert.equal(flex.latenessState(0), 'due');
  assert.equal(flex.latenessState(29.99), 'due');
  assert.equal(flex.latenessState(30), 'overdue');
  // เลยเวลา = หัวพื้นเหลือง (--yt-warning-soft) ; ปกติ = พื้นมิ้นต์
  assert.equal(flex.buildReminder({ ...group, late_min: 30 }, ENV).contents.header.backgroundColor, '#fef3c7');
  assert.equal(flex.buildReminder({ ...group, late_min: 0 }, ENV).contents.header.backgroundColor, '#e8f7f3');
  assert.equal(flex.buildReminder({ ...group, late_min: -1 }, ENV).contents.header.backgroundColor, '#e8f7f3');
});

test('durationText: นาที / ชม. / ชม.+นาที', () => {
  assert.equal(flex.durationText(1), '1 นาที');
  assert.equal(flex.durationText(59.4), '59 นาที');
  assert.equal(flex.durationText(60), '1 ชม.');
  assert.equal(flex.durationText(125), '2 ชม. 5 นาที');
});

test('ส่วนหัวใช้ท่ากระดิ่ง ; รูปมาจาก LINE_ASSET_BASE / PUBLIC_BASE_URL/line', () => {
  const img = all(flex.buildReminder(group, ENV).contents.header).find((n) => n.type === 'image');
  assert.equal(img.url, 'https://demo.ngrok-free.dev/line/mascot-bell.png');
  assert.equal(flex.mascotUrl('cheer', { LINE_ASSET_BASE: 'https://cdn.example/x/' }), 'https://cdn.example/x/mascot-cheer.png');
  assert.equal(flex.mascotUrl('hello', { PUBLIC_BASE_URL: 'https://a.b/' }), 'https://a.b/line/mascot-hello.png');
});

test('LINE_MASCOT_URL (ตัวแปรเดิม) ใช้เป็นท่ากระดิ่งต่อไป ; ท่าอื่นไม่กระทบ', () => {
  const env = { PUBLIC_BASE_URL: 'https://a.b/', LINE_MASCOT_URL: 'https://cdn.example/m.png' };
  assert.equal(flex.mascotUrl('bell', env), 'https://cdn.example/m.png');
  assert.equal(flex.mascotUrl('cheer', env), 'https://a.b/line/mascot-cheer.png');
});

test('รูปไม่ใช่ https / ไม่มี base = ไม่ใส่รูปแต่ยังส่งข้อความได้', () => {
  assert.equal(flex.mascotUrl('bell', { PUBLIC_BASE_URL: 'http://localhost:8080' }), null);
  assert.equal(flex.mascotUrl('bell', {}), null);
  assert.equal(flex.mascotUrl('unknown', ENV), null);
  const m = flex.buildReminder(group, { PUBLIC_BASE_URL: 'http://localhost:8080' });
  assert.ok(!all(m.contents).some((n) => n.type === 'image'));
});

test('เนื้อหา: ชื่อยา+ความแรงตัวใหญ่ (xl) และบรรทัดรองภาษาไทยเดียวกับเว็บ (md)', () => {
  const body = all(flex.buildReminder(group, ENV).contents.body);
  const t1 = body.find((n) => n.type === 'text' && n.text === 'Metformin 500 mg');
  assert.equal(t1.size, 'xl');
  const sub = body.find((n) => n.text === 'ครั้งละ 1 เม็ด · หลังอาหาร');
  assert.equal(sub.size, 'md');
  assert.ok(body.some((n) => n.text === 'Amlodipine' && n.size === 'xl'));
  assert.ok(body.some((n) => n.text === 'ครั้งละ ½ เม็ด · ไม่เกี่ยวกับอาหาร'));
});

test('ยาเกิน 6 รายการ: แสดง 6 แล้ว "+ อีก n รายการ" แต่ postback มี id ครบ', () => {
  const ds = Array.from({ length: 9 }, (_, i) => ({ ...doses[0], id: 500 + i, name: 'ยา' + i }));
  const m = flex.buildReminder({ ...group, doses: ds }, ENV);
  const body = texts({ contents: m.contents.body });
  assert.equal(body.filter((t) => /^ยา\d/.test(t)).length, 6);
  assert.ok(body.includes('+ อีก 3 รายการ'));
  assert.equal(m.contents.footer.contents[0].action.data, 'a=take&d=500,501,502,503,504,505,506,507,508');
  // 6 พอดี = ไม่มีบรรทัด "+ อีก"
  assert.ok(!texts({ contents: flex.buildReminder({ ...group, doses: ds.slice(0, 6) }, ENV).contents.body }).some((t) => t.startsWith('+ อีก')));
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
  assert.equal(footer[1].style, 'secondary');
  assert.equal(footer[1].action.label, 'เปิดแอป');
  assert.equal(footer[1].action.uri, 'https://demo.ngrok-free.dev/today');
  assert.equal(flex.buildReminder(group, {}).contents.footer.contents.length, 1);   // ไม่มี PUBLIC_BASE_URL = ไม่มีปุ่มเปิดแอป
  // ตัวอย่าง: ปุ่มกินแล้วเป็น a=preview ไม่แตะข้อมูลจริง
  assert.equal(flex.buildReminder(group, ENV, { preview: true }).contents.footer.contents[0].action.data, 'a=preview');
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

test('ตัวอักษร: หัวข้อ ≥ lg, ชื่อยา ≥ xl, ข้อความรอง ≥ md ; text/button ทุกตัวมี scaling: true', () => {
  const ORDER = ['xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl', '3xl'];
  for (const late of [-5, 3, 90]) {
    const m = flex.buildReminder({ ...group, late_min: late }, ENV);
    const nodes = all(m.contents);
    for (const n of nodes.filter((x) => x.type === 'text')) {
      assert.equal(n.scaling, true, n.text);
      assert.ok(ORDER.indexOf(n.size) >= ORDER.indexOf('md'), `${n.text} size=${n.size}`);
    }
    for (const n of nodes.filter((x) => x.type === 'button')) assert.equal(n.scaling, true);
    const title = all(m.contents.header).find((n) => n.type === 'text');
    assert.ok(ORDER.indexOf(title.size) >= ORDER.indexOf('lg'));
  }
});

test('หัวข้อสั้นพอดีบรรทัดเดียวบนจอ 375px (≤ 26 ตัวอักษรฐาน ไม่นับสระ/วรรณยุกต์ลอย)', () => {
  const base = (s) => [...s].filter((c) => !/[ัิ-ฺ็-๎]/.test(c)).length;
  for (const slot of ['morning', 'noon', 'evening', 'bedtime']) {
    for (const late of [-30, 0, 100]) {
      const title = all(flex.buildReminder({ ...group, slot, late_min: late }, ENV).contents.header).find((n) => n.type === 'text').text;
      assert.ok(base(title) <= 26, `${title} = ${base(title)}`);
    }
  }
});

test('ข้อความไม่มีชื่อผู้ป่วย/userId, altText ≤ 400, bubble ≤ 30 KB', () => {
  const m = flex.buildReminder({ ...group, doses: Array.from({ length: 15 }, (_, i) => ({ ...doses[0], id: i + 1 })) }, ENV);
  assert.ok(m.altText.length <= 400);
  assert.ok(Buffer.byteLength(JSON.stringify(m.contents)) <= flex.MAX_BUBBLE_BYTES);
  assert.ok(!JSON.stringify(m).includes('line_user_id'));
  assert.equal(m.type, 'flex');
  assert.equal(m.contents.type, 'bubble');
});

test('quickReply ตามประเภทผู้ใช้', () => {
  const labels = (ctx, env = ENV) => flex.quickReply(ctx, env).items.map((i) => i.action.label);
  assert.deepEqual(labels('patient'), ['📋 ยาวันนี้', '📱 เปิดแอป', '❓ ช่วยเหลือ']);
  assert.deepEqual(labels('unlinked'), ['🔗 วิธีเชื่อมบัญชี', '📱 เปิดแอป']);
  assert.deepEqual(labels('caregiver'), ['❓ ช่วยเหลือ']);
  const p = flex.quickReply('patient', ENV).items;
  assert.deepEqual(p[0].action, { type: 'message', label: '📋 ยาวันนี้', text: 'วันนี้' });
  assert.equal(p[1].action.uri, 'https://demo.ngrok-free.dev/today');
  assert.equal(p[2].action.text, 'ช่วยเหลือ');
  assert.equal(flex.quickReply('unlinked', ENV).items[0].action.text, 'วิธีใช้');
  assert.equal(flex.quickReply('unlinked', ENV).items[1].action.uri, 'https://demo.ngrok-free.dev/settings');
  assert.deepEqual(labels('patient', {}), ['📋 ยาวันนี้', '❓ ช่วยเหลือ']);          // ไม่มี PUBLIC_BASE_URL = ไม่มีปุ่มลิงก์
  for (const ctx of ['patient', 'unlinked', 'caregiver']) for (const i of flex.quickReply(ctx, ENV).items) assert.ok(i.action.label.length <= 20);
});

test('withQuickReply: แนบเฉพาะข้อความสุดท้าย และไม่แก้ object เดิม', () => {
  const a = { type: 'text', text: 'a' }, b = { type: 'text', text: 'b' };
  const out = flex.withQuickReply([a, b], 'caregiver', ENV);
  assert.equal(out[0].quickReply, undefined);
  assert.ok(out[1].quickReply.items.length);
  assert.equal(b.quickReply, undefined);
  assert.deepEqual(flex.withQuickReply([], 'patient', ENV), []);
});
