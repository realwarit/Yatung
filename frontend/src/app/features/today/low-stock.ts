import { Medication } from '../../core/api/models';

/** ข้อความป้ายเหลือง "ยาใกล้หมด" บนการ์ดยา (เกณฑ์ is_low มาจาก backend) */
export function lowStockText(m: Pick<Medication, 'days_left' | 'remaining_qty' | 'as_needed'>): string {
  if (m.as_needed || m.days_left === null) {
    return m.remaining_qty === null ? 'ยาใกล้หมด' : `ยาใกล้หมด · เหลือ ${m.remaining_qty}`;
  }
  return m.days_left <= 0 ? 'ยาใกล้หมด · พอใช้ไม่ถึงวัน' : `ยาใกล้หมด · พอใช้ ${m.days_left} วัน`;
}
