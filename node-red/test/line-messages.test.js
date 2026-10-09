const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../data/lib/line-flex');
const M = require('../data/lib/line-messages');
const svc = require('../data/lib/line-service');

const ENV = { PUBLIC_BASE_URL: 'https://demo.ngrok-free.dev', DEMO_MODE: 'true' };
const all = (o, out = []) => { if (Array.isArray(o)) o.forEach((x) => all(x, out)); else if (o && typeof o === 'object') { out.push(o); Object.values(o).forEach((x) => all(x, out)); } return out; };
const SAMPLES = M.samples(ENV);

// ทุกสตริงที่ผู้ใช้เห็น/ถูกอ่านออกเสียง: text component, ป้ายปุ่ม, altText, quick reply, ข้อความ text (ทีละบรรทัด)
function userLines(messages) {
  const lines = [];
  for (const m of messages) {
    if (m.type === 'text') lines.push(...m.text.split('\n'));
    if (m.type === 'flex') {
      lines.push(m.altText);
      for (const n of all(m.contents)) {
        if (n.type === 'text') lines.push(...n.text.split('\n'));
        if (n.type === 'button') lines.push(n.action.label);
      }
    }
    if (m.quickReply) for (const i of m.quickReply.items) lines.push(i.action.label);
  }
  return lines;
}
// อิโมจิ (รวม keycap 1️⃣ และลำดับ ZWJ) ; ✓ (U+2713) และ ½ ไม่นับเป็นอิโมจิ
const EMOJI = /(?:\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*)|(?:[0-9#*]️?⃣)/gu;

const withQr = SAMPLES.map((s) => ({ ...s, messages: F.withQuickReply(s.messages, s.ctx, ENV) }));
const everyPage = Array.from({ length: M.previewPageCount(ENV) }, (_, i) => M.buildPreviewPage(i + 1, ENV));

test('กฎอิโมจิ: ≤ 1 ตัวต่อบรรทัด และอยู่ต้นบรรทัดหรือท้ายบรรทัดเท่านั้น (ทุกแบบ ทุกหน้า #ตัวอย่าง)', () => {
  const msgSets = [...withQr.map((s) => s.messages), ...everyPage.map((p) => F.withQuickReply(p.messages, 'patient', ENV))];
  let checked = 0;
  for (const msgs of msgSets) {
    for (const line of userLines(msgs)) {
      const t = line.trim();
      const found = [...t.matchAll(EMOJI)];
      checked++;
      assert.ok(found.length <= 1, `อิโมจิเกิน 1 ตัวในบรรทัด: ${t}`);
      if (found.length === 1) {
        const f = found[0];
        assert.ok(f.index === 0 || f.index + f[0].length === t.length, `อิโมจิอยู่กลางประโยค: ${t}`);
      }
    }
  }
  assert.ok(checked > 200);
});

test('ตัวตรวจกฎอิโมจิจับกรณีผิดได้จริง', () => {
  const bad = (t) => { const f = [...t.matchAll(EMOJI)]; return f.length > 1 || (f.length === 1 && !(f[0].index === 0 || f[0].index + f[0][0].length === t.length)); };
  assert.equal(bad('มื้อถัดไป 🌅 เช้า'), true);
  assert.equal(bad('🌅 🌙 สองตัว'), true);
  assert.equal(bad('🌅 มื้อเช้า'), false);
  assert.equal(bad('สวัสดีค่ะ 👋'), false);
  assert.equal(bad('1️⃣ เปิดแอป'), false);
  assert.equal(bad('ปุ่ม ✓ กินแล้ว'), false);   // ✓ ไม่ใช่อิโมจิ
});

test('altText ทุกแบบมีและไม่เกิน 400 ตัวอักษร ; bubble ≤ 30 KB ; text/button มี scaling', () => {
  const ORDER = ['xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl'];
  for (const s of SAMPLES) for (const m of s.messages) {
    if (m.type !== 'flex') continue;
    assert.ok(m.altText && m.altText.length > 6 && m.altText.length <= 400, s.id);
    assert.ok(Buffer.byteLength(JSON.stringify(m.contents)) <= F.MAX_BUBBLE_BYTES, s.id);
    for (const n of all(m.contents)) {
      if (n.type === 'text') { assert.equal(n.scaling, true, `${s.id}: ${n.text}`); assert.ok(ORDER.indexOf(n.size) >= ORDER.indexOf('md'), `${s.id}: ${n.text}`); }
      if (n.type === 'button') assert.equal(n.scaling, true, s.id);
      if (n.type === 'button' && n.action.type === 'postback') assert.ok(n.action.data.length <= 300);
    }
  }
});

test('หัวข้อทุก header สั้นพอดีบรรทัดเดียว (≤ 26 ตัวอักษรฐาน)', () => {
  const base = (s) => [...s].filter((c) => !/[ัิ-ฺ็-๎]/.test(c)).length;
  for (const s of SAMPLES) for (const m of s.messages.filter((x) => x.type === 'flex')) {
    const title = all(m.contents.header).find((n) => n.type === 'text');
    assert.ok(base(title.text) <= 26, `${s.id}: ${title.text} (${base(title.text)})`);
  }
});

test('ข้อความอื่นทุกชนิดไม่มี quickReply ซ้อนเอง (แนบตอนส่งเท่านั้น) และ quickReply ≤ 13 รายการ', () => {
  for (const s of SAMPLES) for (const m of s.messages) assert.equal(m.quickReply, undefined, s.id);
  for (const s of withQr) assert.ok(s.messages.at(-1).quickReply.items.length <= 13);
});

test('4.1 follow: 3 ขั้นตอน + ปุ่มเปิดแอปไป /settings (mascot-hello)', () => {
  const m = M.buildWelcome(false, ENV);
  const t = all(m.contents).filter((n) => n.type === 'text').map((n) => n.text);
  assert.ok(t.includes('สวัสดีค่ะ 👋'));
  assert.ok(t.includes('เริ่มใช้ 3 ขั้นตอน'));
  assert.ok(t.some((x) => x.startsWith('1️⃣')) && t.some((x) => x.startsWith('2️⃣')) && t.some((x) => x.startsWith('3️⃣')));
  assert.equal(all(m.contents.footer).find((n) => n.type === 'button').action.uri, 'https://demo.ngrok-free.dev/settings');
  assert.equal(all(m.contents.header).find((n) => n.type === 'image').url, 'https://demo.ngrok-free.dev/line/mascot-hello.png');
});

test('4.10 วิธีใช้ (เชื่อมแล้ว): เนื้อหาเปลี่ยนเป็นวิธีใช้ปุ่มกินแล้ว/วันนี้/เมนู', () => {
  const m = M.buildWelcome(true, ENV);
  const t = all(m.contents).filter((n) => n.type === 'text').map((n) => n.text).join('|');
  assert.match(t, /วิธีใช้น้องยาตรง/);
  assert.match(t, /กินแล้ว/);
  assert.match(t, /ยาวันนี้/);
  assert.doesNotMatch(t, /เริ่มใช้ 3 ขั้นตอน/);
});

test('4.2/4.3 เชื่อมสำเร็จ: ผู้ป่วย (ปุ่ม "วันนี้") และผู้ดูแล (ชื่อผู้ป่วย + กี่นาที)', () => {
  const p = M.buildLinkedPatient('สมชาย', ENV);
  const texts = all(p.contents).filter((n) => n.type === 'text').map((n) => n.text);
  assert.ok(texts.includes('เชื่อมสำเร็จแล้วค่ะ 🎉'));
  assert.ok(texts.includes('สวัสดีคุณ สมชาย'));
  const btn = all(p.contents.footer).find((n) => n.type === 'button');
  assert.deepEqual(btn.action, { type: 'message', label: '📋 ดูยาวันนี้', text: 'วันนี้' });
  assert.ok(all(M.buildLinkedPatient(null, ENV)).some((n) => n.text === 'สวัสดีค่ะ'));
  // ชื่อ LINE แบบตัวอักษรตกแต่ง → NFKC
  assert.equal(M.niceName('𝐑𝐱 𝐭𝐞𝐬𝐭'), 'Rx test');

  const c = M.buildLinkedCaregiver('มาลี', 90, ENV);
  const ct = all(c.contents).filter((n) => n.type === 'text').map((n) => n.text);
  assert.ok(ct.includes('เชื่อมเป็นผู้ดูแลแล้วค่ะ 💚'));
  assert.ok(ct.includes('ผู้ดูแลของคุณ มาลี'));
  assert.ok(ct.includes('ถ้าคุณมาลีลืมกินยา'));
  assert.ok(ct.includes('เกิน 90 นาที น้องยาตรง'));
});

test('4.4/4.7/4.8/4.9 ข้อความ text', () => {
  assert.equal(M.TEXT.invalid(10).text, '🤔 รหัสนี้ใช้ไม่ได้ค่ะ\nรหัสใช้ได้ภายใน 10 นาทีเท่านั้น\nขอรหัสใหม่ในแอป หน้า "ตั้งค่า" ได้เลยนะคะ');
  assert.equal(M.TEXT.tooMany().text, '⏳ ลองหลายครั้งเกินไปค่ะ\nรอประมาณ 10 นาทีแล้วลองใหม่นะคะ');
  assert.match(M.TEXT.conflict().text, /^🔒 LINE นี้เชื่อมกับผู้ป่วยคนอื่นแล้วค่ะ\n.+\n.+$/);
  assert.equal(M.TEXT.alreadyTaken().text, '✅ บันทึกไว้แล้วค่ะ\nน้องยาตรงจำไว้ให้แล้ว ไม่ต้องกดซ้ำนะคะ');
  assert.equal(M.TEXT.doseNotFound().text, '🔍 ไม่พบรายการยานี้แล้วค่ะ\nอาจถูกแก้ไขในแอป\nแตะ "ยาวันนี้" เพื่อดูรายการล่าสุดนะคะ');
  assert.match(M.TEXT.help().text, /^😊 น้องยาตรงช่วยได้แบบนี้ค่ะ\n📋 พิมพ์ "วันนี้" ดูยาของวันนี้\n🔗 ส่งรหัส 6 หลัก เพื่อเชื่อมบัญชี\nหรือแตะปุ่มด้านล่างได้เลยนะคะ/);
});

// ---------- "วันนี้" ----------
const dose = (id, name, status, slot, time, due) => ({ id, name, strength: null, dose_per_time: 1, unit: 'tablet', meal_relation: 'after', status, is_due: !!due, slot, time });
function shapedOf(list) {
  const slots = [];
  for (const d of list) {
    let s = slots.find((x) => x.slot === d.slot);
    if (!s) { s = { slot: d.slot, time: d.time, doses: [] }; slots.push(s); }
    s.doses.push(d);
  }
  const total = list.length, taken = list.filter((d) => d.status === 'taken').length;
  return { status: 200, body: { slots, summary: { total, taken, pending: list.filter((d) => d.status === 'pending').length, missed: list.filter((d) => d.status === 'missed').length } } };
}
const flat = (m) => all(m.contents).filter((n) => n.type === 'text').map((n) => n.text);

test('4.5 วันนี้ (บางส่วน): วันที่ไทย, ความคืบหน้าตรงกับวงกลมของเว็บ (taken÷ทุกรอบ รวม missed), ป้ายสถานะ 3 แบบ + ชื่อยาใต้แถวที่ยังไม่กิน', () => {
  const shaped = shapedOf([
    dose(1, 'ยาเช้า', 'taken', 'morning', '08:00', true),
    dose(2, 'ยากลางวัน', 'missed', 'noon', '12:00', true),
    dose(3, 'ยาเย็น', 'pending', 'evening', '18:00', true),
    dose(4, 'ยานอน', 'pending', 'bedtime', '21:00', false)
  ]);
  const m = M.buildToday(shaped, '2026-10-09', ENV);
  const t = flat(m);
  assert.ok(t.includes('📋 ยาของวันนี้'));
  assert.ok(t.includes('ศ. 9 ต.ค.'));
  assert.ok(t.includes('กินแล้ว 1 จาก 4 รายการ'));            // missed นับใน total เหมือนเว็บ
  assert.ok(t.includes('🌅 มื้อเช้า') && t.includes('🌙 มื้อก่อนนอน'));
  assert.deepEqual(['✅ กินแล้ว', '⏰ ยังไม่ได้กิน', '🕒 รอเวลา'].map((x) => t.filter((y) => y === x).length), [1, 2, 1]);   // เช้า=กินแล้ว, กลางวัน(missed)+เย็น(เลยเวลา)=ยังไม่ได้กิน, ก่อนนอน=รอเวลา
  assert.ok(t.includes('• ยากลางวัน') && t.includes('• ยาเย็น') && t.includes('• ยานอน'));
  assert.ok(!t.includes('• ยาเช้า'));                          // มื้อที่กินแล้วไม่แสดงชื่อยา
  assert.ok(m.altText.startsWith('📋 ยาของวันนี้') && /1 จาก 4/.test(m.altText));
  assert.equal(all(m.contents.footer).find((n) => n.type === 'button').action.uri, 'https://demo.ngrok-free.dev/today');
});

test('วันนี้: pending ที่ถึงเวลาแล้ว (ยังไม่เลย 30 นาที) นับเป็น "ยังไม่ได้กิน" ; ยังไม่ถึงเวลา = "รอเวลา"', () => {
  assert.equal(M.slotStatus({ doses: [dose(1, 'a', 'pending', 'morning', '08:00', true)] }), 'late');
  assert.equal(M.slotStatus({ doses: [dose(1, 'a', 'pending', 'morning', '08:00', false)] }), 'wait');
  assert.equal(M.slotStatus({ doses: [dose(1, 'a', 'taken', 'morning', '08:00', true), dose(2, 'b', 'pending', 'morning', '08:00', true)] }), 'late');
  assert.equal(M.slotStatus({ doses: [dose(1, 'a', 'taken', 'morning', '08:00', true)] }), 'done');
});

test('วันนี้: กินครบ = mascot-cheer + ข้อความชมท้ายด้วยอิโมจิ ; ไม่มียา = mascot-hello + "วันนี้ไม่มียาที่ต้องกินค่ะ 🌿" + ปุ่มเปิดแอป', () => {
  const done = M.buildToday(shapedOf([dose(1, 'a', 'taken', 'morning', '08:00', true), dose(2, 'b', 'taken', 'evening', '18:00', true)]), '2026-10-09', ENV);
  assert.ok(flat(done).includes('วันนี้กินครบทุกรายการแล้ว เก่งมากค่ะ 🌟'));
  assert.ok(flat(done).includes('กินแล้ว 2 จาก 2 รายการ'));
  assert.match(all(done.contents.header).find((n) => n.type === 'image').url, /mascot-cheer\.png$/);
  const empty = M.buildToday(shapedOf([]), '2026-10-09', ENV);
  assert.ok(flat(empty).includes('วันนี้ไม่มียาที่ต้องกินค่ะ 🌿'));
  assert.match(all(empty.contents.header).find((n) => n.type === 'image').url, /mascot-hello\.png$/);
  assert.ok(all(empty.contents.footer).some((n) => n.type === 'button' && n.action.label === 'เปิดแอป'));
});

test('วันนี้: ชื่อยาที่ยังไม่กินในมื้อเกิน 6 ตัดเป็น "+ อีก n รายการ"', () => {
  const list = Array.from({ length: 8 }, (_, i) => dose(i + 1, 'ยา' + i, 'pending', 'morning', '08:00', true));
  const t = flat(M.buildToday(shapedOf(list), '2026-10-09', ENV));
  assert.equal(t.filter((x) => x.startsWith('• ยา')).length, 6);
  assert.ok(t.includes('+ อีก 2 รายการ'));
});

test('วันที่ไทยสั้น', () => {
  assert.equal(M.thaiDate('2026-10-09'), 'ศ. 9 ต.ค.');
  assert.equal(M.thaiDate('2026-01-04'), 'อา. 4 ม.ค.');
  assert.equal(M.thaiDate('2026-10-08'), 'พฤ. 8 ต.ค.');
  assert.equal(M.thaiDate('x'), '');
});

test('ผู้ดูแลอย่างเดียว / ยังไม่เชื่อม: ข้อความ text', () => {
  assert.equal(M.TEXT.caregiverOnly(['สมชาย']).text, '💚 คุณเป็นผู้ดูแลของ สมชาย\nน้องยาตรงจะแจ้งที่แชทนี้\nเมื่อผู้ป่วยลืมกินยานะคะ');
  assert.match(M.TEXT.caregiverOnly(['A', 'B']).text, /ผู้ดูแลของ A และ B/);
  assert.match(M.TEXT.notLinked().text, /ยังไม่ได้เชื่อมบัญชี/);
  assert.match(M.TEXT.notLinked().text, /รับรหัสเชื่อม LINE/);
});

test('4.6 กินแล้วสำเร็จ: ชื่อยาบรรทัดละตัว (เกิน 6 ตัดต่อท้าย), เวลา, ความคืบหน้า, มื้อถัดไป / กินครบ', () => {
  const next = M.buildTaken({ names: ['ยา A 5 mg', 'ยา B'], at: '08:03', taken: 2, total: 5, next: { slot: 'evening', time: '18:00' } }, ENV);
  const t = flat(next);
  assert.ok(t.includes('เก่งมากเลยค่ะ! 🎉'));
  assert.ok(t.includes('✅ ยา A 5 mg') && t.includes('✅ ยา B'));
  assert.ok(t.includes('🕖 บันทึกเมื่อ 08:03 น.'));
  assert.ok(t.includes('กินแล้ว 2 จาก 5 รายการ'));
  assert.ok(t.includes('🌆 มื้อถัดไป: เย็น 18:00 น.'));
  assert.ok(!t.some((x) => x.includes('กินครบทุกรายการ')));
  assert.match(all(next.contents.header).find((n) => n.type === 'image').url, /mascot-cheer\.png$/);
  const last = M.buildTaken({ names: ['ยา A'], at: '21:00', taken: 5, total: 5, next: null }, ENV);
  assert.ok(flat(last).includes('วันนี้กินครบทุกรายการแล้ว 🌟'));
  const many = M.buildTaken({ names: Array.from({ length: 9 }, (_, i) => 'ยา' + i), at: '08:00', taken: 9, total: 9, next: null }, ENV);
  assert.equal(flat(many).filter((x) => x.startsWith('✅ ยา')).length, 6);
  assert.ok(flat(many).includes('+ อีก 3 รายการ'));
});

test('#ตัวอย่าง: ทุกหน้าไม่เกิน 5 ข้อความ, ทุกตัวอย่างมีหัว text นำหน้า, ครบทุกแบบ, หน้านอกช่วง = null', () => {
  const pages = M.previewPageCount(ENV);
  let n = 0;
  for (let i = 1; i <= pages; i++) {
    const p = M.buildPreviewPage(i, ENV);
    assert.ok(p.messages.length <= 5, `หน้า ${i}`);
    assert.equal(p.messages[0].type, 'text');
    assert.match(p.messages[0].text, /^ตัวอย่าง \d+\/\d+: /);
    n += p.messages.filter((m) => m.type === 'text' && /^ตัวอย่าง \d+\/\d+: /.test(m.text)).length;
  }
  assert.equal(n, SAMPLES.length);
  assert.equal(M.buildPreviewPage(0, ENV), null);
  assert.equal(M.buildPreviewPage(pages + 1, ENV), null);
  assert.equal(M.buildPreviewPage(1.5, ENV), null);
  // ปุ่มกินแล้วในตัวอย่างเป็น a=preview เสมอ (ไม่เขียน DB)
  for (const s of SAMPLES) for (const m of s.messages.filter((x) => x.type === 'flex')) {
    for (const b of all(m.contents).filter((x) => x.type === 'button' && x.action.type === 'postback')) assert.equal(b.action.data, 'a=preview', s.id);
  }
});

// ---------- handleEvent ด้วย db/client ปลอม ----------
function harness({ patient = null, caregiverOf = [], rows = [] } = {}) {
  const sent = [];
  const db = {
    async query(sql) {
      if (/FROM users WHERE line_user_id/.test(sql)) return patient ? [{ id: 7, display_name: patient }] : [];
      if (/FROM caregivers c JOIN users u/.test(sql)) return caregiverOf.map((n, i) => ({ id: i + 1, display_name: n }));
      if (/CURDATE\(\), '%Y-%m-%d'/.test(sql)) return [{ d: '2026-10-09' }];
      if (/FROM dose_logs d JOIN medications m/.test(sql)) return rows;
      return [];
    }
  };
  const client = { async reply(token, messages) { sent.push({ token, messages }); return { ok: true }; }, async getProfile() { return null; } };
  return { db, client, sent };
}
const ev = (text) => ({ type: 'message', replyToken: 'rt', source: { userId: 'Uxxxxxxxxxxxxxxxxx' }, message: { type: 'text', text } });
const labels = (msgs) => msgs.at(-1).quickReply.items.map((i) => i.action.label);

test('reply ทุกแบบแนบ quickReply ตามประเภทผู้ใช้ (ผู้ป่วย / ยังไม่เชื่อม / ผู้ดูแลอย่างเดียว)', async () => {
  for (const [opts, expected] of [
    [{ patient: 'สมชาย' }, ['📋 ยาวันนี้', '📱 เปิดแอป', '❓ ช่วยเหลือ']],
    [{}, ['🔗 วิธีเชื่อมบัญชี', '📱 เปิดแอป']],
    [{ caregiverOf: ['สมชาย'] }, ['❓ ช่วยเหลือ']]
  ]) {
    const h = harness(opts);
    await svc.handleEvent(ev('อะไรก็ไม่รู้'), { db: h.db, client: h.client, env: ENV });
    assert.equal(h.sent.length, 1);
    assert.deepEqual(labels(h.sent[0].messages), expected);
  }
});

test('"วันนี้": ผู้ป่วย = Flex, ผู้ดูแลอย่างเดียว = text บอกชื่อผู้ป่วย, ยังไม่เชื่อม = text วิธีเชื่อม', async () => {
  const rows = [{ id: 1, medication_id: 1, slot: 'morning', scheduled_at: '2026-10-09 08:00:00', status: 'pending', taken_at: null, is_overdue: 0, is_due: 1, name: 'ยา A', strength: null, dose_per_time: 1, unit: 'tablet', meal_relation: 'after' }];
  let h = harness({ patient: 'สมชาย', rows });
  await svc.handleEvent(ev('วันนี้'), { db: h.db, client: h.client, env: ENV });
  assert.equal(h.sent[0].messages[0].type, 'flex');
  assert.ok(h.sent[0].messages[0].altText.startsWith('📋 ยาของวันนี้'));
  h = harness({ caregiverOf: ['สมชาย'] });
  await svc.handleEvent(ev('วันนี้'), { db: h.db, client: h.client, env: ENV });
  assert.match(h.sent[0].messages[0].text, /ผู้ดูแลของ สมชาย/);
  h = harness();
  await svc.handleEvent(ev('วันนี้'), { db: h.db, client: h.client, env: ENV });
  assert.match(h.sent[0].messages[0].text, /ยังไม่ได้เชื่อมบัญชี/);
});

test('"วิธีใช้" = Flex เดียวกับ follow (เชื่อมแล้วเปลี่ยนเนื้อหา) ; "ช่วยเหลือ" = text', async () => {
  let h = harness();
  await svc.handleEvent(ev('วิธีใช้'), { db: h.db, client: h.client, env: ENV });
  assert.ok(all(h.sent[0].messages[0].contents).some((n) => n.text === 'เริ่มใช้ 3 ขั้นตอน'));
  h = harness({ patient: 'ก' });
  await svc.handleEvent(ev('วิธีใช้'), { db: h.db, client: h.client, env: ENV });
  assert.ok(all(h.sent[0].messages[0].contents).some((n) => n.text === 'วิธีใช้น้องยาตรงนะคะ'));
  await svc.handleEvent(ev('ช่วยเหลือ'), { db: h.db, client: h.client, env: ENV });
  assert.equal(h.sent[1].messages[0].type, 'text');
  assert.match(h.sent[1].messages[0].text, /น้องยาตรงช่วยได้แบบนี้ค่ะ/);
});

test('#ตัวอย่าง: เฉพาะ DEMO_MODE=true และผู้ป่วยที่เชื่อมแล้ว ; อื่นๆ = เมนูช่วยเหลือ', async () => {
  let h = harness({ patient: 'ก' });
  await svc.handleEvent(ev('#ตัวอย่าง 1'), { db: h.db, client: h.client, env: ENV });
  assert.ok(h.sent[0].messages.length <= 5 && h.sent[0].messages.length >= 2);
  assert.match(h.sent[0].messages[0].text, /^ตัวอย่าง 1\//);
  assert.ok(labels(h.sent[0].messages).includes('➡️ #ตัวอย่าง 2'));
  await svc.handleEvent(ev('#ตัวอย่าง ๒'), { db: h.db, client: h.client, env: ENV });   // เลขไทย
  assert.match(h.sent[1].messages[0].text, /^ตัวอย่าง 3\//);
  await svc.handleEvent(ev('#ตัวอย่าง 99'), { db: h.db, client: h.client, env: ENV });
  assert.match(h.sent[2].messages[0].text, /มีตัวอย่าง 1 ถึง \d+ หน้า/);
  // DEMO ปิด = ข้อความทั่วไป
  h = harness({ patient: 'ก' });
  await svc.handleEvent(ev('#ตัวอย่าง 1'), { db: h.db, client: h.client, env: { ...ENV, DEMO_MODE: 'false' } });
  assert.match(h.sent[0].messages[0].text, /น้องยาตรงช่วยได้แบบนี้ค่ะ/);
  // ยังไม่เชื่อมแม้ DEMO เปิด = ข้อความทั่วไป
  h = harness();
  await svc.handleEvent(ev('#ตัวอย่าง 1'), { db: h.db, client: h.client, env: ENV });
  assert.match(h.sent[0].messages[0].text, /น้องยาตรงช่วยได้แบบนี้ค่ะ/);
});

test('postback a=preview: ตอบ "ตัวอย่าง ยังไม่ได้บันทึก" โดยไม่แตะ DB', async () => {
  const h = harness();
  let touched = false;
  const db = { query: async (sql) => { if (/UPDATE|INSERT/.test(sql)) touched = true; return []; }, withTransaction: async () => { touched = true; } };
  await svc.handlePostback({ type: 'postback', replyToken: 'rt', source: { userId: 'Uxxxxxxxxxxxxxxxxx' }, postback: { data: 'a=preview' } }, { db, client: h.client, env: ENV });
  assert.equal(h.sent[0].messages[0].text, 'นี่คือข้อความตัวอย่างค่ะ ยังไม่ได้บันทึกนะคะ');
  assert.equal(touched, false);
});
