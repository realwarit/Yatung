import { DoseUnit, MealRelation, Slot } from '../api/medicine-parse.model';

export const SLOT_ORDER: readonly Slot[] = ['morning', 'noon', 'evening', 'bedtime'];

export const SLOT_LABEL: Record<Slot, string> = {
  morning: 'เช้า', noon: 'กลางวัน', evening: 'เย็น', bedtime: 'ก่อนนอน',
};

export const MEAL_LABEL: Record<MealRelation, string> = {
  before: 'ก่อนอาหาร', after: 'หลังอาหาร', with: 'พร้อมอาหาร', any: 'ไม่เกี่ยวกับอาหาร', unknown: '',
};

/** ชื่อหน่วยในรายการเลือก */
export const UNIT_LABEL: Record<DoseUnit, string> = {
  tablet: 'เม็ด', capsule: 'แคปซูล', ml: 'มล.', teaspoon: 'ช้อนชา', tablespoon: 'ช้อนโต๊ะ',
  sachet: 'ซอง', drop: 'หยด', puff: 'พ่น', other: 'อื่นๆ',
};
export const UNITS = Object.keys(UNIT_LABEL) as DoseUnit[];

/** 0.5 → '½', 1.5 → '1½', 2 → '2' */
export function doseText(n: number): string {
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 100) / 100;
  if (frac === 0) return String(whole);
  const f = frac === 0.5 ? '½' : frac === 0.25 ? '¼' : frac === 0.75 ? '¾' : String(frac).slice(1);
  return whole === 0 ? f : `${whole}${f}`;
}

/** ข้อความหน่วยประกอบปริมาณ ("1 เม็ด"); other = "หน่วย" */
export function unitInDose(u: DoseUnit): string {
  return u === 'other' ? 'หน่วย' : UNIT_LABEL[u];
}

/** ['เช้า','เย็น'] → 'เช้า และ เย็น'; 3 ตัวขึ้นไป → 'เช้า กลางวัน และ เย็น' */
export function thaiJoin(items: string[], tight = false): string {
  if (items.length <= 1) return items.join('');
  const sep = tight ? 'และ' : ' และ ';   // tight = ใช้ในประโยค เช่น "รอบเช้าและกลางวัน"
  return `${items.slice(0, -1).join(' ')}${sep}${items[items.length - 1]}`;
}
