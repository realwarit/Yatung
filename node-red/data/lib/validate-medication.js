// validate body ของ POST/PUT /api/medications — คืน { ok:true, value } หรือ { ok:false, details }
const UNITS = ['tablet', 'capsule', 'ml', 'teaspoon', 'tablespoon', 'sachet', 'drop', 'puff', 'other'];
const MEALS = ['before', 'after', 'with', 'any'];
const SLOTS = ['morning', 'noon', 'evening', 'bedtime'];
const MAX_QTY = 99999.99;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const has = (o, k) => o[k] !== undefined && o[k] !== null;
const round2 = (n) => Math.round(n * 100) / 100;

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

function validateMedication(body) {
  const fail = (details) => ({ ok: false, details });
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('รูปแบบข้อมูลไม่ถูกต้อง');

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 1 || name.length > 150) return fail('ชื่อยา ต้องมีความยาว 1–150 ตัวอักษร');

  let strength = null;
  if (has(body, 'strength')) {
    if (typeof body.strength !== 'string' || body.strength.length > 50) return fail('ความแรงของยา ต้องเป็นข้อความไม่เกิน 50 ตัวอักษร');
    strength = body.strength.trim() || null;
  }

  if (!isNum(body.dose_per_time) || body.dose_per_time <= 0 || body.dose_per_time > 20) {
    return fail('ปริมาณต่อครั้ง ต้องเป็นตัวเลขมากกว่า 0 และไม่เกิน 20');
  }
  if (!UNITS.includes(body.unit)) return fail('หน่วยยา ไม่ถูกต้อง (ต้องเป็น ' + UNITS.join(', ') + ')');
  if (!MEALS.includes(body.meal_relation)) return fail('เวลากินเทียบกับอาหาร ไม่ถูกต้อง (ต้องเป็น ' + MEALS.join(', ') + ')');

  const asNeeded = body.as_needed === undefined || body.as_needed === null ? false : body.as_needed;
  if (typeof asNeeded !== 'boolean') return fail('as_needed ต้องเป็น true หรือ false');

  if (!Array.isArray(body.slots)) return fail('มื้อที่กิน (slots) ต้องเป็นรายการ');
  for (const s of body.slots) {
    if (!SLOTS.includes(s)) return fail('มื้อที่กิน ไม่ถูกต้อง: "' + s + '" (ต้องเป็น ' + SLOTS.join(', ') + ')');
  }
  const slots = SLOTS.filter((s) => body.slots.includes(s)); // ตัดซ้ำ + เรียงเช้า→ก่อนนอน
  if (asNeeded && slots.length > 0) return fail('ยาที่กินเมื่อมีอาการ ต้องไม่เลือกมื้อที่กิน');
  if (!asNeeded && slots.length === 0) return fail('ต้องเลือกมื้อที่กินอย่างน้อย 1 มื้อ');

  let indication = null;
  if (has(body, 'indication')) {
    if (typeof body.indication !== 'string' || body.indication.length > 200) return fail('ข้อบ่งใช้ ต้องเป็นข้อความไม่เกิน 200 ตัวอักษร');
    indication = body.indication.trim() || null;
  }

  let warnings = [];
  if (has(body, 'warnings')) {
    if (!Array.isArray(body.warnings) || body.warnings.length > 20 ||
        body.warnings.some((w) => typeof w !== 'string' || w.length > 200)) {
      return fail('คำเตือน ต้องเป็นรายการข้อความ (ไม่เกิน 20 ข้อ ข้อละไม่เกิน 200 ตัวอักษร)');
    }
    warnings = body.warnings.map((w) => w.trim()).filter(Boolean);
  }

  const qty = (key, label) => {
    if (!has(body, key)) return { v: null };
    if (!isNum(body[key]) || body[key] < 0 || body[key] > MAX_QTY) return { err: label + ' ต้องเป็นตัวเลข 0 ถึง ' + MAX_QTY };
    return { v: round2(body[key]) };
  };
  const t = qty('total_qty', 'จำนวนยาทั้งหมด');
  if (t.err) return fail(t.err);
  const r = qty('remaining_qty', 'จำนวนยาคงเหลือ');
  if (r.err) return fail(r.err);

  let startDate = null;
  if (has(body, 'start_date')) {
    if (!validDate(body.start_date)) return fail('วันที่เริ่มกิน ต้องอยู่ในรูปแบบ YYYY-MM-DD');
    startDate = body.start_date;
  }

  return {
    ok: true,
    value: {
      name, strength, dose_per_time: round2(body.dose_per_time), unit: body.unit,
      meal_relation: body.meal_relation, as_needed: asNeeded, slots, indication, warnings,
      total_qty: t.v,
      remaining_qty: r.v,                  // null = ไม่ได้ส่งมา (POST: = total_qty, PUT: คงค่าเดิม)
      start_date: startDate                // null = ไม่ได้ส่งมา (POST: วันนี้, PUT: คงค่าเดิม)
    }
  };
}

module.exports = { validateMedication, UNITS, MEALS, SLOTS, MAX_QTY };
