import { ExistingMatch, ParsedMedication, ReviewFlag } from '../../core/api/medicine-parse.model';
import { ConfirmItem } from '../../core/api/prescription.api';
import { UNIT_LABEL, doseText } from '../../core/i18n/labels';
import { EMPTY_DRAFT, MedDraft, MedField, toMedicationInput } from '../../shared/components/med-fields/med-draft';
import { MedFlag } from '../../shared/components/med-fields/med-fields.component';

/**
 * กฎของหน้า Review (ฟังก์ชันล้วน ไม่แตะ DOM — ทดสอบแยกได้):
 *  - ช่องที่ review_flags ชี้ = "ต้องตรวจ" จนกว่าผู้ใช้จะแก้ค่า (ต่างจากที่ AI อ่านได้) หรือกด "ถูกต้องแล้ว"
 *  - ช่องที่ค่าว่าง (meal = unknown, dose = null, ไม่มีมื้อ, ไม่มีชื่อ) กด "ถูกต้องแล้ว" ไม่ได้ ต้องเลือกค่าก่อน
 *  - ยาที่เลือก "เติมจำนวน" ไม่ต้องตรวจช่องอื่น (ตรวจแค่จำนวนที่เติม)
 *  - ถ้าผู้ใช้แก้ค่ากลับไปเท่าที่ AI อ่านได้ ช่องจะกลับมาต้องตรวจอีก (ยังไม่ได้ยืนยัน)
 */
export interface ReviewCard {
  uid: number;
  /** ลำดับใน result.medications ; null = ผู้ใช้เพิ่มเอง */
  index: number | null;
  draft: MedDraft;
  /** ค่าที่ AI อ่านได้ (ใช้ตัดสินว่าผู้ใช้แก้แล้วหรือยัง) */
  initial: MedDraft;
  sourceText: string;
  /** เหตุผลจาก review_flags แปลงเป็นช่องของฟอร์มแล้ว */
  reasons: Partial<Record<MedField, string>>;
  acked: MedField[];
  match: ExistingMatch | null;
  mode: 'create' | 'refill';
  refillQty: number | null;
  moreOpen: boolean;
}

export interface TodoItem { field: MedField | 'qty'; text: string; kind: 'flag' | 'missing'; }

/** field ใน review_flags (ชื่อตาม schema/confidence) → ช่องในฟอร์ม */
export const FLAG_TO_FIELD: Record<string, MedField> = {
  name: 'name', dose: 'dose', dose_per_time: 'dose', slots: 'slots', meal_relation: 'meal',
};

export function draftFromParsed(m: ParsedMedication): MedDraft {
  return {
    name: m.name, strength: m.strength ?? '', dose: m.dose_per_time, unit: m.unit, meal: m.meal_relation,
    asNeeded: m.as_needed, slots: [...m.slots], indication: m.indication ?? '', warnings: m.warnings.join('\n'),
    total: m.total_qty,
  };
}

/** เหตุผลของ flag ของยาลำดับที่ index แยกตามช่อง (เหตุผลแรกชนะ เพราะ backend เรียงกฎ business ก่อนความมั่นใจ) */
export function reasonsFor(flags: ReviewFlag[], index: number): Partial<Record<MedField, string>> {
  const out: Partial<Record<MedField, string>> = {};
  for (const f of flags) {
    const field = FLAG_TO_FIELD[f.field];
    if (f.index === index && field && !out[field]) out[field] = f.reason;
  }
  return out;
}

export function newCard(uid: number, index: number | null, init: Partial<ReviewCard> & { draft: MedDraft }): ReviewCard {
  return {
    uid, index, initial: init.draft, sourceText: '', reasons: {}, acked: [], match: null,
    mode: 'create', refillQty: null, moreOpen: false, ...init,
  };
}

export const blankCard = (uid: number): ReviewCard =>
  newCard(uid, null, { draft: { ...EMPTY_DRAFT, slots: [...EMPTY_DRAFT.slots] } });

/** ช่องนี้ยังไม่มีค่าที่ใช้ได้ (ต้องเลือกเอง กดผ่านไม่ได้) */
export function missingText(f: MedField, d: MedDraft): string | null {
  switch (f) {
    case 'name': return d.name.trim() ? null : 'ยังไม่ได้ใส่ชื่อยา';
    case 'dose': return d.dose === null ? 'ยังไม่ได้เลือกจำนวนต่อครั้ง' : null;
    case 'slots': return !d.asNeeded && d.slots.length === 0 ? 'ยังไม่ได้เลือกมื้อที่กิน' : null;
    case 'meal': return d.meal === 'unknown' ? 'ยังไม่ได้เลือกก่อน/หลังอาหาร' : null;
    default: return null;
  }
}

const REQUIRED: MedField[] = ['name', 'slots', 'meal', 'dose'];

function changed(f: MedField, c: ReviewCard): boolean {
  const a = c.draft, b = c.initial;
  switch (f) {
    case 'name': return a.name !== b.name;
    case 'dose': return a.dose !== b.dose;
    case 'meal': return a.meal !== b.meal;
    case 'slots': return JSON.stringify([a.slots, a.asNeeded]) !== JSON.stringify([b.slots, b.asNeeded]);
    default: return false;
  }
}

export const refillQtyOk = (c: ReviewCard): boolean => c.refillQty !== null && c.refillQty > 0 && c.refillQty <= 99999.99;

/** สิ่งที่ยังต้องทำของการ์ดใบนี้ (ว่าง = พร้อมบันทึก) */
export function todoOf(c: ReviewCard): TodoItem[] {
  if (c.mode === 'refill') return refillQtyOk(c) ? [] : [{ field: 'qty', text: 'ใส่จำนวนที่จะเติม', kind: 'missing' }];
  const out: TodoItem[] = [];
  for (const f of REQUIRED) {
    const miss = missingText(f, c.draft);
    const reason = c.reasons[f];
    if (miss) out.push({ field: f, text: reason ? `${miss} (${reason})` : miss, kind: reason ? 'flag' : 'missing' });
    else if (reason && !c.acked.includes(f) && !changed(f, c)) out.push({ field: f, text: reason, kind: 'flag' });
  }
  // ช่องอื่นที่ถูก flag (ไม่มีในรายการบังคับ) — เผื่อ backend เพิ่มกฎใหม่
  for (const f of Object.keys(c.reasons) as MedField[]) {
    if (!REQUIRED.includes(f) && !c.acked.includes(f) && !changed(f, c)) out.push({ field: f, text: c.reasons[f]!, kind: 'flag' });
  }
  return out;
}

/** flags ที่ส่งให้ app-med-fields (พื้นเหลือง) = todo ของการ์ด สร้างจาก todoOf เพื่อให้ตรงกับตัวนับเสมอ */
export function flagsForUi(c: ReviewCard): Partial<Record<MedField, MedFlag>> {
  const out: Partial<Record<MedField, MedFlag>> = {};
  for (const t of todoOf(c)) {
    if (t.field === 'qty') continue;
    out[t.field] = { reason: t.text, canAck: t.kind === 'flag' && !missingText(t.field, c.draft) };
  }
  return out;
}

/** ประโยคสรุปท้ายการ์ด */
export function summaryOf(c: ReviewCard, previewText: string): string {
  if (c.mode === 'refill' && c.match) {
    const unit = UNIT_LABEL[c.draft.unit];
    const add = c.refillQty ?? 0;
    const left = (c.match.remaining_qty ?? 0) + add;
    return `เติม ${doseText(add)} ${unit} ให้ ${c.match.name}${c.match.strength ? ' ' + c.match.strength : ''} (จะเหลือ ${doseText(left)} ${unit})`;
  }
  return previewText;
}

/** body ของ POST /confirm จากการ์ดที่ตรวจครบแล้ว */
export function toConfirmItems(cards: ReviewCard[]): ConfirmItem[] {
  return cards.map((c): ConfirmItem =>
    c.mode === 'refill' && c.match
      ? { action: 'refill', medication_id: c.match.medication_id, qty: c.refillQty ?? 0 }
      : { action: 'create', medication: toMedicationInput(c.draft) });
}

/** id ของ element ในการ์ด (ตรงกับ app-med-fields) ไว้ "ไปจุดถัดไป" */
export const domIdOf = (uid: number, f: MedField | 'qty'): string =>
  f === 'qty' ? `c${uid}-qty` : `c${uid}-${f === 'indication' ? 'ind' : f === 'warnings' ? 'warn' : f}`;
