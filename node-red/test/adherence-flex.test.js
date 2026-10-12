const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../data/lib/line-messages');
const svc = require('../data/lib/line-service');
const S = require('../data/lib/stats-service');
const { levelOf } = require('../data/lib/adherence-level');

const ENV = { PUBLIC_BASE_URL: 'https://demo.ngrok-free.dev', DEMO_MODE: 'false' };
const NOW = new Date('2026-10-12T07:30:00Z');
const all = (o, out = []) => { if (Array.isArray(o)) o.forEach((x) => all(x, out)); else if (o && typeof o === 'object') { out.push(o); Object.values(o).forEach((x) => all(x, out)); } return out; };
const texts = (m) => all(m).filter((n) => n.type === 'text').map((n) => n.text);

const stats = (rowsDaily, rowsDetail = [], meds = []) => S.buildReport({ rowsDaily, rowsDetail, meds, now: NOW, days: 7 });
const d = (date, taken, missed, pending_due = 0, upcoming = 0) => ({ date, taken, missed, pending_due, upcoming });
const GOOD = stats([d('2026-10-10', 3, 0), d('2026-10-11', 3, 0), d('2026-10-12', 2, 1, 0, 1)]);
const NONE = stats([]);

test('Flex สรุป (ผู้ป่วย): altText, ตัวเลข, แถว 7 วัน, ข้อความตามระดับ, ปุ่มไป /overview', () => {
  const m = M.buildAdherence(GOOD, ENV);
  assert.equal(m.altText, `📊 สรุปการกินยา 7 วัน: ${GOOD.overall.rate}%`);
  assert.ok(m.altText.length <= 400);
  const t = texts(m.contents);
  assert.ok(t.includes(`${GOOD.overall.rate}%`));
  assert.ok(t.includes(levelOf(GOOD.overall.rate).text));
  assert.ok(t.some((x) => x.startsWith('🌟 กินครบติดกัน')));
  const dots = all(m.contents).find((n) => n.layout === 'horizontal' && n.contents.length === 7);
  assert.ok(dots);
  assert.deepEqual(dots.contents.map((c) => c.contents[0].text), ['–', '–', '–', '–', '✓', '✓', '●']);   // ไม่มียา ×4 · ครบ ×2 · วันนี้
  const btn = all(m.contents).find((n) => n.type === 'button');
  assert.equal(btn.action.label, 'ดูรายละเอียด');
  assert.equal(btn.action.uri, 'https://demo.ngrok-free.dev/overview');
  assert.ok(Buffer.byteLength(JSON.stringify(m.contents)) <= 30000);
});

test('Flex สรุป: วันที่ไม่ครบเป็น ✕ · ไม่มีข้อมูลเลย = "–" + ข้อความ "ยังไม่มีข้อมูลยา" และ altText ไม่ใส่ตัวเลข', () => {
  const m = M.buildAdherence(stats([d('2026-10-09', 1, 2), d('2026-10-11', 0, 1)]), ENV);
  const dots = all(m.contents).find((n) => n.layout === 'horizontal' && n.contents.length === 7);
  assert.deepEqual(dots.contents.map((c) => c.contents[0].text).slice(3, 7), ['✕', '–', '✕', '●']);
  const n = M.buildAdherence(NONE, ENV);
  assert.equal(n.altText, '📊 สรุปการกินยา 7 วัน: ยังไม่มีข้อมูล');
  assert.ok(texts(n.contents).includes('–'));
  assert.ok(texts(n.contents).includes('ยังไม่มีข้อมูลยาในช่วงนี้ค่ะ'));
  assert.ok(!texts(n.contents).some((x) => x.startsWith('🌟')));
});

test('Flex สรุป (ผู้ดูแล): ชื่อ + อัตรา ไม่มีชื่อยา แม้ stats มีข้อมูลต่อยา', () => {
  const withMeds = stats([d('2026-10-11', 2, 0)], [{ date: '2026-10-11', slot: 'morning', medication_id: 1, source: 'app', taken: 2, missed: 0, pending_due: 0, upcoming: 0 }],
    [{ id: 1, name: 'เมตฟอร์มิน', strength: '500 mg', is_active: 1 }]);
  const m = M.buildCaregiverAdherence([{ name: 'สมชาย ใจดี', stats: withMeds }, { name: 'มาลี ใจงาม', stats: NONE }], ENV);
  const json = JSON.stringify(m);
  assert.ok(!json.includes('เมตฟอร์มิน') && !json.includes('500 mg'));
  const t = texts(m.contents);
  assert.ok(t.includes('คุณสมชาย ใจดี') && t.includes('กินครบ 100% ใน 7 วัน'));
  assert.ok(t.includes('ยังไม่มีข้อมูลยาใน 7 วัน'));
  assert.equal(m.altText, '📊 สรุปการกินยา 7 วันของผู้ที่คุณดูแล 2 คน');
  assert.ok(!all(m.contents).some((n) => n.type === 'button' && n.action.type === 'postback'));
});

test('ทุกข้อความของ "สรุป": text/button มี scaling และตัวอักษร ≥ md ; หัวข้อสั้น ≤ 26', () => {
  const ORDER = ['md', 'lg', 'xl', 'xxl', '3xl', '4xl', '5xl'];
  for (const m of [M.buildAdherence(GOOD, ENV), M.buildAdherence(NONE, ENV), M.buildCaregiverAdherence([{ name: 'ก', stats: GOOD }], ENV)]) {
    for (const n of all(m.contents)) {
      if (n.type === 'text') { assert.equal(n.scaling, true); assert.ok(ORDER.includes(n.size), n.text); }
      if (n.type === 'button') assert.equal(n.scaling, true);
    }
    assert.ok([...'สรุปการกินยา 7 วัน'].length <= 26);
  }
});

// ---- จำลอง DB ให้ statsService รันจริง (ตรวจว่า LINE ใช้ตัวเลขชุดเดียวกับ API) ----
function harness({ patient = null, caregiverOf = [], taken = 0, missed = 0 } = {}) {
  const sent = [];
  const db = {
    async query(sql, params) {
      if (/FROM users WHERE line_user_id/.test(sql)) return patient ? [{ id: 7, display_name: patient }] : [];
      if (/FROM caregivers c JOIN users u/.test(sql)) return caregiverOf.map((n, i) => ({ id: 100 + i, display_name: n }));
      if (/GROUP BY d\.scheduled_date, d\.slot/.test(sql)) return [{ date: '2026-10-11', slot: 'morning', medication_id: 1, source: 'app', taken, missed, pending_due: 0, upcoming: 0 }];
      if (/GROUP BY d\.scheduled_date$/.test(sql)) return [{ date: '2026-10-11', taken, missed, pending_due: 0, upcoming: 0 }];
      if (/FROM medications WHERE user_id/.test(sql)) return [{ id: 1, name: 'ยาลับ', strength: '5 mg', is_active: 1 }];
      return [];
    }
  };
  const client = { async reply(token, messages) { sent.push({ token, messages }); return { ok: true }; }, async push() { throw new Error('ห้าม push'); }, async getProfile() { return null; } };
  return { db, client, sent };
}
const ev = (text) => ({ type: 'message', replyToken: 'rt', source: { userId: 'Uxxxxxxxxxxxxxxxxx' }, message: { type: 'text', text } });
const run = async (h, text) => svc.handleEvent(ev(text), { db: h.db, client: h.client, env: ENV, now: NOW });
const labels = (msgs) => msgs.at(-1).quickReply.items.map((i) => i.action.label);

test('LINE "สรุป": ผู้ป่วย → Flex เดียว (reply เท่านั้น) + quick reply', async () => {
  const h = harness({ patient: 'สมชาย', taken: 3, missed: 1 });
  await run(h, 'สรุป');
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].messages.length, 1);
  assert.match(h.sent[0].messages[0].altText, /^📊 สรุปการกินยา 7 วัน: 75%$/);
  assert.deepEqual(labels(h.sent[0].messages), ['📋 ยาวันนี้', '📊 สรุป', '📱 เปิดแอป', '❓ ช่วยเหลือ']);
});

test('LINE "สรุป": ผู้ดูแลอย่างเดียว → สรุปของผู้ป่วยที่ดูแล ไม่มีชื่อยา', async () => {
  const h = harness({ caregiverOf: ['สมชาย'], taken: 1, missed: 1 });
  await run(h, 'สรุป 7 วัน');
  assert.equal(h.sent[0].messages.length, 1);
  assert.match(h.sent[0].messages[0].altText, /ผู้ที่คุณดูแล 1 คน/);
  assert.ok(!JSON.stringify(h.sent[0].messages).includes('ยาลับ'));
  assert.deepEqual(labels(h.sent[0].messages), ['📊 สรุป', '❓ ช่วยเหลือ']);
});

test('LINE "สรุป": เป็นทั้งผู้ป่วยและผู้ดูแล → ของตัวเองก่อน แล้วผู้ที่ดูแล', async () => {
  const h = harness({ patient: 'สมชาย', caregiverOf: ['มาลี'], taken: 2, missed: 0 });
  await run(h, 'สรุป');
  assert.equal(h.sent[0].messages.length, 2);
  assert.match(h.sent[0].messages[0].altText, /^📊 สรุปการกินยา 7 วัน: 100%$/);
  assert.match(h.sent[0].messages[1].altText, /ผู้ที่คุณดูแล/);
});

test('LINE "สรุป": ยังไม่เชื่อมบัญชี → วิธีเชื่อมเหมือนข้อความอื่น', async () => {
  const h = harness();
  await run(h, 'สรุป');
  assert.equal(h.sent[0].messages[0].type, 'text');
  assert.match(h.sent[0].messages[0].text, /ยังไม่ได้เชื่อมบัญชี/);
});

test('ข้อความที่ไม่ใช่คำสั่ง "สรุป" เป๊ะ ๆ ยังเป็นเมนูช่วยเหลือ และช่วยเหลือมีบรรทัดแนะนำ "สรุป"', async () => {
  const h = harness({ patient: 'สมชาย' });
  await run(h, 'สรุปให้หน่อย');
  assert.match(h.sent[0].messages[0].text, /พิมพ์ "สรุป"/);
});

test('ตัวอย่างทุกแบบของ "สรุป" อยู่ใน #ตัวอย่าง และสร้างได้ครบ', () => {
  const ids = M.samples(ENV).map((s) => s.id);
  for (const id of ['summary-good', 'summary-low', 'summary-none', 'cg-summary']) assert.ok(ids.includes(id), id);
});
