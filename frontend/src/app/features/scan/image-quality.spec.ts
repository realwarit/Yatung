import {
  BRIGHT_LUMINANCE, DARK_LUMINANCE, MIN_LONG_SIDE, QUALITY_MESSAGES, evaluateQuality, meanLuminance,
} from './image-quality';

/** ภาพสังเคราะห์: พิกเซล RGBA สีเดียวทั้งภาพ */
function solid(gray: number, w = 64, h = 48): Uint8ClampedArray {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < a.length; i += 4) { a[i] = a[i + 1] = a[i + 2] = gray; a[i + 3] = 255; }
  return a;
}

describe('image-quality', () => {
  it('ภาพมืด → เตือน dark', () => {
    expect(evaluateQuality(1600, solid(20))).toEqual(['dark']);
  });

  it('ภาพปกติ → ไม่เตือน', () => {
    expect(evaluateQuality(1600, solid(150))).toEqual([]);
  });

  it('ภาพจ้า → เตือน bright', () => {
    expect(evaluateQuality(1600, solid(250))).toEqual(['bright']);
    expect(QUALITY_MESSAGES.bright).toBe('รูปสว่างจ้าเกินไป อาจมีแสงสะท้อน ลองเปลี่ยนมุมถ่ายนะคะ');
  });

  it('ภาพเล็ก → เตือน small แม้สว่างปกติ', () => {
    expect(evaluateQuality(MIN_LONG_SIDE - 1, solid(150))).toEqual(['small']);
    expect(evaluateQuality(MIN_LONG_SIDE, solid(150))).toEqual([]);
  });

  it('เล็กและมืด → เตือนทั้งสองข้อ', () => {
    expect(evaluateQuality(500, solid(10))).toEqual(['dark', 'small']);
  });

  it('ค่าที่ขอบเกณฑ์ไม่ถูกเตือน', () => {
    expect(evaluateQuality(1600, solid(DARK_LUMINANCE))).toEqual([]);
    expect(evaluateQuality(1600, solid(BRIGHT_LUMINANCE))).toEqual([]);
  });

  it('meanLuminance: ขาว 255, ดำ 0, ว่าง 0', () => {
    expect(meanLuminance(solid(255))).toBeCloseTo(255, 3);
    expect(meanLuminance(solid(0))).toBe(0);
    expect(meanLuminance(new Uint8ClampedArray(0))).toBe(0);
  });
});
