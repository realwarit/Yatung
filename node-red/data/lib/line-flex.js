// สร้างข้อความ Flex เตือนกินยา (pure function ไม่เรียกเครือข่าย/DB) — ใช้โดย lib/reminder-service.js
// น้ำเสียง "ค่ะ/นะคะ" ; ป้ายภาษาไทยเดียวกับเว็บ (lib/labels-th.js)
const { SLOT_LABEL, MEAL_LABEL, doseText, unitInDose } = require('./labels-th');

const PRIMARY = '#0f766e';
const INK = '#134e4a';
const SOFT = '#e6f4f1';
const MAX_POSTBACK = 300;     // ข้อจำกัดของ LINE: postback data ≤ 300 ตัวอักษร
const MAX_ALT = 400;          // altText ≤ 400
const MAX_DOSES_PER_MESSAGE = 15;

const trimSlash = (u) => String(u || '').replace(/\/+$/, '');
// รูปน้องยาตรง: LINE_MASCOT_URL หรือ ${PUBLIC_BASE_URL}/line/mascot.png ; ต้องเป็น https (ไม่ใช่ → null = ไม่ใส่รูป ข้อความยังส่งได้)
function mascotUrl(env = process.env) {
  const u = String(env.LINE_MASCOT_URL || '').trim() || (env.PUBLIC_BASE_URL ? trimSlash(env.PUBLIC_BASE_URL) + '/line/mascot.png' : '');
  return /^https:\/\/[^\s]+$/.test(u) ? u : null;
}
// ลิงก์ปุ่ม "เปิดแอป" = ${PUBLIC_BASE_URL}/today (ไม่มี/ไม่ใช่ http(s) → null = ไม่ใส่ปุ่ม)
function appUrl(env = process.env) {
  const b = trimSlash(env.PUBLIC_BASE_URL);
  return /^https?:\/\/[^\s]+$/.test(b) ? b + '/today' : null;
}

const timeText = (scheduledAt) => String(scheduledAt).slice(11, 16);   // 'YYYY-MM-DD HH:MM:SS' → 'HH:MM'

// "ครั้งละ ½ เม็ด · หลังอาหาร"
function doseLine(d) {
  const meal = MEAL_LABEL[d.meal_relation];
  return `ครั้งละ ${doseText(Number(d.dose_per_time))} ${unitInDose(d.unit)}${meal ? ' · ' + meal : ''}`;
}
const medTitle = (d) => (d.strength ? `${d.name} ${d.strength}` : d.name);

const postbackData = (ids) => `a=take&d=${ids.join(',')}`;

// แบ่ง dose เป็นก้อนละไม่เกิน 15 รายการ และ postback data ไม่เกิน 300 ตัวอักษร (ปกติ 1 ก้อน)
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

// group = { slot, scheduled_at, doses: [{ id, name, strength, dose_per_time, unit, meal_relation }] } (doses ≤ 15 — ใช้ chunkDoses ก่อน)
function buildReminder(group, env = process.env) {
  const slotLabel = SLOT_LABEL[group.slot] || '';
  const time = timeText(group.scheduled_at);
  const n = group.doses.length;
  const altText = `⏰ ถึงเวลากินยามื้อ${slotLabel}แล้ว (${n} รายการ)`.slice(0, MAX_ALT);

  const img = mascotUrl(env);
  const header = {
    type: 'box', layout: 'horizontal', spacing: 'md', paddingAll: '16px', backgroundColor: SOFT, alignItems: 'center',
    contents: [
      ...(img ? [{ type: 'image', url: img, size: '72px', aspectMode: 'fit', aspectRatio: '1:1', flex: 0 }] : []),
      {
        type: 'box', layout: 'vertical', flex: 1, spacing: 'xs',
        contents: [
          { type: 'text', text: `ถึงเวลากินยามื้อ${slotLabel}แล้วนะคะ`, weight: 'bold', size: 'lg', color: INK, wrap: true },
          { type: 'text', text: `${time} น.`, weight: 'bold', size: 'xl', color: PRIMARY }
        ]
      }
    ]
  };

  const body = { type: 'box', layout: 'vertical', spacing: 'lg', paddingAll: '16px', contents: [] };
  group.doses.forEach((d, i) => {
    if (i > 0) body.contents.push({ type: 'separator' });
    body.contents.push({
      type: 'box', layout: 'vertical', spacing: 'xs',
      contents: [
        { type: 'text', text: medTitle(d), weight: 'bold', size: 'xl', color: INK, wrap: true },
        { type: 'text', text: doseLine(d), size: 'md', color: '#475569', wrap: true }
      ]
    });
  });

  const footer = {
    type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px',
    contents: [{
      type: 'button', style: 'primary', color: PRIMARY, height: 'md',
      action: { type: 'postback', label: '✓ กินแล้ว', data: postbackData(group.doses.map((d) => d.id)), displayText: `กินยามื้อ${slotLabel}แล้ว` }
    }]
  };
  const open = appUrl(env);
  if (open) footer.contents.push({ type: 'button', style: 'secondary', height: 'md', action: { type: 'uri', label: 'เปิดแอป', uri: open } });

  return { type: 'flex', altText, contents: { type: 'bubble', size: 'mega', header, body, footer } };
}

module.exports = { buildReminder, chunkDoses, postbackData, doseLine, medTitle, mascotUrl, appUrl, timeText, MAX_POSTBACK, MAX_DOSES_PER_MESSAGE };
