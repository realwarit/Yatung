import { EMPTY_DRAFT, MedDraft } from '../../shared/components/med-fields/med-draft';
import { foldedGroups } from './review-fold';
import { ReviewCard, newCard, todoOf } from './review.model';

const draft = (o: Partial<MedDraft> = {}): MedDraft => ({ ...EMPTY_DRAFT, name: 'Metformin', strength: '500 mg', dose: 1, meal: 'after', slots: ['morning', 'evening'], ...o });
const card = (o: Partial<ReviewCard> = {}, d: Partial<MedDraft> = {}): ReviewCard => newCard(1, 0, { draft: draft(d), ...o });
const sorted = (s: ReadonlySet<string>) => [...s].sort();

describe('foldedGroups (Q4: พับเฉพาะช่องที่ไม่ติด flag และไม่ว่าง)', () => {
  it('ไม่มี flag ไม่ว่าง → พับทุกกลุ่ม (ชื่อยาและความแรงไม่อยู่ในกลุ่ม จึงกางเสมอ)', () => {
    expect(sorted(foldedGroups(card()))).toEqual(['dose', 'meal', 'more', 'schedule']);
  });
  it('flag ที่มื้อ → กลุ่ม schedule กางเสมอ ส่วนที่เหลือพับ', () => {
    expect(sorted(foldedGroups(card({ reasons: { slots: 'ไม่ชัด' } })))).toEqual(['dose', 'meal', 'more']);
  });
  it('flag ที่ก่อน/หลังอาหาร → กลุ่ม meal กางเสมอ', () => {
    expect(foldedGroups(card({ reasons: { meal: 'x' } })).has('meal')).toBe(false);
    expect(foldedGroups(card({ reasons: { meal: 'x' } })).has('dose')).toBe(true);
  });
  it('flag ที่ขนาดยา/หน่วย → กลุ่ม dose กางเสมอ', () => {
    expect(foldedGroups(card({ reasons: { dose: 'x' } })).has('dose')).toBe(false);
    expect(foldedGroups(card({ reasons: { unit: 'x' } })).has('dose')).toBe(false);
  });
  it('ช่องว่าง (meal = unknown, dose = null, ไม่มีมื้อ) กางเสมอแม้ไม่มี flag', () => {
    expect(foldedGroups(card({}, { meal: 'unknown' })).has('meal')).toBe(false);
    expect(foldedGroups(card({}, { dose: null })).has('dose')).toBe(false);
    expect(foldedGroups(card({}, { slots: [] })).has('schedule')).toBe(false);
    expect(foldedGroups(card({}, { slots: [], asNeeded: true })).has('schedule')).toBe(true);   // ยาเมื่อมีอาการไม่ต้องมีมื้อ
  });
  it('ทุกกลุ่มติด flag/ว่าง → ไม่พับอะไรเลย (ไม่มีบรรทัดสรุป)', () => {
    expect(foldedGroups(card({ reasons: { slots: 'a', meal: 'b', dose: 'c' } })).size).toBe(0);
  });
  it('ยาที่ผู้ใช้เพิ่มเอง และยาที่เลือกเติมจำนวนเดิม ไม่พับ', () => {
    expect(foldedGroups(card({ index: null })).size).toBe(0);
    expect(foldedGroups(card({ mode: 'refill' })).size).toBe(0);
  });
  it('การพับไม่เปลี่ยนกฎต้องตรวจ: todoOf ของการ์ดเดียวกันได้ผลเหมือนเดิม', () => {
    const c = card({ reasons: { meal: 'ไม่ชัดเจน' } });
    expect(todoOf(c).map((t) => t.field)).toEqual(['meal']);
    expect(foldedGroups(c).has('meal')).toBe(false);   // ช่องที่ต้องตรวจมองเห็นอยู่เสมอ
  });
});
