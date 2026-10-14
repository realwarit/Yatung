/**
 * "ข้อมูลจอ" สำหรับผู้พัฒนา (8D-FIX 4-5) — ฟังก์ชันล้วน ; แสดงบนจอเท่านั้น ห้ามส่งเข้าเซิร์ฟเวอร์/log
 * ใช้ดูว่าเครื่องจริง (Samsung Galaxy S23 FE, iPhone) รายงานความกว้างจอ/ซูม/ขนาดตัวอักษรเท่าไร เมื่อภาพจำลองกับเครื่องจริงไม่ตรงกัน
 */
export interface ScreenMetrics {
  innerWidth: number;
  visualViewportWidth: number | null;
  devicePixelRatio: number;
  /** root font-size จาก getComputedStyle(html) เป็น px */
  rootFontPx: number;
  /** ขนาด ก ที่เลือก */
  fontScale: 100 | 112 | 125;
  /** font-size จริงของปุ่มหลักในหน้านี้ (px) ; null = หน้านี้ไม่มีปุ่มหลัก */
  primaryButtonPx: number | null;
  userAgent: string;
}

export const SCALE_NAME: Record<ScreenMetrics['fontScale'], string> = { 100: 'ก', 112: 'ก+', 125: 'ก++' };

/** userAgent แบบย่อ : "Android 14 · SM-S711B · Chrome 130" / "iPhone iOS 18.1 · Safari 18" (ไม่มีข้อมูลระบุตัวบุคคล) */
export function shortUa(ua: string): string {
  const parts: string[] = [];
  const and = /Android (\d+(?:\.\d+)?)(?:; ([^)]+?))?(?: Build|\))/.exec(ua);
  const ios = /(iPhone|iPad); CPU (?:iPhone )?OS (\d+)[_.](\d+)/.exec(ua);
  if (and) { parts.push(`Android ${and[1]}`); if (and[2] && and[2] !== 'K') parts.push(and[2]); }
  else if (ios) parts.push(`${ios[1]} iOS ${ios[2]}.${ios[3]}`);
  else if (/Windows/.test(ua)) parts.push('Windows');
  else if (/Mac OS X/.test(ua)) parts.push('macOS');
  else if (/Linux/.test(ua)) parts.push('Linux');
  const br = /(EdgA?|Edg)\/(\d+)/.exec(ua) ?? /(SamsungBrowser)\/(\d+)/.exec(ua) ?? /(Firefox|FxiOS)\/(\d+)/.exec(ua) ?? /(Chrome|CriOS)\/(\d+)/.exec(ua);
  if (br) parts.push(`${br[1] === 'CriOS' ? 'Chrome' : br[1] === 'FxiOS' ? 'Firefox' : br[1].startsWith('Edg') ? 'Edge' : br[1] === 'SamsungBrowser' ? 'Samsung Internet' : br[1]} ${br[2]}`);
  else { const sf = /Version\/(\d+).*Safari/.exec(ua); if (sf) parts.push(`Safari ${sf[1]}`); }
  return parts.join(' · ') || 'ไม่ทราบ';
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

/** แถวข้อมูล (ป้ายไทย + ค่า) — เรียงตามที่แสดงและตามที่คัดลอก */
export function screenLines(m: ScreenMetrics): { label: string; value: string }[] {
  return [
    { label: 'ความกว้างหน้าจอ (innerWidth)', value: px(m.innerWidth) },
    { label: 'ความกว้างที่มองเห็นจริง (visualViewport)', value: m.visualViewportWidth === null ? 'ไม่รองรับ' : px(m.visualViewportWidth) },
    { label: 'ความหนาแน่นพิกเซล (devicePixelRatio)', value: String(Math.round(m.devicePixelRatio * 1000) / 1000) },
    { label: 'ขนาดตัวอักษรหลักของหน้า (root)', value: px(m.rootFontPx) },
    { label: 'ขนาดตัวอักษรที่เลือก', value: `${SCALE_NAME[m.fontScale]} (${m.fontScale}%)` },
    { label: 'ตัวอักษรของปุ่มหลัก', value: m.primaryButtonPx === null ? 'ไม่มีปุ่มหลักในหน้านี้' : px(m.primaryButtonPx) },
    { label: 'เครื่อง/เบราว์เซอร์', value: shortUa(m.userAgent) },
  ];
}

/** ข้อความสำหรับคัดลอก (ทีละบรรทัด "ป้าย: ค่า") */
export function screenText(m: ScreenMetrics): string {
  return screenLines(m).map((l) => `${l.label}: ${l.value}`).join('\n');
}
