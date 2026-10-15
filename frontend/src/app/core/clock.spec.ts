import { CLOCK_STEP_MS, msToNextTick, startClock } from './clock';
import { lateMinutes, remainMinutes, thaiDateShort } from './time';

const bkk = (hms: string) => Date.parse(`2026-10-13T${hms}+07:00`);

describe('remainMinutes (อีก n นาที — ปัดขึ้นแบบเดียวทั้งแอป)', () => {
  const target = bkk('21:18:00');
  it('21:13:00 → 21:18 = อีก 5 นาที', () => expect(remainMinutes(target, bkk('21:13:00'))).toBe(5));
  it('21:13:20 ยังเป็น 5 (ไม่กระโดดเป็น 4 จนกว่าจะพ้นนาที)', () => expect(remainMinutes(target, bkk('21:13:20'))).toBe(5));
  it('21:12:59 = 6 (ยังไม่ถึง 21:13)', () => expect(remainMinutes(target, bkk('21:12:59'))).toBe(6));
  it('21:17:30 → อีก 1 นาที', () => expect(remainMinutes(target, bkk('21:17:30'))).toBe(1));
  it('21:17:59 → ยัง 1 ; 21:18:00 ถึงเวลา = 0', () => {
    expect(remainMinutes(target, bkk('21:17:59'))).toBe(1);
    expect(remainMinutes(target, bkk('21:18:00'))).toBe(0);
  });
  it('เลยเวลาแล้วไม่ติดลบ', () => expect(remainMinutes(target, bkk('21:30:00'))).toBe(0));
  it('lateMinutes: ถึงเวลา 0, ยังไม่ถึงติดลบ, เลยมา 29 นาที 59 วินาที = 29', () => {
    expect(lateMinutes(target, bkk('21:18:00'))).toBe(0);
    expect(lateMinutes(target, bkk('21:17:59'))).toBeLessThan(0);
    expect(lateMinutes(target, bkk('21:47:59'))).toBe(29);
  });
});

describe('thaiDateShort', () => {
  it('วันที่แบบย่อเวลาไทย', () => {
    expect(thaiDateShort(bkk('12:00:00'))).toBe('อ. 13 ต.ค.');
    expect(thaiDateShort(Date.parse('2026-10-13T20:30:00Z'))).toBe('พ. 14 ต.ค.');   // ข้ามเที่ยงคืนไทย
  });
});

describe('msToNextTick / startClock (นาฬิกาชิดขอบ 30 วินาที)', () => {
  it('รอจนถึงขอบถัดไป และตรงขอบพอดี = รอครบ 1 step', () => {
    expect(msToNextTick(bkk('21:13:10'), CLOCK_STEP_MS, 0)).toBe(20_000);
    expect(msToNextTick(bkk('21:13:30'), CLOCK_STEP_MS, 0)).toBe(30_000);
    expect(msToNextTick(bkk('21:13:29.9'), CLOCK_STEP_MS, 0)).toBeCloseTo(100, 0);
  });
  it('ยิงทุกขอบ :00/:30 ตามเวลาจริง ไม่เลื่อนตามเวลาที่เริ่ม และหยุดได้', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(bkk('21:13:07'));
      const seen: number[] = [];
      const stop = startClock((n) => seen.push(n));
      vi.advanceTimersByTime(23_100);           // → 21:13:30.1
      expect(seen.length).toBe(1);
      expect(new Date(seen[0] + 7 * 3600_000).getUTCSeconds()).toBe(30);
      vi.advanceTimersByTime(30_000);           // → 21:14:00.1
      expect(seen.length).toBe(2);
      expect(new Date(seen[1] + 7 * 3600_000).getUTCSeconds()).toBe(0);
      stop();
      vi.advanceTimersByTime(120_000);
      expect(seen.length).toBe(2);              // หยุดแล้วไม่ยิงอีก
    } finally { vi.useRealTimers(); }
  });
  it('แสดง "อีก 5 นาที" ที่ 21:13:00 ด้วยนาฬิกาที่เดิน ไม่ใช่เวลาตอนโหลด (โหลด 21:12:40 = 6)', () => {
    vi.useFakeTimers();
    try {
      const target = bkk('21:18:00');
      vi.setSystemTime(bkk('21:12:40'));
      let now = Date.now();                     // เวลาตอนโหลด
      expect(remainMinutes(target, now)).toBe(6);
      const stop = startClock((n) => { now = n; });
      vi.advanceTimersByTime(20_100);           // → 21:13:00.1 (ขอบ :00)
      expect(remainMinutes(target, now)).toBe(5);
      stop();
    } finally { vi.useRealTimers(); }
  });
});
