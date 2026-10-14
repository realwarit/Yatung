import { Medication } from '../../core/api/models';
import { lowMeds, medsSay } from './meds-say';

const med = (o: Partial<Medication>): Medication => ({
  id: 1, name: 'Amlodipine', tts_name: null, strength: '5 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'after', as_needed: false, slots: ['morning'],
  indication: null, warnings: [], total_qty: 30, remaining_qty: 20, days_left: 20, refill_alert_days: 7, is_low: false, start_date: '2026-10-01', end_date: null,
  is_active: true, created_at: '', updated_at: '', ...o,
} as Medication);

describe('medsSay: กล่องคำพูดหน้ายาของฉัน', () => {
  it('ยังไม่มียาเลย = info + ชวนสแกน', () => {
    const s = medsSay('active', []);
    expect(s).toEqual({ tone: 'info', mood: 'happy', text: 'ยังไม่มียาเลยค่ะ ลองสแกนซองยาดูนะคะ', scan: true });
  });
  it('แท็บหยุดแล้ว = neutral', () => {
    const s = medsSay('stopped', [med({ is_active: false })]);
    expect(s.tone).toBe('neutral');
    expect(s.text).toBe('ยาที่หยุดแล้ว กดกลับมาใช้ได้นะคะ');
  });
  it('พอใช้ทุกตัว = success', () => {
    const s = medsSay('active', [med({}), med({ id: 2 })]);
    expect(s).toEqual({ tone: 'success', mood: 'happy', text: 'ยาทุกตัวพอใช้ค่ะ เก่งมากเลยนะคะ', scan: false });
  });
  it('ใกล้หมด 1 ตัว = warning บอกวันที่พอใช้ (เลขกับหน่วยไม่ตัดบรรทัด)', () => {
    const s = medsSay('active', [med({ name: 'Metformin', is_low: true, days_left: 2, remaining_qty: 5 }), med({ id: 2 })]);
    expect(s.tone).toBe('warning');
    expect(s.mood).toBe('worried');
    expect(s.text).toBe('Metformin ใกล้หมดแล้วนะคะ เหลือพอใช้อีก 2 วันค่ะ');
  });
  it('ใกล้หมดหลายตัว = ชื่อตัวที่หมดก่อน + จำนวนที่เหลือ', () => {
    const s = medsSay('active', [med({ id: 1, name: 'A', is_low: true, days_left: 5 }), med({ id: 2, name: 'B', is_low: true, days_left: 1 }), med({ id: 3, name: 'C', is_low: true, days_left: 3 })]);
    expect(s.text).toBe('B กับอีก 2 ตัวใกล้หมดแล้วนะคะ');
  });
  it('ยาเมื่อมีอาการที่ใกล้หมด = บอกจำนวนที่เหลือ ; ยาหมด = หมดแล้ว', () => {
    expect(medsSay('active', [med({ name: 'Paracetamol', as_needed: true, is_low: true, days_left: null, remaining_qty: 4, slots: [] })]).text)
      .toBe('Paracetamol ใกล้หมดแล้วนะคะ เหลืออีก 4 เม็ดค่ะ');
    expect(medsSay('active', [med({ name: 'Aspirin', is_low: true, days_left: 0, remaining_qty: 0 })]).text).toBe('Aspirin หมดแล้วนะคะ');
  });
  it('ยาที่หยุดแล้วไม่นับเป็นใกล้หมด', () => {
    expect(lowMeds([med({ is_active: false, is_low: true })])).toEqual([]);
  });
  it('ไม่มียาที่ใช้อยู่แต่มีที่หยุดแล้ว = info ชวนสแกน', () => {
    const s = medsSay('active', [med({ is_active: false })]);
    expect(s.tone).toBe('info');
    expect(s.scan).toBe(true);
  });
});
