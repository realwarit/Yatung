import { loadImage } from './image-compress';

// ค่าที่ปรับได้ — ความสว่างเฉลี่ยของรูปอยู่ในช่วง 0–255
export const DARK_LUMINANCE = 70;     // ต่ำกว่านี้ = มืดเกินไป
export const BRIGHT_LUMINANCE = 235;  // สูงกว่านี้ = สว่างจ้า/แสงสะท้อน
export const MIN_LONG_SIDE = 800;     // ด้านยาวของรูปต้นฉบับ (px) ต่ำกว่านี้ตัวหนังสืออาจอ่านไม่ออก

const SAMPLE_SIDE = 64;               // ย่อรูปเหลือด้านยาว 64px ก่อนเฉลี่ย (เร็วและพอสำหรับค่าเฉลี่ย)

export const QUALITY_MESSAGES = {
  dark: 'รูปค่อนข้างมืด ลองถ่ายในที่สว่างขึ้นนะคะ',
  bright: 'รูปสว่างจ้าเกินไป อาจมีแสงสะท้อน ลองเปลี่ยนมุมถ่ายนะคะ',
  small: 'รูปเล็กไป ตัวหนังสืออาจอ่านไม่ออก',
} as const;

export type QualityIssue = keyof typeof QUALITY_MESSAGES;

/** ความสว่างเฉลี่ย (Rec.601) ของพิกเซล RGBA แบนๆ ; ว่าง = 0 */
export function meanLuminance(rgba: ArrayLike<number>): number {
  const n = Math.floor(rgba.length / 4);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n * 4; i += 4) sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return sum / n;
}

/** ฟังก์ชันล้วน: ตัดสินจากด้านยาวต้นฉบับและพิกเซลตัวอย่าง (แยกไว้เพื่อทดสอบโดยไม่ต้องมี canvas) */
export function evaluateQuality(longSide: number, rgba: ArrayLike<number>): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const lum = meanLuminance(rgba);
  if (lum < DARK_LUMINANCE) issues.push('dark');
  else if (lum > BRIGHT_LUMINANCE) issues.push('bright');
  if (longSide < MIN_LONG_SIDE) issues.push('small');
  return issues;
}

/** ตรวจรูปต้นฉบับ (ก่อนบีบ) คืนข้อความเตือนภาษาไทย — แค่คำเตือน ไม่บล็อกการส่ง; ตรวจไม่ได้ = ไม่เตือน */
export async function assessImageQuality(src: string | Blob): Promise<string[]> {
  try {
    const img = await loadImage(src);
    const longSide = Math.max(img.naturalWidth, img.naturalHeight);
    const k = Math.min(1, SAMPLE_SIDE / longSide);
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    ctx.fillStyle = '#fff';   // PNG โปร่งใสต้องนับเป็นพื้นขาว ไม่ใช่ดำ
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return evaluateQuality(longSide, ctx.getImageData(0, 0, w, h).data).map((i) => QUALITY_MESSAGES[i]);
  } catch {
    return [];
  }
}
