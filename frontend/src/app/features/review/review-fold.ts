import { MedGroup } from '../../shared/components/med-fields/med-fields.component';
import { ReviewCard, missingText } from './review.model';

/**
 * กลุ่มช่องที่ "พับ" เป็นบรรทัดสรุป (Q4 ของ 8D) — ตัดสินครั้งเดียวตอนสร้างการ์ด จากค่าที่ AI อ่านได้ตอนนั้น (ไม่เปลี่ยนตามการแก้ไข จึงไม่มีช่องหุบหนีผู้ใช้ตอนกด "ถูกต้องแล้ว")
 *  - กางเสมอ (ไม่อยู่ในผลลัพธ์): ชื่อยา และความแรง (อยู่นอกกลุ่มเสมอ) · กลุ่มที่มีช่องติด flag · กลุ่มที่มีช่องว่าง/ยังไม่ได้เลือก
 *  - ไม่พับ: ยาที่ผู้ใช้เพิ่มเอง (index = null) และยาที่เลือกเติมจำนวนให้ยาเดิม (ไม่มีช่องให้พับ)
 *  - 'more' (ข้อบ่งใช้ คำเตือน จำนวนยาทั้งหมด) ไม่มี flag ได้ → พับเสมอเมื่อมีการพับ
 * กฎ "ต้องตรวจก่อนบันทึก" (todoOf) ไม่ผูกกับการพับ — ไม่ได้แตะ review.model.ts
 */
export function foldedGroups(c: ReviewCard): ReadonlySet<MedGroup> {
  const out = new Set<MedGroup>();
  if (c.mode !== 'create' || c.index === null) return out;
  const d = c.draft;
  const open = (flagged: boolean, missing: boolean) => flagged || missing;
  if (!open(!!c.reasons.slots, !!missingText('slots', d))) out.add('schedule');
  if (!open(!!c.reasons.meal, !!missingText('meal', d))) out.add('meal');
  if (!open(!!c.reasons.dose || !!c.reasons.unit, !!missingText('dose', d))) out.add('dose');
  // ไม่มีอะไรให้พับเลยนอกจาก 'more' = ไม่พับ (ไม่มีบรรทัดสรุปให้เปล่าประโยชน์)
  if (out.size === 0) return out;
  out.add('more');
  return out;
}
