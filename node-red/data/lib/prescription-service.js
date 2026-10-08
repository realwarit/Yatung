// logic ของ prescriptions หลังสแกน (tab 2-AI-Scan): อ่านผล / ดูรูป / confirm / discard — function node แค่เรียกฟังก์ชันที่นี่ (global: prescriptionService)
// ทุกฟังก์ชันรับ (db, userId, ...) และคืน { status, body } ; ข้อมูลที่ไม่ใช่ของ userId = 404 เสมอ
// หลักการ: AI เสนอ คนตรวจ แล้วค่อยบันทึก → ยาเข้าตารางได้ทางเดียวคือ confirm (ผู้ใช้ส่งค่าที่ตรวจแล้วมาเอง ไม่ใช่ค่าจาก llm_json)
const fs = require('fs');
const path = require('path');
const { validateMedication } = require('./validate-medication');
const medicationService = require('./medication-service');
const scanService = require('./scan-service');

const MAX_ITEMS = 20;
const err = (status, error, details, extra) => ({ status, body: { error, details, ...(extra || {}) } });
const notFound = () => err(404, 'NOT_FOUND', 'ไม่พบข้อมูลที่ต้องการ');
const toId = (v) => (/^\d+$/.test(String(v)) ? Number(v) : null);
const parseJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

// เทียบชื่อยาแบบไม่สนตัวพิมพ์เล็กใหญ่และช่องว่าง ("Metformin  500" = "metformin500")
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');

// ---------- GET /api/prescriptions/:id ----------
// reviewFlags = global 'llmOutput'.reviewFlags (คำนวณใหม่จาก llm_json ทุกครั้ง)
// existing_matches: ยาที่ผู้ใช้ใช้อยู่ (is_active=1) ชื่อตรงกับยาในผลสแกน → หน้า Review ให้เลือก "เติมจำนวน" หรือ "เพิ่มเป็นยาใหม่" (เฉพาะ draft)
async function get(db, userId, rawId, reviewFlags) {
  const id = toId(rawId);
  if (!id) return notFound();
  const rows = await db.query(
    'SELECT id, input_type, ocr_text, llm_json, status, (image_path IS NOT NULL) AS has_image ' +
    'FROM prescriptions WHERE id = ? AND user_id = ?', [id, userId]);
  if (!rows.length || !rows[0].llm_json) return notFound();
  const row = rows[0];
  const result = parseJson(row.llm_json);

  let existing = [];
  if (row.status === 'draft') {
    const active = await db.query(
      'SELECT id, name, strength, remaining_qty FROM medications WHERE user_id = ? AND is_active = 1 ORDER BY id', [userId]);
    result.medications.forEach((m, index) => {
      const hit = active.find((a) => norm(a.name) === norm(m.name));
      if (hit) existing.push({
        index, medication_id: hit.id, name: hit.name, strength: hit.strength,
        remaining_qty: hit.remaining_qty == null ? null : Number(hit.remaining_qty),
      });
    });
  }
  return {
    status: 200,
    body: {
      prescription_id: row.id, status: row.status, input_type: row.input_type, has_image: !!row.has_image,
      ocr_text: row.ocr_text || result.ocr_text || '', result, review_flags: reviewFlags(result), existing_matches: existing,
    },
  };
}

// ---------- GET /api/prescriptions/:id/image ----------
// คืน { status:200, buffer, mime } หรือ 404 (ไม่ใช่เจ้าของ / ไม่มีรูป / รูปถูกลบแล้ว) — flow ใส่ Cache-Control: private, no-store
async function image(db, userId, rawId) {
  const id = toId(rawId);
  if (!id) return notFound();
  const rows = await db.query('SELECT image_path FROM prescriptions WHERE id = ? AND user_id = ?', [id, userId]);
  if (!rows.length || !rows[0].image_path) return notFound();
  const abs = scanService.resolveUpload(rows[0].image_path);
  const mime = abs && MIME[path.extname(abs).toLowerCase()];
  if (!abs || !mime) return notFound();
  let buffer;
  try { buffer = fs.readFileSync(abs); } catch (e) { return notFound(); }   // ไฟล์หาย (เช่น cron ลบไปแล้ว)
  return { status: 200, buffer, mime };
}

// ---------- POST /api/prescriptions/:id/confirm ----------
// body.items = [ { action:'create', medication:{...} } | { action:'refill', medication_id, qty } ]
// ผิดรูปแบบ → { ok:false, status:400, body } โดย details ขึ้นต้นด้วย "รายการที่ N: " และมี item_index (0-based)
function checkItems(body) {
  const bad = (details, index) => ({
    ok: false, ...err(400, 'VALIDATION', index === undefined ? details : `รายการที่ ${index + 1}: ${details}`,
      index === undefined ? undefined : { item_index: index }),
  });
  const items = body && body.items;
  if (!Array.isArray(items) || items.length === 0) return bad('ต้องมียาอย่างน้อย 1 รายการ');
  if (items.length > MAX_ITEMS) return bad(`บันทึกได้ครั้งละไม่เกิน ${MAX_ITEMS} รายการ`);
  const out = [];
  const refilled = new Set();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || typeof it !== 'object') return bad('รูปแบบข้อมูลไม่ถูกต้อง', i);
    if (it.action === 'create') {
      const v = validateMedication(it.medication);
      if (!v.ok) return bad(v.details, i);
      out.push({ action: 'create', medication: v.value });
    } else if (it.action === 'refill') {
      const mid = toId(it.medication_id);
      if (!mid) return bad('medication_id ไม่ถูกต้อง', i);
      const q = medicationService.refillQtyError(it.qty);
      if (q) return bad(q, i);
      if (refilled.has(mid)) return bad('เติมยาตัวเดียวกันซ้ำในครั้งเดียวไม่ได้', i);
      refilled.add(mid);
      out.push({ action: 'refill', medication_id: mid, qty: it.qty });
    } else {
      return bad('action ต้องเป็น create หรือ refill', i);
    }
  }
  return { ok: true, items: out };
}

const alreadyDone = (status) => err(409, 'ALREADY_DONE', 'ผลสแกนนี้ถูกบันทึกหรือทิ้งไปแล้ว', { status });

// โยนเพื่อให้ withTransaction ROLLBACK แล้วคืนผลลัพธ์ที่เตรียมไว้
class Abort extends Error { constructor(result) { super('abort'); this.result = result; } }

async function lockDraft(conn, userId, id) {
  const [rows] = await conn.query('SELECT status FROM prescriptions WHERE id = ? AND user_id = ? FOR UPDATE', [id, userId]);
  return rows.length ? rows[0].status : null;
}

async function confirm(db, userId, rawId, body) {
  const id = toId(rawId);
  if (!id) return notFound();
  // 1) เจ้าของ + สถานะ (อ่านก่อนตรวจ body: ของคนอื่น = 404 เสมอ, ทำไปแล้ว = 409 ก่อน 400)
  const cur = await db.query('SELECT status FROM prescriptions WHERE id = ? AND user_id = ?', [id, userId]);
  if (!cur.length) return notFound();
  if (cur[0].status !== 'draft') return alreadyDone(cur[0].status);
  // 2) ตรวจทุก item ก่อนเปิด transaction
  const chk = checkItems(body);
  if (!chk.ok) return { status: chk.status, body: chk.body };

  // 3) transaction เดียว: ล้มเหลวที่ item ไหนก็ ROLLBACK ทั้งหมด (ไม่มียา/รอบกิน/สถานะค้าง)
  let out;
  try {
    out = await db.withTransaction(async (conn) => {
      const status = await lockDraft(conn, userId, id);   // กดซ้ำจากสองแท็บพร้อมกัน: คนที่สองรอคิวแล้วเห็นว่าไม่ใช่ draft
      if (status === null) throw new Abort(notFound());
      if (status !== 'draft') throw new Abort(alreadyDone(status));
      const created = [], refilled = [];
      for (let i = 0; i < chk.items.length; i++) {
        const it = chk.items[i];
        if (it.action === 'create') {
          const med = await medicationService.createInTx(conn, userId, it.medication, id);
          created.push({ medication_id: med.id, name: med.name, skipped_slots_today: med.skipped_slots_today });
        } else {
          const r = await medicationService.refillInTx(conn, userId, it.medication_id, it.qty);
          if (!r.ok) {
            const d = r.body.details;
            throw new Abort({ status: r.status, body: { ...r.body, details: `รายการที่ ${i + 1}: ${d}`, item_index: i } });
          }
          refilled.push({ medication_id: r.med.id, name: r.med.name, remaining_qty: r.med.remaining_qty });
        }
      }
      await conn.query("UPDATE prescriptions SET status = 'confirmed', confirmed_at = NOW() WHERE id = ?", [id]);
      return { status: 200, body: { created, refilled } };
    });
  } catch (e) {
    if (e instanceof Abort) return e.result;
    throw e;
  }
  // 4) หลัง COMMIT: ลบรูป (เก็บเท่าที่จำเป็น) — ลบไม่สำเร็จไม่ทำให้คำขอล้ม (cron 03:00 เก็บกวาดให้)
  await deleteImageQuietly(db, userId, id);
  return out;
}

// ---------- POST /api/prescriptions/:id/discard ----------
async function discard(db, userId, rawId) {
  const id = toId(rawId);
  if (!id) return notFound();
  const r = await db.withTransaction(async (conn) => {
    const status = await lockDraft(conn, userId, id);
    if (status === null) return notFound();
    if (status !== 'draft') return alreadyDone(status);
    await conn.query("UPDATE prescriptions SET status = 'discarded' WHERE id = ?", [id]);
    return { status: 200, body: { prescription_id: id, status: 'discarded' } };
  });
  if (r.status === 200) await deleteImageQuietly(db, userId, id);
  return r;
}

async function deleteImageQuietly(db, userId, id) {
  try { await scanService.deleteUploadForPrescription(db, userId, id); } catch (e) { /* cron ลบให้ภายหลัง */ }
}

module.exports = { get, image, confirm, discard, checkItems, MAX_ITEMS };
