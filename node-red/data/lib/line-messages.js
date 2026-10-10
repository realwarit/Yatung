// ข้อความตอบกลับ (reply) ของน้องยาตรงทุกแบบ — pure function ไม่เรียกเครือข่าย/DB ; ระบบออกแบบอยู่ที่ lib/line-flex.js
// กฎเดียวกับ line-flex.js: น้ำเสียง ค่ะ/นะคะ · อิโมจิ ≤ 1 ตัวต่อบรรทัด วางต้นบรรทัดหรือท้ายบรรทัดเท่านั้น · ตัวอักษร ≥ md · ชื่อมื้อ/วิธีกินใช้ mapping เดียวกับเว็บ (labels-th.js)
const { SLOT_LABEL, SLOT_EMOJI, CHANNEL_LABEL } = require('./labels-th');
const F = require('./line-flex');
const { text, box, separator, bubble, bodyOf, flexMessage, header, footerOf, uriButton, messageButton, medTitle, progress, badge, COLOR } = F;

const plain = (t) => ({ type: 'text', text: t });
// ชื่อจาก LINE มักเป็นตัวอักษรตกแต่ง (Mathematical Alphanumeric) → NFKC เหมือน plainName ของเว็บ ; ตัดความยาวกัน bubble บวม
const niceName = (n, max = 40) => String(n || '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, max);

// ---------- วันที่ไทยแบบสั้น "ศ. 9 ต.ค." ----------
const WEEKDAY_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const MONTH_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function thaiDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd));
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${WEEKDAY_TH[d.getUTCDay()]} ${Number(m[3])} ${MONTH_TH[Number(m[2]) - 1]}`;
}
const thaiJoin = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(' ')} และ ${items[items.length - 1]}`);

// ---------- ข้อความ text ----------
const TEXT = {
  invalid: (ttlMin = 10) => plain(`🤔 รหัสนี้ใช้ไม่ได้ค่ะ\nรหัสใช้ได้ ${ttlMin} นาทีเท่านั้น\nขอรหัสใหม่ในแอป\nหน้า "ตั้งค่า" ได้เลยนะคะ`),
  tooMany: () => plain('⏳ ลองหลายครั้งเกินไปค่ะ\nรอประมาณ 10 นาที\nแล้วลองใหม่นะคะ'),
  conflict: () => plain('🔒 LINE นี้เชื่อมไว้แล้วค่ะ\nกับผู้ป่วยอีกคนหนึ่ง\nต้องยกเลิกการเชื่อม\nในแอปของบัญชีเดิมก่อน\nแล้วขอรหัสใหม่นะคะ'),
  alreadyTaken: () => plain('✅ บันทึกไว้แล้วค่ะ\nไม่ต้องกดซ้ำนะคะ'),
  doseNotFound: () => plain('🔍 ไม่พบรายการยานี้แล้วค่ะ\nอาจถูกแก้ไขในแอป\nแตะ "ยาวันนี้"\nเพื่อดูรายการล่าสุดนะคะ'),
  help: () => plain('😊 น้องยาตรงช่วยได้แบบนี้ค่ะ\n📋 พิมพ์ "วันนี้"\nเพื่อดูยาของวันนี้\n🔗 ส่งรหัส 6 หลัก\nเพื่อเชื่อมบัญชี\nหรือแตะปุ่มด้านล่าง\nได้เลยนะคะ\nไม่ใช่คำแนะนำ\nทางการแพทย์ค่ะ'),
  notLinked: () => plain('🔗 ยังไม่ได้เชื่อมบัญชีค่ะ\nเปิดแอปยาตรง\nไปที่หน้า "ตั้งค่า"\nกด "รับรหัสเชื่อม LINE"\nแล้วส่งเลข 6 หลัก\nมาที่แชทนี้นะคะ'),
  caregiverOnly: (patients) => plain(`💚 คุณเป็นผู้ดูแลของ\n${thaiJoin(patients.map((p) => niceName(p)))}\nน้องยาตรงจะแจ้งที่แชทนี้\nเมื่อผู้ป่วยลืมกินยานะคะ`),
  previewNote: () => plain('นี่คือข้อความตัวอย่างค่ะ\nยังไม่ได้บันทึกนะคะ'),
  cgNoAuth: () => plain('🔒 ไม่พบสิทธิ์ผู้ดูแล\nสำหรับรายการนี้ค่ะ\nอาจถูกยกเลิกในแอปแล้ว\nสอบถามเจ้าของบัญชีนะคะ'),
  cgAck: () => plain('💚 รับทราบแล้วค่ะ\nขอบคุณที่ช่วยดูแลนะคะ'),
  cgAckNotFound: () => plain('🔍 ไม่พบรายการนี้แล้วค่ะ\nอาจถูกยกเลิกในแอปแล้ว')
};

// ---------- Flex ต้อนรับ / วิธีใช้ ----------
const step = (num, title, sub) => box([text(`${num} ${title}`, { weight: 'bold', size: 'lg' }), text(sub, { size: 'md', color: COLOR.muted })], { spacing: 'xs' });

// linked = false: ต้อนรับ (follow) + วิธีเชื่อมบัญชี 3 ขั้นตอน ; linked = true: วิธีใช้เมื่อเชื่อมแล้ว
function buildWelcome(linked, env) {
  const settings = F.appUrl(env, '/settings');
  const today = F.appUrl(env, '/today');
  if (!linked) {
    const body = bodyOf([
      text('น้องยาตรงเองค่ะ', { size: 'lg', weight: 'bold' }),
      text('จะช่วยเตือนเวลากินยา', { size: 'lg' }),
      text('ให้ทุกวันนะคะ', { size: 'lg' }),
      separator(),
      text('เริ่มใช้ 3 ขั้นตอน', { weight: 'bold', size: 'xl', color: COLOR.primary }),
      step('1️⃣', 'เปิดแอปยาตรง', 'ไปที่หน้า "ตั้งค่า"'),
      step('2️⃣', 'กด "รับรหัสเชื่อม LINE"', 'จะได้เลข 6 หลัก'),
      step('3️⃣', 'ส่งเลขมาที่แชทนี้', 'พิมพ์เลข 6 หลักส่งมาได้เลยค่ะ')
    ]);
    const footer = footerOf(settings ? [uriButton('เปิดแอป', settings, 'primary')] : []);
    return flexMessage('👋 สวัสดีค่ะ น้องยาตรงจะช่วยเตือนเวลากินยา', bubble({ header: header({ pose: 'hello', title: 'สวัสดีค่ะ 👋' }, env), body, footer }));
  }
  const body = bodyOf([
    step('1️⃣', 'ถึงเวลากินยา', 'น้องยาตรงจะส่งข้อความเตือน'),
    step('2️⃣', 'กินยาแล้วกดปุ่มเขียว', 'ปุ่มสีเขียว "กินแล้ว" ในข้อความนั้น'),
    step('3️⃣', 'อยากดูยาของวันนี้', 'กดเมนู "ยาวันนี้" ด้านล่าง')
  ]);
  const buttons = [messageButton('📋 ดูยาวันนี้', 'วันนี้', 'primary')];
  if (today) buttons.push(uriButton('เปิดแอป', today));
  return flexMessage('วิธีใช้น้องยาตรง: รอข้อความเตือน แล้วกดปุ่ม "กินแล้ว"', bubble({ header: header({ pose: 'hello', title: 'วิธีใช้น้องยาตรงนะคะ' }, env), body, footer: footerOf(buttons) }));
}

// ---------- Flex เชื่อมสำเร็จ ----------
function buildLinkedPatient(name, env) {
  const n = niceName(name);
  const today = F.appUrl(env, '/today');
  const body = bodyOf([
    text(n ? `สวัสดีคุณ ${n}` : 'สวัสดีค่ะ', { size: 'lg', weight: 'bold' }),
    text('ต่อไปน้องยาตรงจะเตือน', { size: 'lg' }),
    text('เวลากินยาที่แชทนี้นะคะ', { size: 'lg' })
  ]);
  const buttons = [messageButton('📋 ดูยาวันนี้', 'วันนี้', 'primary')];
  if (today) buttons.push(uriButton('เปิดแอป', today));
  return flexMessage('🎉 เชื่อมสำเร็จแล้วค่ะ น้องยาตรงจะเตือนเวลากินยาที่แชทนี้', bubble({ header: header({ pose: 'cheer', title: 'เชื่อมสำเร็จแล้วค่ะ 🎉' }, env), body, footer: footerOf(buttons) }));
}
function buildLinkedCaregiver(patient, escalateAfterMin, env) {
  const p = niceName(patient);
  const body = bodyOf([
    text(`ผู้ดูแลของคุณ ${p}`, { size: 'lg', weight: 'bold' }),
    text(`ถ้าคุณ${p}ลืมกินยา`, { size: 'lg' }),
    text(`เกิน ${escalateAfterMin || 60} นาที น้องยาตรง`, { size: 'lg' }),
    text('จะแจ้งที่แชทนี้นะคะ', { size: 'lg' })
  ]);
  return flexMessage(`เชื่อมเป็นผู้ดูแลของคุณ ${p} แล้วค่ะ 💚`, bubble({ header: header({ pose: 'cheer', title: 'เชื่อมเป็นผู้ดูแลแล้วค่ะ 💚' }, env), body }));
}

// ---------- Flex "วันนี้" ----------
// shaped = ผล doseService.shapeToday (+ is_due ต่อ dose เมื่อใช้ todayQuery แบบ withDue) ; today = 'YYYY-MM-DD'
// สถานะต่อมื้อ: กินครบ = ✅ · มีรายการที่ยังไม่ได้กินและถึงเวลาแล้ว (หรือ missed) = ⏰ ยังไม่ได้กิน · ที่เหลือ = 🕒 รอเวลา
function slotStatus(slot) {
  const rest = slot.doses.filter((d) => d.status !== 'taken');
  if (!rest.length) return 'done';
  return rest.some((d) => d.status === 'missed' || d.is_due) ? 'late' : 'wait';
}
// แยกมื้อที่มีหลายเวลา (เช่น เย็น 16:30 และ 18:00) เป็นแถวละ (มื้อ, เวลา) — แต่ละแถวมีเวลาและสถานะของตัวเอง
// dose ที่ไม่มี scheduled_at (ตัวอย่าง) ใช้เวลาของมื้อ
const SLOT_ORDER = ['morning', 'noon', 'evening', 'bedtime'];
function timeRows(slots) {
  const rows = [];
  for (const s of slots) {
    const by = new Map();
    for (const d of s.doses) {
      const t = d.scheduled_at ? String(d.scheduled_at).slice(11, 16) : s.time;
      if (!by.has(t)) by.set(t, []);
      by.get(t).push(d);
    }
    for (const [time, doses] of by) rows.push({ slot: s.slot, time, doses });
  }
  return rows.sort((a, b) => a.time.localeCompare(b.time) || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
}
function buildToday(shaped, today, env) {
  const { summary } = shaped.body;
  const slots = timeRows(shaped.body.slots);
  const openToday = F.appUrl(env, '/today');
  const openBtn = footerOf(openToday ? [uriButton('เปิดแอป', openToday, 'primary')] : []);
  const dateText = thaiDate(today);

  if (!summary.total) {
    return flexMessage('📋 ยาของวันนี้: ไม่มียาที่ต้องกิน', bubble({
      header: header({ pose: 'hello', title: '📋 ยาของวันนี้', badge: dateText }, env),
      body: bodyOf([text('วันนี้ไม่มียาที่ต้องกินค่ะ 🌿', { size: 'lg', weight: 'bold', align: 'center' })]),
      footer: openBtn
    }));
  }
  const allDone = summary.taken === summary.total;
  const rows = [];
  slots.forEach((s, i) => {
    if (i > 0) rows.push(separator());
    const st = slotStatus(s);
    const rest = s.doses.filter((d) => d.status !== 'taken');
    const items = [
      text(`${SLOT_EMOJI[s.slot]} มื้อ${SLOT_LABEL[s.slot]}`, { weight: 'bold', size: 'lg' }),
      box([text(`${s.time} น.`, { size: 'md', color: COLOR.muted, flex: 1, gravity: 'center' }), badge(st)], { layout: 'horizontal', spacing: 'md' })
    ];
    rest.slice(0, F.MAX_SHOWN_DOSES).forEach((d) => items.push(text(`• ${medTitle(d)}`, { size: 'md' })));
    if (rest.length > F.MAX_SHOWN_DOSES) items.push(text(`+ อีก ${rest.length - F.MAX_SHOWN_DOSES} รายการ`, { size: 'md', color: COLOR.muted }));
    rows.push(box(items, { spacing: 'sm', margin: i > 0 ? 'md' : undefined }));
  });
  const content = [progress(summary.taken, summary.total), separator(), ...rows];
  if (allDone) content.push(text('วันนี้กินครบทุกรายการแล้ว เก่งมากค่ะ 🌟', { size: 'lg', weight: 'bold', color: COLOR.success, align: 'center', margin: 'lg' }));
  const alt = allDone ? `📋 ยาของวันนี้: กินครบทุกรายการแล้ว (${summary.total} รายการ)` : `📋 ยาของวันนี้: กินแล้ว ${summary.taken} จาก ${summary.total} รายการ`;
  return flexMessage(alt, bubble({ header: header({ pose: allDone ? 'cheer' : 'hello', title: '📋 ยาของวันนี้', badge: dateText }, env), body: bodyOf(content), footer: openBtn }));
}

// ---------- Flex เล็ก: กดกินแล้วสำเร็จ ----------
// info = { names: [ชื่อยา+ความแรง…], at: 'HH:MM', taken, total, next: { slot, time } | null }
function buildTaken(info, env) {
  const done = info.taken >= info.total;
  const lines = info.names.slice(0, F.MAX_SHOWN_DOSES).map((n) => text(`✅ ${n}`, { size: 'lg', weight: 'bold' }));
  if (info.names.length > F.MAX_SHOWN_DOSES) lines.push(text(`+ อีก ${info.names.length - F.MAX_SHOWN_DOSES} รายการ`, { size: 'md', color: COLOR.muted }));
  const content = [
    ...lines,
    text(`🕖 บันทึกเมื่อ ${info.at} น.`, { size: 'md', color: COLOR.muted }),
    separator(),
    progress(info.taken, info.total)
  ];
  if (info.next) content.push(text(`${SLOT_EMOJI[info.next.slot]} มื้อถัดไป: ${SLOT_LABEL[info.next.slot]} ${info.next.time} น.`, { size: 'md', weight: 'bold', color: COLOR.primary }));
  else if (done) content.push(text('วันนี้กินครบทุกรายการแล้ว 🌟', { size: 'md', weight: 'bold', color: COLOR.success }));
  return flexMessage(`✅ บันทึกแล้วค่ะ กินยา ${info.names.length} รายการ เมื่อ ${info.at} น.`,
    bubble({ header: header({ pose: 'cheer', title: 'เก่งมากเลยค่ะ! 🎉' }, env), body: bodyOf(content) }));
}

// ---------- แจ้งญาติเมื่อลืมกินยา (วันที่ 7A) ----------
// ชื่อในหัวข้อต้องสั้น (หัวข้อบรรทัดเดียว ≤ 26 ตัวอักษรฐาน) → ใช้ชื่อแรก ไม่เกิน 10 ตัวอักษร
const firstName = (n, max = 10) => niceName(n, 60).split(' ')[0].slice(0, max);
const cgTakeData = (ids) => `a=cg_take&d=${ids.join(',')}`;
const cgAckData = (ids) => `a=cg_ack&e=${ids.join(',')}`;

// g = { patient, slot, scheduled_at, late_min, doses: [{ id, name, strength, dose_per_time, unit, meal_relation }], escalation_ids: [dose_escalations.id…] }
// opts.preview = true → ปุ่มเป็นตัวอย่าง (a=preview) ไม่บันทึกอะไร
function buildEscalation(g, env, opts = {}) {
  const name = firstName(g.patient);
  const slotLabel = SLOT_LABEL[g.slot] || '';
  const emoji = SLOT_EMOJI[g.slot] || '';
  // เวลาที่เลยมาจริง (now − scheduled_at) ; ยังไม่ถึงเวลา (เดโม) = "ใกล้ถึงเวลา" ไม่ใช้คำว่าเลยมา
  const lateMin = Number.isFinite(Number(g.late_min)) ? Number(g.late_min) : 0;
  const soon = lateMin < 0;
  const when = soon ? `อีก ${F.durationText(Math.ceil(-lateMin))}` : Math.floor(lateMin) < 1 ? 'เลยมาไม่ถึง 1 นาที' : `เลยมา ${F.durationText(Math.floor(lateMin))}`;
  const ids = g.doses.map((d) => d.id);
  const take = { type: 'postback', data: opts.preview ? 'a=preview' : cgTakeData(ids), displayText: `ยืนยันว่าคุณ${name}กินยาแล้ว` };
  const ack = { type: 'postback', data: opts.preview ? 'a=preview' : cgAckData(g.escalation_ids || []), displayText: 'รับทราบ' };
  const body = [...F.medList(g.doses), separator(), text(soon ? `ยังไม่ถึงเวลากินยาของคุณ${name}` : `ลองโทรถามคุณ${name}ได้นะคะ`, { size: 'lg', weight: 'bold' })];
  return flexMessage(soon ? `⏰ คุณ${name}ใกล้ถึงเวลากินยามื้อ${slotLabel} · ${when}` : `⚠️ คุณ${name}ยังไม่ได้กินยามื้อ${slotLabel} · ${when}`, bubble({
    header: header({ pose: 'bell', title: soon ? `คุณ${name}ใกล้ถึงเวลากินยา` : `คุณ${name}ยังไม่ได้กินยานะคะ`, badge: `${emoji ? emoji + ' ' : ''}มื้อ${slotLabel} ${F.timeText(g.scheduled_at)} น. · ${when}`, ...(soon ? {} : { tone: 'warn' }) }, env),
    body: bodyOf(body),
    footer: footerOf([F.button('✓ ยืนยันว่ากินแล้ว', take, 'primary'), F.button('รับทราบ', ack, 'secondary')])
  }));
}

// ปิดเรื่อง: ผู้ป่วยกินทีหลังที่แจ้งญาติไปแล้ว (ส่งครั้งเดียวต่อกลุ่ม)
// g.at = 'HH:MM' เวลาที่ผู้ป่วยกดจริง ; g.source = app|line|push ; g.doses.length = จำนวนรายการ
function buildEscalationResolved(g, env) {
  const name = firstName(g.patient);
  const slotLabel = SLOT_LABEL[g.slot] || '';
  const n = (g.doses && g.doses.length) || g.count || 1;
  const via = CHANNEL_LABEL[g.source] || CHANNEL_LABEL.app;
  return flexMessage(`💚 คุณ${name}กินยามื้อ${slotLabel}แล้วค่ะ · ${g.at || F.timeText(g.scheduled_at)} น.`, bubble({
    header: header({ pose: 'cheer', title: `คุณ${name}กินยาแล้วค่ะ`, badge: `💚 มื้อ${slotLabel} ${F.timeText(g.scheduled_at)} น.` }, env),
    body: bodyOf([text(`✅ บันทึกเมื่อ ${g.at || F.timeText(g.scheduled_at)} น.`, { size: 'lg', weight: 'bold' }), text(`${n} รายการ · ผ่านทาง ${via}`, { size: 'md' }), text('ขอบคุณที่ช่วยดูแลนะคะ', { size: 'md', color: COLOR.muted })])
  }));
}

// "วันนี้" สำหรับ LINE ที่เป็นผู้ดูแล : สรุปแบบย่อต่อผู้ป่วย (ความคืบหน้า + มื้อที่ยังไม่ครบ ไม่แสดงชื่อยา)
// list = [{ name, shaped (ผล doseService.shapeToday) }] ; today = 'YYYY-MM-DD'
const MAX_CG_PATIENTS = 8;
function buildCaregiverToday(list, today, env) {
  const rows = [];
  list.slice(0, MAX_CG_PATIENTS).forEach((p, i) => {
    if (i > 0) rows.push(separator());
    const { summary } = p.shaped.body;
    const slots = timeRows(p.shaped.body.slots);
    const items = [text(`คุณ${niceName(p.name, 30)}`, { weight: 'bold', size: 'xl' })];
    if (!summary.total) items.push(text('วันนี้ไม่มียาที่ต้องกินค่ะ', { size: 'md', color: COLOR.muted }));
    else {
      items.push(progress(summary.taken, summary.total));
      const open = slots.filter((s) => slotStatus(s) !== 'done');
      open.forEach((s) => {
        const late = slotStatus(s) === 'late';
        items.push(text(`${SLOT_EMOJI[s.slot]} มื้อ${SLOT_LABEL[s.slot]} ${s.time} น. · ${late ? 'ยังไม่ได้กิน' : 'รอเวลา'}`, { size: 'md', color: late ? COLOR.onWarningSoft : COLOR.text, weight: late ? 'bold' : 'regular' }));
      });
      if (!open.length) items.push(text('กินครบทุกรายการแล้ว 🌟', { size: 'md', weight: 'bold', color: COLOR.success }));
    }
    rows.push(box(items, { spacing: 'sm', margin: i > 0 ? 'md' : undefined }));
  });
  if (list.length > MAX_CG_PATIENTS) rows.push(text(`+ อีก ${list.length - MAX_CG_PATIENTS} คน`, { size: 'md', color: COLOR.muted, margin: 'md' }));
  return flexMessage(`📋 ยาวันนี้ของผู้ที่คุณดูแล ${list.length} คน`, bubble({ header: header({ pose: 'hello', title: '📋 ยาวันนี้ที่คุณดูแล', badge: thaiDate(today) }, env), body: bodyOf(rows) }));
}

// reply หลังผู้ดูแลกด "ยืนยันว่ากินแล้ว" : taken = [{ name, slot }] , already = [{ name, slot, at, by: 'self'|'caregiver' }]
function caregiverTakeResult({ taken = [], already = [] }) {
  const blocks = [];
  // ชื่อคน (ความยาวไม่แน่นอน) อยู่บรรทัดของตัวเองพร้อมมื้อ ; บรรทัดคงที่ยาวไม่เกินประมาณ 22 ตัวอักษร
  const who = (x) => `คุณ${niceName(x.name, 30)} · มื้อ${SLOT_LABEL[x.slot]}`;
  for (const t of taken) blocks.push(['✅ บันทึกแล้วค่ะ', who(t), 'ขอบคุณที่ช่วยดูแลนะคะ'].join('\n'));
  for (const a of already) {
    const by = a.by === 'caregiver' ? `ญาติยืนยันเมื่อ ${a.at} น.` : `ผู้ป่วยกินเมื่อ ${a.at} น.`;
    blocks.push(['✅ กินไปแล้วค่ะ', who(a), by, 'ไม่ต้องกดซ้ำนะคะ'].join('\n'));
  }
  return plain(blocks.join('\n\n'));
}

// ---------- ตัวอย่างทุกแบบ (#ตัวอย่าง n — เฉพาะ DEMO_MODE ; ข้อมูลสร้างในหน่วยความจำ ไม่เขียน DB) ----------
const SAMPLE_DOSES = [
  { id: 1, name: 'พาราเซตามอล', strength: '500 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'after' },
  { id: 2, name: 'เมตฟอร์มิน', strength: '500 mg', dose_per_time: 0.5, unit: 'tablet', meal_relation: 'after' },
  { id: 3, name: 'แอมโลดิปีน', strength: '5 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'any' },
  { id: 4, name: 'ซิมวาสแตติน', strength: '20 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'before' },
  { id: 5, name: 'ยาแก้ไอน้ำเชื่อม', strength: null, dose_per_time: 2, unit: 'teaspoon', meal_relation: 'any' },
  { id: 6, name: 'แคลเซียม', strength: '600 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'with' },
  { id: 7, name: 'วิตามินดี', strength: '1000 IU', dose_per_time: 1, unit: 'capsule', meal_relation: 'after' },
  { id: 8, name: 'โอเมก้า 3', strength: null, dose_per_time: 1, unit: 'capsule', meal_relation: 'with' }
];
const sd = (ids) => SAMPLE_DOSES.filter((d) => ids.includes(d.id));
const shapedOf = (slotsIn) => {
  const slots = slotsIn.map((s) => ({ slot: s.slot, time: s.time, doses: s.doses.map((d) => ({ ...SAMPLE_DOSES.find((x) => x.id === d.id), status: d.status, is_due: !!d.due, ...(d.at ? { scheduled_at: `2026-10-09 ${d.at}:00` } : {}) })) }));
  const all = slots.flatMap((s) => s.doses);
  return { status: 200, body: { slots, summary: { total: all.length, taken: all.filter((d) => d.status === 'taken').length, pending: all.filter((d) => d.status === 'pending').length, missed: all.filter((d) => d.status === 'missed').length } } };
};

// คืนรายการ { id, title, ctx, messages } ; ctx = ประเภท quickReply ที่ใช้กับข้อความนั้น
function samples(env) {
  const rem = (slot, time, lateMin, ids) => F.buildReminder({ slot, scheduled_at: `2026-10-09 ${time}:00`, late_min: lateMin, doses: sd(ids) }, env, { preview: true });
  return [
    { id: 'reminder-soon', title: 'เตือน: ใกล้ถึงเวลา', ctx: 'patient', messages: [rem('evening', '18:00', -5, [1, 2])] },
    { id: 'reminder-due', title: 'เตือน: ถึงเวลา', ctx: 'patient', messages: [rem('morning', '08:00', 2, [1, 2, 3])] },
    { id: 'reminder-overdue', title: 'เตือน: เลยเวลา', ctx: 'patient', messages: [rem('noon', '12:00', 135, [1, 4])] },
    { id: 'reminder-many', title: 'เตือน: ยาเกิน 6 รายการ', ctx: 'patient', messages: [rem('bedtime', '21:00', 10, [1, 2, 3, 4, 5, 6, 7, 8])] },
    { id: 'follow-welcome', title: 'ต้อนรับ (เพิ่มเพื่อน)', ctx: 'unlinked', messages: [buildWelcome(false, env)] },
    { id: 'how-to-linked', title: 'วิธีใช้ (เชื่อมแล้ว)', ctx: 'patient', messages: [buildWelcome(true, env)] },
    { id: 'linked-patient', title: 'เชื่อมผู้ป่วยสำเร็จ', ctx: 'patient', messages: [buildLinkedPatient('สมชาย ใจดี', env)] },
    { id: 'linked-caregiver', title: 'เชื่อมผู้ดูแลสำเร็จ', ctx: 'caregiver', messages: [buildLinkedCaregiver('สมชาย ใจดี', 60, env)] },
    { id: 'today-partial', title: 'วันนี้: กินบางส่วน', ctx: 'patient', messages: [buildToday(shapedOf([
      { slot: 'morning', time: '08:00', doses: [{ id: 1, status: 'taken' }, { id: 2, status: 'taken' }] },
      { slot: 'noon', time: '12:00', doses: [{ id: 3, status: 'pending', due: true }] },
      { slot: 'evening', time: '18:00', doses: [{ id: 1, status: 'pending' }, { id: 4, status: 'pending' }] },
      { slot: 'bedtime', time: '21:00', doses: [{ id: 6, status: 'pending' }] }]), '2026-10-09', env)] },
    { id: 'today-done', title: 'วันนี้: กินครบ', ctx: 'patient', messages: [buildToday(shapedOf([
      { slot: 'morning', time: '08:00', doses: [{ id: 1, status: 'taken' }] },
      { slot: 'evening', time: '18:00', doses: [{ id: 3, status: 'taken' }] }]), '2026-10-09', env)] },
    { id: 'today-multitime', title: 'วันนี้: มื้อเดียวหลายเวลา', ctx: 'patient', messages: [buildToday(shapedOf([
      { slot: 'evening', time: '16:30', doses: [{ id: 7, status: 'taken', at: '16:30' }, { id: 2, status: 'pending', due: true, at: '18:00' }] }]), '2026-10-09', env)] },
    { id: 'today-empty', title: 'วันนี้: ไม่มียา', ctx: 'patient', messages: [buildToday(shapedOf([]), '2026-10-09', env)] },
    { id: 'taken-next', title: 'กินแล้ว: ยังมีมื้อถัดไป', ctx: 'patient', messages: [buildTaken({ names: ['พาราเซตามอล 500 mg', 'เมตฟอร์มิน 500 mg'], at: '08:03', taken: 2, total: 5, next: { slot: 'noon', time: '12:00' } }, env)] },
    { id: 'taken-last', title: 'กินแล้ว: ครบทุกรายการ', ctx: 'patient', messages: [buildTaken({ names: ['แอมโลดิปีน 5 mg'], at: '21:02', taken: 5, total: 5, next: null }, env)] },
    { id: 'text-invalid', title: 'รหัสใช้ไม่ได้/หมดอายุ', ctx: 'unlinked', messages: [TEXT.invalid()] },
    { id: 'text-toomany', title: 'เดารหัสผิดเกินกำหนด', ctx: 'unlinked', messages: [TEXT.tooMany()] },
    { id: 'text-conflict', title: 'LINE เชื่อมกับคนอื่นแล้ว', ctx: 'unlinked', messages: [TEXT.conflict()] },
    { id: 'text-already', title: 'กดซ้ำ', ctx: 'patient', messages: [TEXT.alreadyTaken()] },
    { id: 'text-notfound', title: 'ไม่พบรายการยา', ctx: 'patient', messages: [TEXT.doseNotFound()] },
    { id: 'text-help', title: 'ช่วยเหลือ', ctx: 'patient', messages: [TEXT.help()] },
    { id: 'text-caregiver-only', title: 'ผู้ดูแลอย่างเดียว พิมพ์ "วันนี้"', ctx: 'caregiver', messages: [TEXT.caregiverOnly(['สมชาย ใจดี', 'มาลี ใจงาม'])] },
    { id: 'cg-escalation', title: 'แจ้งญาติ: ลืมกินยา', ctx: 'caregiver', messages: [buildEscalation({ patient: 'สมชาย ใจดี', slot: 'evening', scheduled_at: '2026-10-09 18:00:00', late_min: 65, doses: sd([1, 2]), escalation_ids: [] }, env, { preview: true })] },
    { id: 'cg-escalation-many', title: 'แจ้งญาติ: ยาเกิน 6 รายการ', ctx: 'caregiver', messages: [buildEscalation({ patient: 'มาลี ใจงาม', slot: 'morning', scheduled_at: '2026-10-09 08:00:00', late_min: 125, doses: sd([1, 2, 3, 4, 5, 6, 7, 8]), escalation_ids: [] }, env, { preview: true })] },
    { id: 'cg-resolved', title: 'แจ้งญาติ: ผู้ป่วยกินแล้ว (ปิดเรื่อง)', ctx: 'caregiver', messages: [buildEscalationResolved({ patient: 'สมชาย ใจดี', slot: 'evening', scheduled_at: '2026-10-09 18:00:00', at: '18:42', source: 'line', doses: sd([1, 2]) }, env)] },
    { id: 'cg-today', title: 'ผู้ดูแล: พิมพ์ "วันนี้"', ctx: 'caregiver', messages: [buildCaregiverToday([
      { name: 'สมชาย ใจดี', shaped: shapedOf([{ slot: 'morning', time: '08:00', doses: [{ id: 1, status: 'taken' }] }, { slot: 'evening', time: '18:00', doses: [{ id: 1, status: 'pending', due: true }] }, { slot: 'bedtime', time: '21:00', doses: [{ id: 6, status: 'pending' }] }]) },
      { name: 'มาลี ใจงาม', shaped: shapedOf([{ slot: 'morning', time: '08:00', doses: [{ id: 3, status: 'taken' }] }]) }], '2026-10-09', env)] },
    { id: 'cg-taken', title: 'ผู้ดูแลกดยืนยัน: บันทึกแล้ว', ctx: 'caregiver', messages: [caregiverTakeResult({ taken: [{ name: 'สมชาย ใจดี', slot: 'evening' }] })] },
    { id: 'cg-already', title: 'ผู้ดูแลกดยืนยัน: ผู้ป่วยกินไปแล้ว', ctx: 'caregiver', messages: [caregiverTakeResult({ already: [{ name: 'สมชาย ใจดี', slot: 'evening', at: '18:12', by: 'self' }] })] },
    { id: 'cg-already-cg', title: 'ผู้ดูแลกดยืนยัน: ญาติคนอื่นยืนยันแล้ว', ctx: 'caregiver', messages: [caregiverTakeResult({ already: [{ name: 'สมชาย ใจดี', slot: 'evening', at: '16:33', by: 'caregiver' }] })] },
    { id: 'cg-ack', title: 'ผู้ดูแลกดรับทราบ', ctx: 'caregiver', messages: [TEXT.cgAck()] },
    { id: 'cg-noauth', title: 'ผู้ดูแลกดแต่ไม่มีสิทธิ์', ctx: 'caregiver', messages: [TEXT.cgNoAuth()] },
    { id: 'text-not-linked', title: 'ยังไม่ได้เชื่อม พิมพ์ "วันนี้"', ctx: 'unlinked', messages: [TEXT.notLinked()] }
  ];
}
const SAMPLES_PER_PAGE = 2;   // หัว text 1 + ตัวอย่าง 1 = 2 ข้อความ → 2 ตัวอย่าง/หน้า = 4 ข้อความ (ไม่เกิน 5 ที่ LINE รับต่อครั้ง)
function previewPageCount(env) { return Math.ceil(samples(env).length / SAMPLES_PER_PAGE); }
// หน้า n (1…) → ข้อความไม่เกิน 5 ; n เกินช่วง → null
function buildPreviewPage(n, env) {
  const all = samples(env);
  const pages = Math.ceil(all.length / SAMPLES_PER_PAGE);
  if (!Number.isInteger(n) || n < 1 || n > pages) return null;
  const out = [];
  all.slice((n - 1) * SAMPLES_PER_PAGE, n * SAMPLES_PER_PAGE).forEach((s, i) => {
    out.push(plain(`ตัวอย่าง ${(n - 1) * SAMPLES_PER_PAGE + i + 1}/${all.length}: ${s.title}`));
    out.push(...s.messages);
  });
  return { messages: out, ctx: all[(n - 1) * SAMPLES_PER_PAGE].ctx, page: n, pages };
}

module.exports = {
  plain, niceName, thaiDate, thaiJoin, TEXT,
  buildWelcome, buildLinkedPatient, buildLinkedCaregiver, buildToday, buildTaken, slotStatus, timeRows, timeRows,
  buildEscalation, buildEscalationResolved, buildCaregiverToday, caregiverTakeResult, firstName, cgTakeData, cgAckData,
  samples, buildPreviewPage, previewPageCount, SAMPLES_PER_PAGE
};
