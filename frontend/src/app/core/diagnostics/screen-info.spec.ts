import { ScreenMetrics, screenLines, screenText, shortUa } from './screen-info';

const S23 = 'Mozilla/5.0 (Linux; Android 14; SM-S711B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const base: ScreenMetrics = { innerWidth: 384, visualViewportWidth: 384, devicePixelRatio: 2.8125, rootFontPx: 20, fontScale: 125, primaryButtonPx: 22.5, userAgent: S23 };

describe('ข้อมูลจอ (ผู้พัฒนา)', () => {
  it('userAgent แบบย่อ', () => {
    expect(shortUa(S23)).toBe('Android 14 · SM-S711B · Chrome 130');
    expect(shortUa(IOS)).toBe('iPhone iOS 18.1 · Safari 18');
    expect(shortUa('')).toBe('ไม่ทราบ');
  });
  it('แถวข้อมูลครบทุกค่าที่ต้องรายงาน', () => {
    const t = screenText(base);
    expect(t).toContain('innerWidth): 384px');
    expect(t).toContain('visualViewport): 384px');
    expect(t).toContain('devicePixelRatio): 2.813');
    expect(t).toContain('(root): 20px');
    expect(t).toContain('ก++ (125%)');
    expect(t).toContain('ตัวอักษรของปุ่มหลัก: 22.5px');
    expect(t).toContain('Android 14 · SM-S711B · Chrome 130');
  });
  it('ไม่มี visualViewport / ไม่มีปุ่มหลัก = บอกเป็นข้อความ ไม่ใช่ NaN', () => {
    const l = screenLines({ ...base, visualViewportWidth: null, primaryButtonPx: null }).map((x) => x.value);
    expect(l).toContain('ไม่รองรับ');
    expect(l).toContain('ไม่มีปุ่มหลักในหน้านี้');
    expect(l.join(' ')).not.toContain('NaN');
  });
});
