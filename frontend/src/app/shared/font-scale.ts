/** ขนาดตัวอักษร ก / ก+ / ก++ — ฟังก์ชันล้วน (index.html มีสคริปต์ที่ทำงานเหมือนกัน; spec ตรวจว่าให้ผลตรงกัน) */
export type FontScale = 100 | 112 | 125;
export const FONT_SCALES: readonly FontScale[] = [100, 112, 125];

/** ตัวคูณ root 16px: ก = 16px, ก+ = 18px, ก++ = 20px */
export const SCALE_FACTOR: Record<FontScale, number> = { 100: 1, 112: 1.125, 125: 1.25 };

export const FONT_KEY = 'yatung_font_scale_v2';
/** key ก่อน 8D (root 18px: 100 = 18px, 112 = 20.2px, 125 = 22.5px) — ไม่ลบ แค่อ่านเพื่อย้ายค่า */
export const LEGACY_FONT_KEY = 'yatung_font_scale';

/** ค่าเดิม → ขนาดใหม่ที่ px ใกล้เคียงสุด: 18→ก+ (18) · 20.2→ก++ (20) · 22.5→ก++ (20, เล็กลง 11% ที่ยอมรับแล้ว) */
export const LEGACY_MAP: Record<number, FontScale> = { 100: 112, 112: 125, 125: 125 };

const valid = (v: unknown): v is FontScale => (FONT_SCALES as readonly unknown[]).includes(v);

export interface ScaleResolution {
  scale: FontScale;
  /** ผู้ใช้เคยเลือกเอง (มี key ใดก็ได้) — ใช้ตัดสินว่าจะแจ้งให้ปรับขนาดหรือไม่ */
  chosen: boolean;
  /** ต้องเขียน key ใหม่ (พบแต่ key เดิม) */
  migrated: boolean;
}

export function resolveScale(v2Raw: string | null, legacyRaw: string | null): ScaleResolution {
  const v2 = v2Raw === null ? NaN : Number(v2Raw);
  if (valid(v2)) return { scale: v2, chosen: true, migrated: false };
  const old = legacyRaw === null ? NaN : Number(legacyRaw);
  if (valid(old)) return { scale: LEGACY_MAP[old], chosen: true, migrated: true };
  return { scale: 100, chosen: false, migrated: false };
}
