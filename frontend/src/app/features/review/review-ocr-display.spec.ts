import { ocrForDisplay } from './review.model';

describe('ocrForDisplay', () => {
  it('แทน token ปิดชื่อเป็น [ชื่อ] เฉพาะตอนแสดงผล และไม่แตะข้อความอื่น', () => {
    const tok = '[ชื่อผู้ป่วย]';
    expect(ocrForDisplay(`รพ.ตัวอย่าง [HN]\n${tok}\nMetformin 500 mg\n${tok}`)).toBe('รพ.ตัวอย่าง [HN]\n[ชื่อ]\nMetformin 500 mg\n[ชื่อ]');
    expect(ocrForDisplay(null)).toBe('');
  });
});
