/**
 * ตัวไล่ขั้น "ป้ายปุ่มบรรทัดเดียวต้องพอดี" — ฟังก์ชันล้วน (ทดสอบได้โดยไม่ต้องมี DOM) ; ตัวต่อ DOM อยู่ที่ fit-label.directive.ts
 *
 * ขั้น 0 ป้ายเต็ม + ไอคอน · ขั้น 1 ป้ายสั้น + ไอคอน · ขั้น 2 ป้ายสั้น ไม่มีไอคอน · ขั้น 3 เหมือนขั้น 2 + ลด font-size ทีละ 1px ไม่ต่ำกว่า 16px
 * ไม่มีป้ายสั้น = ข้ามขั้น 1 และขั้น 2/3 ใช้ป้ายเต็ม (ยังซ่อนไอคอนและลดขนาดได้)
 */
export type FitStep = 0 | 1 | 2 | 3;
export interface FitState { step: FitStep; /** font-size ที่บังคับ (px) ; null = ใช้ค่าเดิม */ px: number | null }

export const FIT_MIN_PX = 16;

export interface FitInput {
  hasShort: boolean;
  /** font-size ปัจจุบันของปุ่มที่ขั้น 0 (px) */
  basePx: number;
  minPx?: number;
  /** วัดจริง : สถานะนี้แล้วป้ายอยู่บรรทัดเดียวและไม่ล้นหรือไม่ */
  fits: (s: FitState) => boolean;
}

/** ลำดับสถานะที่จะลอง (ยังไม่ตัดสิน) */
export function fitCandidates(hasShort: boolean, basePx: number, minPx = FIT_MIN_PX): FitState[] {
  const out: FitState[] = [{ step: 0, px: null }];
  if (hasShort) out.push({ step: 1, px: null });
  out.push({ step: 2, px: null });
  for (let px = Math.ceil(basePx) - 1; px >= minPx; px--) out.push({ step: 3, px });   // ลดทีละ 1px จากค่าปัจจุบัน
  return out;
}

/** คืนสถานะแรกที่พอดี ; ไม่มีสถานะไหนพอดี = สถานะสุดท้าย (เล็กสุด) */
export function solveFit(i: FitInput): FitState {
  const list = fitCandidates(i.hasShort, i.basePx, i.minPx);
  for (const s of list) if (i.fits(s)) return s;
  return list[list.length - 1];
}
