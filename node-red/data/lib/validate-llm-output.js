// =====================================================================
// Node-RED function node: "Validate LLM output"
// วางโค้ดนี้ใน function node ที่ต่อจาก http request ที่เรียก LLM (tab 2-AI-Scan)
//
// input : msg.payload = ข้อความดิบจาก LLM (string) หรือ object ที่ parse แล้ว
// output 1 (สำเร็จ): msg.payload = { result, review_flags }
// output 2 (ล้มเหลว): msg.statusCode = 422, msg.payload = { error, details }
// ตั้งค่า node ให้มี 2 outputs
// =====================================================================

const validate = global.get('medicineValidator'); // compile ไว้ครั้งเดียวใน settings.js

// 1) Parse — LLM บางตัวครอบ ```json ... ``` มาให้ แม้จะสั่งว่าไม่ต้อง
let data = msg.payload;
if (typeof data === 'string') {
  const raw = data;
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    node.warn({ step: 'parse', raw: raw.slice(0, 500) });
    msg.statusCode = 422;
    msg.payload = { error: 'AI_INVALID_JSON', details: 'ระบบอ่านผล AI ไม่ได้ กรุณาลองใหม่หรือกรอกเอง' };
    return [null, msg];
  }
}

// 2) Validate กับ JSON Schema (Ajv)
if (!validate(data)) {
  msg.statusCode = 422;
  msg.payload = {
    error: 'AI_SCHEMA_MISMATCH',
    details: validate.errors.map(e => `${e.instancePath || '/'} ${e.message}`).slice(0, 10)
  };
  return [null, msg];
}

// 3) Business rules ที่ JSON Schema ตรวจไม่ได้
const LOW = 0.7;
const SLOT_ORDER = ['morning', 'noon', 'evening', 'bedtime'];
const reviewFlags = []; // [{ index, field, reason }] → หน้า Review ใช้ไฮไลต์สีเหลือง

data.medications.forEach((m, i) => {
  // ยาเมื่อมีอาการ ต้องไม่มีรอบเตือน
  if (m.as_needed && m.slots.length) m.slots = [];

  // ยาปกติแต่ไม่มีมื้อ → ผู้ใช้ต้องเลือกเอง
  if (!m.as_needed && m.slots.length === 0) {
    reviewFlags.push({ index: i, field: 'slots', reason: 'ไม่พบมื้อที่ต้องกิน กรุณาเลือก' });
  }

  // จัดลำดับมื้อให้คงที่ (เช้า → ก่อนนอน)
  m.slots.sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b));

  if (m.meal_relation === 'unknown') {
    reviewFlags.push({ index: i, field: 'meal_relation', reason: 'ซองยาไม่ระบุก่อน/หลังอาหาร' });
  }
  if (m.dose_per_time === null) {
    reviewFlags.push({ index: i, field: 'dose_per_time', reason: 'ไม่พบจำนวนต่อครั้ง' });
  }

  // ความมั่นใจต่ำ (ค่านี้ LLM ประเมินตัวเอง จึงใช้เป็นสัญญาณช่วยเท่านั้น ไม่ใช่ความจริง)
  for (const [field, score] of Object.entries(m.confidence)) {
    if (score < LOW) {
      reviewFlags.push({ index: i, field, reason: `AI มั่นใจต่ำ (${Math.round(score * 100)}%)` });
    }
  }

  // กันค่าแปลก: กินเกิน 4 เม็ดต่อครั้งพบได้น้อย → ให้ตรวจ
  if (m.dose_per_time !== null && m.dose_per_time > 4 && ['tablet', 'capsule'].includes(m.unit)) {
    reviewFlags.push({ index: i, field: 'dose_per_time', reason: 'จำนวนต่อครั้งสูงผิดปกติ กรุณาตรวจ' });
  }
});

if (!data.is_medicine_label) {
  reviewFlags.push({ index: -1, field: 'is_medicine_label', reason: 'ภาพนี้อาจไม่ใช่ซองยา' });
}

// ช่องเดียวกันถูก flag หลายเหตุผลได้ → เก็บเหตุผลแรกไว้อันเดียว
const seen = new Set();
const uniqueFlags = reviewFlags.filter(f => {
  const key = f.index + ':' + f.field;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

msg.payload = { result: data, review_flags: uniqueFlags };
return [msg, null];
