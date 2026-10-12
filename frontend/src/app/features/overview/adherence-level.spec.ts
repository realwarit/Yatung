import { AdherenceDay, AdherenceMeal, AdherenceSources } from '../../core/api/stats.api';
import { barFraction, chartSummary, dayDetail, dayKind, levelOf, sourceGroups, worstMeal } from './adherence-level';

const day = (o: Partial<AdherenceDay>): AdherenceDay => ({
  date: '2026-10-12', label_th: 'จ. 12 ต.ค.', is_today: false, taken: 0, missed: 0, pending_due: 0, upcoming: 0, due: 0, rate: null, ...o,
});
const meal = (o: Partial<AdherenceMeal>): AdherenceMeal => ({ meal: 'morning', label_th: 'เช้า', due: 4, taken: 4, rate: 100, ...o });

describe('levelOf (ข้อความตามระดับ — ต้องตรงกับ backend lib/adherence-level.js)', () => {
  it('ข้อความตามสเปกทั้ง 5 ระดับ', () => {
    expect(levelOf(100).text).toBe('เยี่ยมมากค่ะ กินครบทุกมื้อเลย');
    expect(levelOf(99).text).toBe('เก่งมากค่ะ');
    expect(levelOf(80).text).toBe('เก่งมากค่ะ');
    expect(levelOf(79).text).toBe('ค่อยๆ เพิ่มขึ้นได้นะคะ');
    expect(levelOf(50).text).toBe('ค่อยๆ เพิ่มขึ้นได้นะคะ');
    expect(levelOf(49).text).toBe('ให้น้องยาตรงช่วยเตือนใน LINE นะคะ');
    expect(levelOf(0).text).toBe('ให้น้องยาตรงช่วยเตือนใน LINE นะคะ');
    expect(levelOf(null).text).toBe('ยังไม่มีข้อมูลยาในช่วงนี้ค่ะ');
  });
  it('ท่าน้องยาตรง: 80 ขึ้นไป = ฉลอง, ต่ำกว่า = โบกมือ', () => {
    expect([100, 85, 79, 20, null].map((r) => levelOf(r).mood)).toEqual(['celebrate', 'celebrate', 'wave', 'wave', 'wave']);
  });
  it('ไม่มีคำตำหนิ', () => {
    for (const r of [100, 90, 60, 10, null]) expect(levelOf(r).text).not.toMatch(/ลืม|แย่|ไม่ดี|ผิด/);
  });
});

describe('dayKind / barFraction', () => {
  it('จัดชนิดวัน', () => {
    expect([null, 100, 99, 50, 49, 0].map((r) => dayKind({ rate: r }))).toEqual(['none', 'perfect', 'ok', 'ok', 'low', 'low']);
  });
  it('0% ยังเห็นแท่งเตี้ย ๆ, null ไม่มีแท่ง, เกิน 100 ไม่ล้น', () => {
    expect(barFraction(null)).toBe(0);
    expect(barFraction(0)).toBe(0.05);
    expect(barFraction(50)).toBe(0.5);
    expect(barFraction(130)).toBe(1);
  });
});

describe('sourceGroups', () => {
  it('"แอป" = app + push, source ไม่รู้จัก (other) ไม่แสดง', () => {
    const s: AdherenceSources = { app: 3, push: 2, line: 1, caregiver: 0, other: 9 };
    expect(sourceGroups(s)).toEqual([
      { key: 'app', label: 'แอป', count: 5 }, { key: 'line', label: 'LINE', count: 1 }, { key: 'caregiver', label: 'ญาติยืนยัน', count: 0 },
    ]);
  });
});

describe('worstMeal (ข้อสังเกตมื้อ)', () => {
  it('เลือกมื้อ rate ต่ำสุดที่ < 100 และ due ≥ 2', () => {
    const w = worstMeal([meal({}), meal({ meal: 'noon', label_th: 'กลางวัน', rate: 75 }), meal({ meal: 'evening', label_th: 'เย็น', rate: 50, due: 4 })]);
    expect(w?.label_th).toBe('เย็น');
  });
  it('ไม่แสดงเมื่อทุกมื้อ 100%, due น้อยกว่า 2, หรือไม่มีข้อมูล', () => {
    expect(worstMeal([meal({}), meal({ meal: 'noon', rate: 100 })])).toBeNull();
    expect(worstMeal([meal({ rate: 0, due: 1, taken: 0 })])).toBeNull();
    expect(worstMeal([])).toBeNull();
  });
  it('rate เท่ากัน = มื้อที่เช้ากว่า', () => {
    expect(worstMeal([meal({ rate: 50 }), meal({ meal: 'bedtime', label_th: 'ก่อนนอน', rate: 50 })])?.label_th).toBe('เช้า');
  });
});

describe('ข้อความของกราฟ', () => {
  it('aria-label สรุปเป็นประโยค', () => {
    const t = chartSummary([day({ date: '2026-10-11', label_th: 'อา. 11 ต.ค.' }), day({ is_today: true, rate: 67 })]);
    expect(t).toBe('กราฟอัตราการกินยา 2 วัน: อา. 11 ต.ค. ไม่มียา, วันนี้ จ. 12 ต.ค. 67 เปอร์เซ็นต์');
  });
  it('รายละเอียดวัน: กินแล้ว · ลืม · ยังไม่กิน · ยังไม่ถึงเวลา', () => {
    expect(dayDetail(day({ taken: 3, missed: 1, pending_due: 0, upcoming: 1, due: 4, rate: 75 }))).toBe('จ. 12 ต.ค. · กินแล้ว 3 · ลืม 1 · ยังไม่กิน 0 · ยังไม่ถึงเวลา 1');
  });
});
