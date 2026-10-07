// logic ของ tab 2-AI-Scan — function node แค่เรียกฟังก์ชันที่นี่ (global: scanService)
// pipeline: ตรวจ input → จำกัดการใช้ → บันทึกรูป → [http request Gemini] → ตรวจผล → บันทึก prescriptions
// ห้าม log API key / base64 / ocr_text ทั้งก้อน (log ได้แค่ความยาว เวลา status)
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');     // = /data/uploads ใน container
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const TEXT_MIN = 5;
const TEXT_MAX = 1000;
const RATE_PER_MINUTE = 4;
const RATE_PER_DAY = 15;
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const TOTAL_BUDGET_MS = 40000;   // เวลารวมสูงสุดของ /api/scan ที่ยิง Gemini (รวม retry/fallback)
const FIRST_TIMEOUT_MS = 20000;
const MAX_OUTPUT_TOKENS = 4096;
const MIN_RETRY_MS = 8000;
const RETRY_DELAY_MS = 2000;

const err = (status, error, details) => ({ status, body: { error, details } });

// ---------- 1) ตรวจ input ----------
function detectMime(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

// body = { image } หรือ { text } อย่างใดอย่างหนึ่ง → { ok:true, kind, ... } | { ok:false, status, body }
function checkInput(body) {
  const bad = (d) => ({ ok: false, ...err(400, 'VALIDATION', d) });
  if (!body || typeof body !== 'object') return bad('ต้องส่งรูป (image) หรือข้อความ (text) อย่างใดอย่างหนึ่ง');
  const hasImage = body.image !== undefined && body.image !== null && body.image !== '';
  const hasText = body.text !== undefined && body.text !== null && body.text !== '';
  if (hasImage === hasText) return bad('ต้องส่งรูป (image) หรือข้อความ (text) อย่างใดอย่างหนึ่งเท่านั้น');

  if (hasText) {
    if (typeof body.text !== 'string') return bad('ข้อความต้องเป็นตัวอักษร');
    const text = body.text.trim();
    if (text.length < TEXT_MIN || text.length > TEXT_MAX) return bad(`ข้อความต้องยาว ${TEXT_MIN}–${TEXT_MAX} ตัวอักษร`);
    return { ok: true, kind: 'text', text };
  }

  if (typeof body.image !== 'string') return bad('รูปต้องเป็น base64');
  const b64 = body.image.replace(/^data:[^,]*;base64,/i, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return bad('ข้อมูลรูปไม่ใช่ base64 ที่ถูกต้อง');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length > MAX_IMAGE_BYTES) return bad('รูปใหญ่เกิน 8 MB');
  const type = detectMime(buf);
  if (!type) return bad('รองรับเฉพาะไฟล์รูป JPEG, PNG, WEBP');
  return { ok: true, kind: 'image', buf, mime: type.mime, ext: type.ext, bytes: buf.length, base64: b64 };
}

// ---------- 2) จำกัดการใช้ (นับเฉพาะคำขอที่ผ่านการตรวจ input) ----------
// hits = { [userId]: [timestampMs, ...] } เก็บใน flow context (หายเมื่อ restart) ; วัน = 24 ชม.ย้อนหลัง
function rateLimit(hits, userId, now) {
  const DAY = 24 * 60 * 60 * 1000;
  for (const k of Object.keys(hits)) {
    hits[k] = hits[k].filter((t) => now - t < DAY);
    if (!hits[k].length) delete hits[k];
  }
  const mine = hits[userId] || [];
  if (mine.filter((t) => now - t < 60 * 1000).length >= RATE_PER_MINUTE) {
    return { ok: false, ...err(429, 'RATE_LIMIT', 'สแกนบ่อยเกินไป ลองใหม่ในอีกสักครู่นะคะ') };
  }
  if (mine.length >= RATE_PER_DAY) {
    return { ok: false, ...err(429, 'RATE_LIMIT', 'วันนี้สแกนครบจำนวนที่กำหนดแล้ว ลองใหม่พรุ่งนี้นะคะ') };
  }
  mine.push(now);
  hits[userId] = mine;
  return { ok: true };
}

// ---------- 3) บันทึกรูป / ลบรูป ----------
// คืน path แบบ relative กับ /data เช่น uploads/12/1730000000000.jpg (เก็บใน prescriptions.image_path)
function saveUpload(userId, buf, ext) {
  const dir = path.join(UPLOAD_DIR, String(userId));
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return `uploads/${userId}/${name}`;
}

function resolveUpload(rel) {
  const abs = path.resolve(path.join(__dirname, '..', rel));
  return abs.startsWith(UPLOAD_DIR + path.sep) ? abs : null;   // กัน path traversal
}

function deleteUploadFile(rel) {
  const abs = rel && resolveUpload(rel);
  if (!abs) return false;
  try { fs.unlinkSync(abs); return true; } catch (e) { return false; }
}

// TODO วันที่ 5: เรียกจาก POST /api/prescriptions/:id/confirm และ /discard ทันทีที่เปลี่ยนสถานะ
// (เก็บรูปเท่าที่จำเป็น — ดูหัวข้อ "ความเป็นส่วนตัวของข้อมูล" ใน README)
async function deleteUploadForPrescription(db, userId, prescriptionId) {
  const rows = await db.query('SELECT image_path FROM prescriptions WHERE id = ? AND user_id = ?', [prescriptionId, userId]);
  if (!rows.length || !rows[0].image_path) return false;
  deleteUploadFile(rows[0].image_path);
  await db.query('UPDATE prescriptions SET image_path = NULL WHERE id = ? AND user_id = ?', [prescriptionId, userId]);
  return true;
}

// cron 03:00 (tab 6): ลบรูปที่เก่ากว่า `days` วัน + ตั้ง image_path = NULL ; ไฟล์กำพร้า (ไม่มีแถวใน DB) ลบตามอายุไฟล์
async function cleanupOldUploads(db, days) {
  const old = await db.query(
    'SELECT id, image_path FROM prescriptions WHERE image_path IS NOT NULL AND created_at < NOW() - INTERVAL ? DAY', [days]);
  let files = 0;
  for (const r of old) if (deleteUploadFile(r.image_path)) files++;
  if (old.length) await db.query('UPDATE prescriptions SET image_path = NULL WHERE id IN (?)', [old.map((r) => r.id)]);

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let orphans = 0;
  if (fs.existsSync(UPLOAD_DIR)) {
    for (const u of fs.readdirSync(UPLOAD_DIR)) {
      const dir = path.join(UPLOAD_DIR, u);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).mtimeMs < cutoff) { fs.unlinkSync(p); orphans++; }
      }
    }
  }
  return { rows: old.length, files, orphans };
}

// ---------- 4) request ของ Gemini ----------
// สร้างสำเนา JSON Schema สำหรับ generationConfig.responseJsonSchema (ต้นฉบับยังให้ Ajv ตรวจซ้ำ)
//  - inline $ref/$defs, ตัด $schema/$id
//  - ตัด maxItems: Gemini ตอบ 400 INVALID_ARGUMENT (ไม่ระบุ field) เมื่อ schema มี maxItems — หาจากการแบ่งครึ่งด้วย gemini-3.5-flash-lite
//    (enum/minimum/maximum/minLength/maxLength/additionalProperties/type ["x","null"] ใช้ได้ปกติ) ; Ajv ฝั่งเรายังบังคับ maxItems อยู่
const DROP_KEYS = new Set(['$schema', '$id', '$defs', 'maxItems']);
function toGeminiSchema(schema) {
  const defs = schema.$defs || {};
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    if (node.$ref) return walk(defs[node.$ref.replace('#/$defs/', '')]);
    return Object.fromEntries(Object.entries(node).filter(([k]) => !DROP_KEYS.has(k)).map(([k, v]) => [k, walk(v)]));
  };
  return walk(schema);
}

// input = ผลจาก checkInput ; prompts = global 'prompts'
// ไม่ตั้ง temperature (ใช้ค่าเริ่มต้นตามคำแนะนำของ Gemini 3) ; maxOutputTokens 4096 กันคำตอบยาวไม่หยุด (finishReason MAX_TOKENS → 422 AI_NO_RESULT ไม่ retry)
// thinkingLevel ต่ำ: งานนี้คือการถอดข้อความ + จัดเข้า schema ไม่ต้องคิดลึก — วัดกับ gemini-3.5-flash-lite
// ข้อความยา PRN (ทุก 4-6 ชั่วโมง) ใช้เวลา 32 วินาทีเมื่อ thinking ค่าเริ่มต้น เหลือ 10 วินาทีเมื่อ minimal (ผลถูกต้องเท่ากัน)
// ระดับ thinking ขึ้นกับรุ่น: Lite = minimal ; รุ่นอื่น (gemini-3.8-flash ฯลฯ) = low
// เพราะ gemini-3.8-flash ตอบ 400 "Thinking level MINIMAL is not supported for this model"
const thinkingLevelFor = (model) => (/lite/i.test(model || '') ? 'minimal' : 'low');

// body เดิมแต่ปรับ thinkingLevel ให้ตรงรุ่นใหม่ (ใช้ตอน fallback ไปรุ่นอื่น) — ไม่ clone รูป base64
const bodyForModel = (body, model) => ({
  ...body,
  generationConfig: { ...body.generationConfig, thinkingConfig: { thinkingLevel: thinkingLevelFor(model) } }
});

function buildGeminiBody(input, prompts, model) {
  const parts = input.kind === 'image'
    ? [{ inlineData: { mimeType: input.mime, data: input.base64 } }, { text: prompts.medicineUserImage }]
    : [{ text: prompts.medicineUserText.replace('{{USER_TEXT}}', () => input.text) }];
  return {
    systemInstruction: { parts: [{ text: prompts.medicineSystem }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      responseMimeType: 'application/json',
      responseJsonSchema: prompts.medicineGeminiSchema,
      thinkingConfig: { thinkingLevel: thinkingLevelFor(model) }
    }
  };
}

// GEMINI_BASE_URL ใช้เฉพาะทดสอบกับ Gemini ปลอม (scripts/fake-gemini.js) ; ว่าง = ของจริง
const geminiUrl = (model) => `${process.env.GEMINI_BASE_URL || GEMINI_BASE}${encodeURIComponent(model)}:generateContent`;

// ---------- 5) ตัดสินใจหลังเรียก Gemini ----------
// เวลารวมของ /api/scan ไม่เกิน TOTAL_BUDGET_MS (นับ retry/fallback ทุกครั้ง): ครั้งแรก timeout FIRST_TIMEOUT_MS,
// ครั้งถัดไปใช้เวลาที่เหลือ (หลังหน่วง) ; เหลือไม่ถึง MIN_RETRY_MS ไม่ลองใหม่
// ai = { model, fallbackModel, retried, noRetry } ; งบ retry = 1 ครั้งต่อคำขอ (สลับรุ่นก็นับในงบนี้)
//   429 / 5xx (เช่น 503) / timeout / เครือข่าย → สลับไปรุ่นสำรองทันที (คนละรุ่นกัน จึงไม่ซ้ำรุ่นเดิม) ไม่หน่วง
//   ไม่มีรุ่นสำรองที่ต่างรุ่น: 5xx/timeout → รุ่นเดิมเว้น 2 วินาที ; 429 → ล้มเหลว (ห้ามซ้ำรุ่นเดิม) ; 4xx อื่น → ล้มเหลว
//   noRetry (env GEMINI_NO_RETRY=true เฉพาะทดสอบเพื่อคุมจำนวน request) → ไม่ลองใหม่เลย
//   คืน { action: 'ok' } | { action: 'retry', model, delayMs, timeoutMs } | { action: 'fail', reason }
function nextStep(ai, statusCode, errored, msLeft) {
  if (!errored && statusCode >= 200 && statusCode < 300) return { action: 'ok' };
  if (ai.retried || ai.noRetry) return { action: 'fail', reason: errored ? 'error' : String(statusCode) };
  const hasOther = !!ai.fallbackModel && ai.fallbackModel !== ai.model;
  let step;
  if (!errored && statusCode === 429) {
    if (!hasOther) return { action: 'fail', reason: '429' };
    step = { action: 'retry', model: ai.fallbackModel, delayMs: 0 };
  } else if (errored || statusCode >= 500) {
    step = hasOther
      ? { action: 'retry', model: ai.fallbackModel, delayMs: 0 }
      : { action: 'retry', model: ai.model, delayMs: RETRY_DELAY_MS };
  } else {
    return { action: 'fail', reason: String(statusCode) };
  }
  const left = (msLeft === undefined ? TOTAL_BUDGET_MS : msLeft) - step.delayMs;
  if (left < MIN_RETRY_MS) return { action: 'fail', reason: 'no_time' };
  return { ...step, timeoutMs: left };
}

// ---------- 6) ดึงข้อความ JSON จากคำตอบ ----------
function extractText(resp) {
  const noResult = (why) => ({ ok: false, ...err(422, 'AI_NO_RESULT', 'AI ไม่สามารถอ่านรูป/ข้อความนี้ได้ ลองถ่ายใหม่หรือกรอกเอง'), why });
  if (!resp || typeof resp !== 'object') return noResult('empty');
  if (resp.promptFeedback && resp.promptFeedback.blockReason) return noResult('blocked:' + resp.promptFeedback.blockReason);
  const cand = Array.isArray(resp.candidates) ? resp.candidates[0] : null;
  if (!cand) return noResult('no_candidate');
  if (cand.finishReason === 'MAX_TOKENS') return noResult('max_tokens');   // JSON ถูกตัด ใช้ไม่ได้ ไม่ retry
  const text = ((cand.content && cand.content.parts) || []).map((p) => p.text || '').join('');
  if (!text.trim()) return noResult('finish:' + (cand.finishReason || 'none'));
  return { ok: true, text, finishReason: cand.finishReason };
}

// ---------- 7) prescriptions ----------
async function savePrescription(db, userId, p) {
  const r = await db.query(
    'INSERT INTO prescriptions (user_id, input_type, image_path, ocr_text, llm_json, llm_model, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, p.inputType, p.imagePath, p.result.ocr_text, JSON.stringify(p.result), p.model, 'draft']);
  return r.insertId;
}

// GET /api/prescriptions/:id — เจ้าของเท่านั้น (ไม่ใช่เจ้าของ = 404)
async function getPrescription(db, userId, id, reviewFlags) {
  if (!/^\d+$/.test(String(id))) return err(404, 'NOT_FOUND', 'ไม่พบข้อมูลที่ต้องการ');
  const rows = await db.query('SELECT id, ocr_text, llm_json FROM prescriptions WHERE id = ? AND user_id = ?', [Number(id), userId]);
  if (!rows.length || !rows[0].llm_json) return err(404, 'NOT_FOUND', 'ไม่พบข้อมูลที่ต้องการ');
  const result = typeof rows[0].llm_json === 'string' ? JSON.parse(rows[0].llm_json) : rows[0].llm_json;
  return { status: 200, body: { prescription_id: rows[0].id, ocr_text: rows[0].ocr_text || result.ocr_text || '', result, review_flags: reviewFlags(result) } };
}

module.exports = {
  checkInput, rateLimit, saveUpload, deleteUploadFile, deleteUploadForPrescription, cleanupOldUploads,
  toGeminiSchema, buildGeminiBody, bodyForModel, thinkingLevelFor, geminiUrl, nextStep, TOTAL_BUDGET_MS, FIRST_TIMEOUT_MS, extractText, savePrescription, getPrescription,
  UPLOAD_DIR, RATE_PER_MINUTE, RATE_PER_DAY
};
