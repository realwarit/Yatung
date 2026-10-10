import { hasMultipleTimes, slotTimeLabel } from './slot-time';

describe('slotTimeLabel (หัวมื้อที่มีหลายเวลา)', () => {
  it('เวลาเดียว แสดงเหมือนเดิม', () => {
    expect(slotTimeLabel(['2026-10-09 18:00:00', '2026-10-09 18:00:00'])).toBe('18:00');
    expect(hasMultipleTimes(['2026-10-09 18:00:00', '2026-10-09 18:00:00'])).toBe(false);
  });
  it('หลายเวลา แสดงช่วง เรียงจากเช้าไปเย็น', () => {
    expect(slotTimeLabel(['2026-10-09 18:00:00', '2026-10-09 16:30:00'])).toBe('16:30–18:00');
    expect(hasMultipleTimes(['2026-10-09 18:00:00', '2026-10-09 16:30:00'])).toBe(true);
  });
  it('รับรูปแบบ HH:mm ได้', () => expect(slotTimeLabel(['08:00', '08:30', '08:15'])).toBe('08:00–08:30'));
});
