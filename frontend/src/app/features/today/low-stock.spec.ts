import { lowStockText } from './low-stock';

describe('lowStockText (ป้ายยาใกล้หมด)', () => {
  it('ยาประจำ แสดงจำนวนวันที่พอใช้', () => expect(lowStockText({ as_needed: false, days_left: 3, remaining_qty: 6 })).toBe('ยาใกล้หมด · พอใช้ 3 วัน'));
  it('พอใช้ 0 วัน', () => expect(lowStockText({ as_needed: false, days_left: 0, remaining_qty: 1 })).toBe('ยาใกล้หมด · พอใช้ไม่ถึงวัน'));
  it('ยาเมื่อมีอาการ แสดงจำนวนที่เหลือ', () => expect(lowStockText({ as_needed: true, days_left: null, remaining_qty: 4 })).toBe('ยาใกล้หมด · เหลือ 4'));
});
