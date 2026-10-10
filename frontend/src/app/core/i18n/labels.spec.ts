import { sourceLabel } from './labels';

describe('sourceLabel (ช่องทางที่ยืนยันว่ากินแล้ว)', () => {
  it('ญาติยืนยัน = "ญาติยืนยันแล้ว"', () => expect(sourceLabel('caregiver')).toBe('ญาติยืนยันแล้ว'));
  it('push = "จากการแจ้งเตือนบนเครื่อง"', () => expect(sourceLabel('push')).toBe('จากการแจ้งเตือนบนเครื่อง'));
  it('LINE มีป้าย ส่วนกดในแอปเองไม่แสดงอะไร', () => {
    expect(sourceLabel('line')).toBe('ยืนยันทาง LINE');
    expect(sourceLabel('app')).toBeNull();
  });
  it('ไม่มีค่า / ค่าที่ไม่รู้จัก = ไม่แสดง', () => {
    expect(sourceLabel(null)).toBeNull();
    expect(sourceLabel(undefined)).toBeNull();
    expect(sourceLabel('x')).toBeNull();
  });
});
