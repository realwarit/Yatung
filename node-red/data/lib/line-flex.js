// ระบบออกแบบข้อความ Flex ของ LINE (pure function ไม่เรียกเครือข่าย/DB) — ใช้โดย reminder-service.js และ line-messages.js
// น้ำเสียงน้องยาตรง "ค่ะ/นะคะ" สุภาพ อบอุ่น สั้น ; ป้ายภาษาไทยเดียวกับเว็บ (lib/labels-th.js)
// กฎที่ทดสอบอัตโนมัติ (node-red/test/line-flex.test.js): altText ทุกแบบ ≤ 400 · อิโมจิ ≤ 1 ตัวต่อบรรทัด และอยู่ต้นบรรทัดหรือท้ายบรรทัดเท่านั้น ·
//   ตัวอักษร: หัวข้อ ≥ lg, ชื่อยา ≥ xl, ข้อความรอง ≥ md · text/button ทุกตัวมี scaling: true (ขยายตามขนาดตัวอักษรในแอป LINE) · bubble ≤ 30 KB
const { SLOT_LABEL, SLOT_EMOJI, MEAL_LABEL, doseText, unitInDose } = require('./labels-th');

// ---------- token สี (ตรงกับ frontend/src/styles/_tokens.scss) ----------
const COLOR = {
  primary: '#0f766e',        // --yt-primary
  primaryDeep: '#134e4a',    // --yt-primary-deep
  mint: '#e8f7f3',           // --yt-bg-mint (พื้นหัวข้อ)
  bg: '#f6faf9',             // --yt-bg
  border: '#d3e2df',         // --yt-border
  text: '#12302d',           // --yt-text
  muted: '#4b5f5c',          // --yt-text-muted
  success: '#15803d', successSoft: '#dcfce7', onSuccessSoft: '#14532d',
  warning: '#b45309', warningSoft: '#fef3c7', onWarningSoft: '#78350f'
};

const MAX_POSTBACK = 300;     // ข้อจำกัดของ LINE: postback data ≤ 300 ตัวอักษร
const MAX_ALT = 400;          // altText ≤ 400
const MAX_BUBBLE_BYTES = 30000;   // Flex bubble ≤ 30 KB (ขีดจำกัดของ LINE)
const MAX_DOSES_PER_MESSAGE = 15;
const MAX_SHOWN_DOSES = 6;    // แสดงรายการยาในการ์ดไม่เกิน 6 แล้วต่อด้วย "+ อีก n รายการ" (postback ยังมี id ครบ)
const WARN_AFTER_MIN = 30;    // เลยเวลาเกิน 30 นาที = เหลือง (ตรงกับ is_overdue ของเว็บ)

const trimSlash = (u) => String(u || '').replace(/\/+$/, '');

// ---------- URL ของรูป/ปุ่ม ----------
// ไฟล์รูปท่า: LINE_ASSET_BASE (ว่าง = ${PUBLIC_BASE_URL}/line) + ชื่อไฟล์ ; ต้องเป็น https (ไม่ใช่ → null = ไม่ใส่รูป ข้อความยังส่งได้)
// LINE_MASCOT_URL (ตัวแปรเดิม) ถ้ามี ใช้เป็นท่ากระดิ่งต่อไป
const POSES = { bell: 'mascot-bell.png', cheer: 'mascot-cheer.png', hello: 'mascot-hello.png' };
function assetBase(env = process.env) {
  const b = trimSlash(env.LINE_ASSET_BASE) || (env.PUBLIC_BASE_URL ? trimSlash(env.PUBLIC_BASE_URL) + '/line' : '');
  return b;
}
function mascotUrl(pose, env = process.env) {
  if (pose === 'bell') {
    const legacy = String(env.LINE_MASCOT_URL || '').trim();
    if (/^https:\/\/[^\s]+$/.test(legacy)) return legacy;
  }
  const b = assetBase(env);
  const u = b && POSES[pose] ? `${b}/${POSES[pose]}` : '';
  return /^https:\/\/[^\s]+$/.test(u) ? u : null;
}
// ลิงก์ปุ่ม "เปิดแอป" = ${PUBLIC_BASE_URL}<path> (ไม่มี/ไม่ใช่ http(s) → null = ไม่ใส่ปุ่ม)
function appUrl(env = process.env, path = '/today') {
  const b = trimSlash(env.PUBLIC_BASE_URL);
  return /^https?:\/\/[^\s]+$/.test(b) ? b + path : null;
}

const timeText = (scheduledAt) => String(scheduledAt).slice(11, 16);   // 'YYYY-MM-DD HH:MM:SS' → 'HH:MM'

// ---------- ข้อความเวลา ----------
// 45 → '45 นาที' ; 60 → '1 ชม.' ; 125 → '2 ชม. 5 นาที'
function durationText(totalMin) {
  const m = Math.max(0, Math.round(totalMin));
  if (m < 60) return `${m} นาที`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} ชม. ${r} นาที` : `${h} ชม.`;
}
// lateness (นาที, ติดลบ = ยังไม่ถึงเวลา) → 'soon' | 'due' | 'overdue'
function latenessState(lateMin) {
  if (lateMin < 0) return 'soon';
  if (lateMin < WARN_AFTER_MIN) return 'due';
  return 'overdue';
}

// ---------- ส่วนประกอบพื้นฐาน ----------
// ทุก text/button ใส่ scaling: true ; ตัวอักษรหลักใช้ wrap เพราะชื่อยา/ชื่อคนยาวไม่แน่นอน
const text = (t, o = {}) => ({ type: 'text', text: String(t), wrap: true, scaling: true, size: 'md', color: COLOR.text, ...o });
const separator = () => ({ type: 'separator', margin: 'md', color: COLOR.border });
const box = (contents, o = {}) => ({ type: 'box', layout: 'vertical', contents, ...o });

// ปุ่ม: primary = สีเขียวทึบ, secondary = ปุ่มรอง
function button(label, action, kind = 'primary') {
  return kind === 'primary'
    ? { type: 'button', style: 'primary', color: COLOR.primary, height: 'md', scaling: true, action: { label, ...action } }
    : { type: 'button', style: 'secondary', height: 'md', scaling: true, action: { label, ...action } };
}
const uriButton = (label, uri, kind = 'secondary') => button(label, { type: 'uri', uri }, kind);
const messageButton = (label, textToSend, kind = 'primary') => button(label, { type: 'message', text: textToSend }, kind);
const footerOf = (buttons) => (buttons.length ? box(buttons, { spacing: 'sm', paddingAll: '16px' }) : undefined);

// header: รูปน้องยาตรง (ตรงกลาง) + หัวข้อ (บรรทัดเดียวบนจอ 375px — ต้องสั้น ≤ ~26 ตัวอักษรฐาน) + ป้ายรอง
// tone = 'normal' (พื้นมิ้นต์) | 'warn' (พื้นเหลืองเตือน)
function header({ pose, title, badge, tone = 'normal' }, env) {
  const warn = tone === 'warn';
  const img = pose ? mascotUrl(pose, env) : null;
  const contents = [];
  if (img) contents.push({ type: 'image', url: img, size: '88px', aspectMode: 'fit', aspectRatio: '1:1', align: 'center' });
  contents.push(text(title, { weight: 'bold', size: 'lg', align: 'center', color: warn ? COLOR.onWarningSoft : COLOR.primaryDeep }));
  if (badge) contents.push(text(badge, { weight: 'bold', size: 'md', align: 'center', color: warn ? COLOR.onWarningSoft : COLOR.primary }));
  return box(contents, { spacing: 'sm', paddingAll: '16px', backgroundColor: warn ? COLOR.warningSoft : COLOR.mint, alignItems: 'center' });
}

// รายการยา: ชื่อ+ความแรง (xl) แล้วบรรทัดรอง "ครั้งละ… · …" (md) ; เกิน 6 → "+ อีก n รายการ"
function doseLine(d) {
  const meal = MEAL_LABEL[d.meal_relation];
  return `ครั้งละ ${doseText(Number(d.dose_per_time))} ${unitInDose(d.unit)}${meal ? ' · ' + meal : ''}`;
}
const medTitle = (d) => (d.strength ? `${d.name} ${d.strength}` : d.name);
function medList(doses, max = MAX_SHOWN_DOSES) {
  const out = [];
  doses.slice(0, max).forEach((d, i) => {
    if (i > 0) out.push(separator());
    out.push(box([
      text(medTitle(d), { weight: 'bold', size: 'xl' }),
      text(doseLine(d), { size: 'md', color: COLOR.muted })
    ], { spacing: 'xs', margin: i > 0 ? 'md' : undefined }));
  });
  if (doses.length > max) out.push(text(`+ อีก ${doses.length - max} รายการ`, { size: 'md', color: COLOR.muted, margin: 'md' }));
  return out;
}

// แถบความคืบหน้า "กินแล้ว a จาก b รายการ" (นับเหมือนวงกลมในหน้าวันนี้ของเว็บ: taken ÷ ทุกรอบของวันนี้)
function progress(taken, total) {
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((taken / total) * 100))) : 0;
  const bar = box(pct ? [box([], { width: pct + '%', height: '10px', backgroundColor: COLOR.primary, cornerRadius: '5px' })] : [],
    { height: '10px', backgroundColor: COLOR.border, cornerRadius: '5px' });
  return box([text(`กินแล้ว ${taken} จาก ${total} รายการ`, { weight: 'bold', size: 'md' }), bar], { spacing: 'sm' });
}

// ป้ายสถานะ (กล่องมน) : kind = 'done' | 'late' | 'wait'
const BADGE = {
  done: { bg: COLOR.successSoft, fg: COLOR.onSuccessSoft, label: '✅ กินแล้ว' },
  late: { bg: COLOR.warningSoft, fg: COLOR.onWarningSoft, label: '⏰ ยังไม่ได้กิน' },
  wait: { bg: COLOR.border, fg: COLOR.text, label: '🕒 รอเวลา' }
};
function badge(kind) {
  const b = BADGE[kind];
  return box([text(b.label, { size: 'md', weight: 'bold', color: b.fg, align: 'center' })], { backgroundColor: b.bg, cornerRadius: '12px', paddingAll: '6px', flex: 0, justifyContent: 'center' });
}

// bubble ครบชุด ; ตัดส่วนที่ไม่มีออก
function bubble({ header: h, body, footer }) {
  return { type: 'bubble', size: 'mega', header: h, body, ...(footer ? { footer } : {}) };
}
const bodyOf = (contents, o = {}) => box(contents, { spacing: 'md', paddingAll: '16px', ...o });
const flexMessage = (altText, contents) => ({ type: 'flex', altText: String(altText).slice(0, MAX_ALT), contents });

// ---------- Quick reply (ใส่ในทุก reply ที่มีเมนูให้แตะ ; ไม่ใส่ใน push เตือน) ----------
// ctx = 'patient' | 'unlinked' | 'caregiver'
const qrMessage = (label, t) => ({ type: 'action', action: { type: 'message', label, text: t } });
const qrUri = (label, uri) => ({ type: 'action', action: { type: 'uri', label, uri } });
function quickReply(ctx, env = process.env) {
  const items = [];
  if (ctx === 'patient') {
    items.push(qrMessage('📋 ยาวันนี้', 'วันนี้'));
    const u = appUrl(env, '/today'); if (u) items.push(qrUri('📱 เปิดแอป', u));
    items.push(qrMessage('❓ ช่วยเหลือ', 'ช่วยเหลือ'));
  } else if (ctx === 'unlinked') {
    items.push(qrMessage('🔗 วิธีเชื่อมบัญชี', 'วิธีใช้'));
    const u = appUrl(env, '/settings'); if (u) items.push(qrUri('📱 เปิดแอป', u));
  } else {
    items.push(qrMessage('❓ ช่วยเหลือ', 'ช่วยเหลือ'));
  }
  return { items };
}
// แนบ quickReply ที่ข้อความสุดท้าย (LINE แสดงเฉพาะของข้อความสุดท้าย) — ไม่แก้ object เดิม
function withQuickReply(messages, ctx, env = process.env) {
  if (!messages.length) return messages;
  const last = { ...messages[messages.length - 1], quickReply: quickReply(ctx, env) };
  return [...messages.slice(0, -1), last];
}

// ---------- แบ่ง dose เป็นก้อนละไม่เกิน 15 รายการ และ postback data ไม่เกิน 300 ตัวอักษร (ปกติ 1 ก้อน) ----------
const postbackData = (ids) => `a=take&d=${ids.join(',')}`;
function chunkDoses(doses) {
  const chunks = [];
  let cur = [];
  for (const d of doses) {
    const next = [...cur, d];
    if (cur.length && (next.length > MAX_DOSES_PER_MESSAGE || postbackData(next.map((x) => x.id)).length > MAX_POSTBACK)) { chunks.push(cur); cur = [d]; }
    else cur = next;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

// ---------- Flex เตือนกินยา (push) ----------
// group = { slot, scheduled_at, late_min (นาที ติดลบ = ยังไม่ถึงเวลา; ไม่ใส่ = 0), doses: [{ id, name, strength, dose_per_time, unit, meal_relation }] } (doses ≤ 15 — ใช้ chunkDoses ก่อน)
// opts.preview = true → ปุ่มกินแล้วเป็น postback ตัวอย่าง (a=preview) ไม่บันทึกอะไร (ใช้กับ #ตัวอย่าง)
function buildReminder(group, env = process.env, opts = {}) {
  const slotLabel = SLOT_LABEL[group.slot] || '';
  const emoji = SLOT_EMOJI[group.slot] || '';
  const time = timeText(group.scheduled_at);
  const n = group.doses.length;
  const lateMin = Number.isFinite(Number(group.late_min)) ? Number(group.late_min) : 0;
  const state = latenessState(lateMin);
  const slotBadge = `${emoji ? emoji + ' ' : ''}มื้อ${slotLabel} · ${time} น.`;

  let h, altText;
  if (state === 'soon') {
    const x = durationText(Math.ceil(-lateMin));
    h = { pose: 'bell', title: 'ใกล้ถึงเวลากินยาแล้วนะคะ', badge: `${slotBadge} (อีก ${x})` };
    altText = `⏰ อีก ${x} ถึงเวลากินยามื้อ${slotLabel}`;
  } else if (state === 'due') {
    h = { pose: 'bell', title: 'ถึงเวลากินยาแล้วนะคะ', badge: slotBadge };
    altText = `⏰ ถึงเวลากินยามื้อ${slotLabel}แล้ว (${n} รายการ)`;
  } else {
    const x = durationText(Math.floor(lateMin));
    h = { pose: 'bell', title: `ยังไม่ได้กินยามื้อ${slotLabel}นะคะ`, badge: `⏰ เลยเวลามา ${x}`, tone: 'warn' };
    altText = `⏰ ยังไม่ได้กินยามื้อ${slotLabel} · เลยเวลามา ${x}`;
  }

  const take = { type: 'postback', data: opts.preview ? 'a=preview' : postbackData(group.doses.map((d) => d.id)), displayText: `กินยามื้อ${slotLabel}แล้ว` };
  const buttons = [button('✓ กินแล้ว', take, 'primary')];
  const open = appUrl(env, '/today');
  if (open) buttons.push(uriButton('เปิดแอป', open));

  return flexMessage(altText, bubble({ header: header(h, env), body: bodyOf(medList(group.doses)), footer: footerOf(buttons) }));
}

module.exports = {
  COLOR, MAX_POSTBACK, MAX_ALT, MAX_BUBBLE_BYTES, MAX_DOSES_PER_MESSAGE, MAX_SHOWN_DOSES, WARN_AFTER_MIN,
  // token/URL
  mascotUrl, appUrl, assetBase, timeText, durationText, latenessState,
  // ส่วนประกอบ
  text, box, separator, button, uriButton, messageButton, footerOf, header, medList, medTitle, doseLine, progress, badge, bubble, bodyOf, flexMessage,
  quickReply, withQuickReply, qrMessage, qrUri,
  // เตือนกินยา
  buildReminder, chunkDoses, postbackData
};
