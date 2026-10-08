import { MedicationInput } from '../../../core/api/models';
import { DoseUnit, MealRelation, Slot } from '../../../core/api/medicine-parse.model';
import { MEAL_LABEL, SLOT_LABEL, SLOT_ORDER, doseText, thaiJoin, unitInDose } from '../../../core/i18n/labels';

export type MedField = 'name' | 'strength' | 'dose' | 'unit' | 'meal' | 'slots' | 'indication' | 'warnings' | 'total';

/** ค่าในฟอร์มยา (ใช้ร่วมกันระหว่างหน้าเพิ่ม/แก้ไขยาและหน้า Review) — dose/meal ว่างได้เมื่อ AI อ่านไม่ได้ */
export interface MedDraft {
  name: string;
  strength: string;
  dose: number | null;
  unit: DoseUnit;
  meal: MealRelation;
  asNeeded: boolean;
  slots: Slot[];
  indication: string;
  /** หนึ่งข้อต่อหนึ่งบรรทัด */
  warnings: string;
  total: number | null;
}

export const EMPTY_DRAFT: MedDraft = {
  name: '', strength: '', dose: 1, unit: 'tablet', meal: 'after', asNeeded: false,
  slots: ['morning'], indication: '', warnings: '', total: null,
};

// backend ตอบ error เป็นข้อความเดียว ไม่ระบุฟิลด์ → จับจากคำขึ้นต้นเพื่อแสดงใต้ช่องที่ผิด
// ถ้าแก้ข้อความใน validate-medication.js ต้องแก้ตารางนี้ด้วย (ตัดคำนำหน้า "รายการที่ N: " ออกก่อนเทียบ)
const FIELD_BY_MESSAGE: [RegExp, MedField][] = [
  [/^ชื่อยา/, 'name'], [/^ความแรง/, 'strength'], [/^ปริมาณ/, 'dose'], [/^หน่วย/, 'unit'], [/^เวลากิน/, 'meal'],
  [/^(มื้อที่กิน|ยาที่กินเมื่อ|ต้องเลือกมื้อ)/, 'slots'], [/^ข้อบ่งใช้/, 'indication'], [/^คำเตือน/, 'warnings'],
  [/^จำนวนยา/, 'total'],
];

export function fieldFromMessage(msg: string): MedField | null {
  const body = msg.replace(/^รายการที่ \d+: /, '');
  return FIELD_BY_MESSAGE.find(([re]) => re.test(body))?.[1] ?? null;
}

/** ข้อความตรวจก่อนบันทึก เช่น "ทุกวัน เช้า และ เย็น ครั้งละ 1 เม็ด หลังอาหาร" */
export function previewText(d: MedDraft): string {
  const when = d.asNeeded ? 'เมื่อมีอาการ'
    : d.slots.length ? `ทุกวัน ${thaiJoin(SLOT_ORDER.filter((s) => d.slots.includes(s)).map((s) => SLOT_LABEL[s]))}`
    : 'ทุกวัน (ยังไม่ได้เลือกมื้อ)';
  const dose = d.dose === null ? 'ไม่ระบุจำนวน' : `ครั้งละ ${doseText(d.dose)} ${unitInDose(d.unit)}`;
  const meal = MEAL_LABEL[d.meal];
  return `${when} ${dose}${meal ? ' ' + meal : ''}`;
}

/** body ของ POST/PUT /api/medications (เรียกเมื่อ dose/meal ถูกเลือกครบแล้วเท่านั้น) */
export function toMedicationInput(d: MedDraft): MedicationInput {
  return {
    name: d.name.trim(),
    strength: d.strength.trim() || null,
    dose_per_time: d.dose ?? 0,
    unit: d.unit,
    meal_relation: d.meal === 'unknown' ? 'any' : d.meal,
    as_needed: d.asNeeded,
    slots: d.asNeeded ? [] : SLOT_ORDER.filter((s) => d.slots.includes(s)),
    indication: d.indication.trim() || null,
    warnings: d.warnings.split('\n').map((w) => w.trim()).filter(Boolean),
    total_qty: d.total,
  };
}
