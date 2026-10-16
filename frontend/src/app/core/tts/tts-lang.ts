/** รหัสภาษาไทยที่ engine ต่างยี่ห้อคืนมา : th, th-TH, th_TH, tha, tha-THA, tha_THA (ไม่สนตัวพิมพ์) */
export function isThaiTag(tag: unknown): boolean {
  if (typeof tag !== 'string') return false;
  const head = tag.trim().toLowerCase().split(/[-_]/)[0];
  return head === 'th' || head === 'tha';
}

/** รูปแบบที่ Java `Locale.forLanguageTag` อ่านได้ (ขีดกลาง) ; `th_TH` → `th-TH` */
export function toLanguageTag(tag: string): string {
  return tag.trim().replace(/_/g, '-');
}

/** หารหัสภาษาไทยตัวแรกในรายการภาษา (string[]) หรือรายการเสียง ({lang}[]) — ไม่เจอ = null */
export function findThaiTag(items: unknown): string | null {
  if (!Array.isArray(items)) return null;
  for (const it of items) {
    const tag = typeof it === 'string' ? it : (it as { lang?: unknown } | null)?.lang;
    if (isThaiTag(tag)) return toLanguageTag(tag as string);
  }
  return null;
}

/** ผลตรวจเสียงไทยของ engine native — เก็บเฉพาะค่า true/false/ตัวเลข (ห้ามมีข้อความที่อ่าน) */
export interface TtsDiag {
  engineLoaded: boolean;
  languageCount: number | null;
  voiceCount: number | null;
  hasThai: boolean;
  /** ตรวจเจอจากวิธีไหน */
  via: 'isLanguageSupported' | 'languages' | 'voices' | null;
  /** ข้อความ error แรกที่ปลั๊กอิน/ระบบตอบ (ตัด 80 ตัวอักษร ; เป็นรหัส/ข้อความของระบบ ไม่ใช่ข้อความที่อ่าน) */
  error: string | null;
}
