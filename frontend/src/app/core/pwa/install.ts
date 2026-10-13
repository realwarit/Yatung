/**
 * เมื่อไรควรชวนติดตั้งแอปลงหน้าจอ — ฟังก์ชันล้วน (ไม่แตะ window) ทดสอบได้
 *  native    = Android/Chrome ที่เบราว์เซอร์ยิง beforeinstallprompt แล้ว → ปุ่มติดตั้งเรียก prompt() ได้
 *  ios-guide = iPhone/iPad Safari ที่ยังไม่ได้เพิ่ม → การ์ดสอน "แชร์ → เพิ่มไปยังหน้าจอโฮม" (iOS ไม่มี prompt ; ต้องเพิ่มก่อนถึงจะรับแจ้งเตือนได้)
 *  null      = ไม่แสดง (ติดตั้งแล้ว/เปิดใน Capacitor/เพิ่งกดปิด/เบราว์เซอร์ที่ทำอะไรไม่ได้)
 */
export type InstallMode = 'native' | 'ios-guide' | null;

export const DISMISS_DAYS = 14;
export const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000;

export interface InstallCtx {
  ua: string;
  /** เปิดอยู่ในโหมดแอป (display-mode: standalone หรือ navigator.standalone ของ iOS) */
  standalone: boolean;
  /** รันใน Capacitor (แอป Android) */
  capacitor: boolean;
  /** เบราว์เซอร์ส่ง beforeinstallprompt มาแล้วและยังไม่ถูกใช้ */
  hasPrompt: boolean;
  /** เวลาที่ผู้ใช้กดปิดการ์ดล่าสุด (epoch ms) */
  dismissedAt: number | null;
  now: number;
  /** iPadOS ขอเว็บแบบเดสก์ท็อป (UA เป็น Macintosh) แยกจาก Mac จริงด้วยจอสัมผัส */
  maxTouchPoints?: number;
  /** หน้าตั้งค่าแสดงเสมอแม้เคยกดปิด (ผู้ใช้ไปหาเอง) */
  ignoreDismiss?: boolean;
}

export function isIos(ua: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}

/** Safari จริง — เบราว์เซอร์ในแอปอื่น (LINE, Facebook, Instagram) ไม่มี "เพิ่มไปยังหน้าจอโฮม" ส่วน Chrome/Firefox/Edge บน iOS ขั้นตอนต่างจากข้อความของเรา */
export function isIosSafari(ua: string, maxTouchPoints = 0): boolean {
  return isIos(ua, maxTouchPoints) && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|Line\/|FBAN|FBAV|Instagram|MicroMessenger/i.test(ua);
}

export function isDismissed(dismissedAt: number | null, now: number): boolean {
  return dismissedAt !== null && now >= dismissedAt && now - dismissedAt < DISMISS_MS;
}

export function installMode(c: InstallCtx): InstallMode {
  if (c.standalone || c.capacitor) return null;
  if (!c.ignoreDismiss && isDismissed(c.dismissedAt, c.now)) return null;
  if (c.hasPrompt) return 'native';
  if (isIosSafari(c.ua, c.maxTouchPoints)) return 'ios-guide';
  return null;
}
