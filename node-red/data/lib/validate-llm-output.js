// =====================================================================
// ตรวจผลลัพธ์จาก LLM (ใช้ผ่าน global.get('llmOutput'))
//   process(raw, validate) : parse → Ajv → ปิดข้อมูลส่วนตัวซ้ำฝั่ง server → business rules → review_flags
//     สำเร็จ  → { ok: true, result, review_flags }
//     ล้มเหลว → { ok: false, status: 422, body: { error, details } }
//   reviewFlags(data)      : กฎ business เดี่ยวๆ (ใช้ซ้ำตอนโหลดจาก GET /api/prescriptions/:id)
//   redactPii(text)        : แทน HN / เลขบัตร 13 หลัก / เบอร์โทร ที่ LLM ปิดไม่หมด
// =====================================================================
const LOW = 0.7;
const SLOT_ORDER = ['morning', 'noon', 'evening', 'bedtime'];

// เลขบัตร 13 หลัก (มีหรือไม่มีขีด/เว้นวรรค) — ทำก่อนเบอร์โทร
const ID_CARD_RE = /(?<!\d)\d(?:[\s-]?\d){12}(?!\d)/g;
// เบอร์ไทย 9–10 หลักขึ้นต้น 0 หรือ +66 (เช่น 081-234-5678, 02 123 4567)
const PHONE_RE = /(?<![\d.])(?:\+66[\s-]?|0)\d{1,2}[\s-]?\d{3}[\s-]?\d{3,4}(?!\d)/g;

// HN / AN / VN + เลขผู้ป่วย (ป้าย + ตัวเลขรวมกัน) เช่น "HN: 123456", "HN 12-34567", "AN.998877"
const HN_RE = /(?<![A-Za-z])(?:HN|AN|VN)\s*(?:no\.?|number)?\s*[:.#-]?\s*\d[\d/-]*/gi;

function redactPii(text) {
  if (typeof text !== 'string') return text;
  return text.replace(ID_CARD_RE, '[เลขบัตร]').replace(HN_RE, '[HN]').replace(PHONE_RE, '[เบอร์โทร]');
}

function parseRaw(raw) {
  if (typeof raw !== 'string') return raw;
  // LLM บางตัวครอบ ```json ... ``` มาให้ แม้จะสั่งว่าไม่ต้อง
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(cleaned); } catch (e) { return null; }
}

function reviewFlags(data) {
  const flags = []; // [{ index, field, reason }] → หน้า Review ใช้ไฮไลต์สีเหลือง
  data.medications.forEach((m, i) => {
    if (!m.as_needed && m.slots.length === 0) {
      flags.push({ index: i, field: 'slots', reason: 'ไม่พบมื้อที่ต้องกิน กรุณาเลือก' });
    }
    if (m.meal_relation === 'unknown') {
      flags.push({ index: i, field: 'meal_relation', reason: 'ซองยาไม่ระบุก่อน/หลังอาหาร' });
    }
    if (m.dose_per_time === null) {
      flags.push({ index: i, field: 'dose_per_time', reason: 'ไม่พบจำนวนต่อครั้ง' });
    }
    // ความมั่นใจต่ำ (LLM ประเมินตัวเอง จึงใช้เป็นสัญญาณช่วยเท่านั้น ไม่ใช่ความจริง)
    for (const [field, score] of Object.entries(m.confidence)) {
      if (score < LOW) flags.push({ index: i, field, reason: `AI มั่นใจต่ำ (${Math.round(score * 100)}%)` });
    }
    // กินเกิน 4 เม็ดต่อครั้งพบได้น้อย → ให้ตรวจ
    if (m.dose_per_time !== null && m.dose_per_time > 4 && ['tablet', 'capsule'].includes(m.unit)) {
      flags.push({ index: i, field: 'dose_per_time', reason: 'จำนวนต่อครั้งสูงผิดปกติ กรุณาตรวจ' });
    }
  });
  if (!data.is_medicine_label) {
    flags.push({ index: -1, field: 'is_medicine_label', reason: 'ภาพนี้อาจไม่ใช่ซองยา' });
  }
  // ช่องเดียวกันถูก flag หลายเหตุผลได้ → เก็บเหตุผลแรกไว้อันเดียว
  const seen = new Set();
  return flags.filter((f) => {
    const key = f.index + ':' + f.field;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function process(raw, validate) {
  const data = parseRaw(raw);
  if (data === null || typeof data !== 'object') {
    return { ok: false, status: 422, body: { error: 'AI_INVALID_JSON', details: 'ระบบอ่านผล AI ไม่ได้ กรุณาลองใหม่หรือกรอกเอง' } };
  }
  if (!validate(data)) {
    return {
      ok: false, status: 422,
      body: { error: 'AI_SCHEMA_MISMATCH', details: validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`).slice(0, 10) }
    };
  }

  // ปิดข้อมูลส่วนตัวซ้ำอีกชั้น (เผื่อ LLM ปิดไม่หมด)
  data.ocr_text = redactPii(data.ocr_text);
  data.medications.forEach((m) => { m.source_text = redactPii(m.source_text); });

  data.medications.forEach((m) => {
    if (m.as_needed && m.slots.length) m.slots = [];   // ยาเมื่อมีอาการ ต้องไม่มีรอบเตือน
    m.slots.sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b));
  });
  return { ok: true, result: data, review_flags: reviewFlags(data) };
}

module.exports = { process, reviewFlags, redactPii };
