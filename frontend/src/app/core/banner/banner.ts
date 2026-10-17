import { InstallMode } from '../pwa/install';

/**
 * แถบข้อความบรรทัดเดียวด้านบน (yt-banner): แสดงได้ครั้งละ 1 แถบเท่านั้น เรียงลำดับความสำคัญ
 * เชื่อมต่อหมดอายุ > ออฟไลน์ > เวอร์ชันใหม่ > ชวนติดตั้ง > แจ้งขนาดตัวอักษร   (ฟังก์ชันล้วน — เทสทุกชุดค่าผสม)
 */
export type BannerKind = 'expired' | 'offline' | 'update' | 'install' | 'font';
export type BannerTone = 'info' | 'warning' | 'success' | 'offline';

export const BANNER_ORDER: readonly BannerKind[] = ['expired', 'offline', 'update', 'install', 'font'];

export interface BannerInputs {
  expired: boolean;
  offline: boolean;
  offlineText: string;
  update: 'none' | 'ready' | 'broken' | 'failed';
  install: InstallMode | null;
  font: boolean;
}

export interface Banner {
  kind: BannerKind;
  tone: BannerTone;
  icon: 'alert' | 'cloud-off' | 'info' | 'download' | 'phone';
  text: string;
  /** ปุ่มท้ายแถบ (ไม่มี = ทั้งแถบไม่ใช่ปุ่ม) */
  action: string | null;
  dismissible: boolean;
}

export const UPDATE_READY_TEXT = 'มีเวอร์ชันใหม่ แตะเพื่ออัปเดต';
export const UPDATE_FAILED_TEXT = 'โหลดเวอร์ชันใหม่ไม่สำเร็จ จะลองใหม่อัตโนมัตินะคะ';
export const UPDATE_BROKEN_TEXT = 'แอปต้องโหลดใหม่เพื่อให้ใช้งานต่อได้';
export const FONT_HINT_TEXT = 'ปรับขนาดตัวอักษรให้ใหญ่ขึ้นได้ที่ ตั้งค่า';

export function pickBanner(i: BannerInputs): Banner | null {
  for (const k of BANNER_ORDER) {
    switch (k) {
      case 'expired':
        if (i.expired) return { kind: k, tone: 'warning', icon: 'alert', text: 'การเชื่อมต่อหมดอายุ · แตะเพื่อเชื่อมต่อใหม่', action: 'เชื่อมต่อ', dismissible: false };
        break;
      case 'offline':
        if (i.offline) return { kind: k, tone: 'offline', icon: 'cloud-off', text: i.offlineText, action: null, dismissible: false };
        break;
      case 'update':
        if (i.update === 'ready') return { kind: k, tone: 'info', icon: 'download', text: UPDATE_READY_TEXT, action: 'อัปเดต', dismissible: true };
        if (i.update === 'failed') return { kind: k, tone: 'info', icon: 'info', text: UPDATE_FAILED_TEXT, action: null, dismissible: true };
        if (i.update === 'broken') return { kind: k, tone: 'warning', icon: 'alert', text: UPDATE_BROKEN_TEXT, action: 'โหลดใหม่', dismissible: false };
        break;
      case 'install':
        if (i.install === 'native') return { kind: k, tone: 'info', icon: 'phone', text: 'ติดตั้งยาตรงไว้บนหน้าจอ', action: 'ติดตั้ง', dismissible: true };
        if (i.install === 'ios-guide') return { kind: k, tone: 'info', icon: 'phone', text: 'เพิ่มยาตรงลงหน้าจอโฮมเพื่อรับแจ้งเตือน', action: 'ดูวิธี', dismissible: true };
        break;
      case 'font':
        if (i.font) return { kind: k, tone: 'info', icon: 'info', text: FONT_HINT_TEXT, action: 'ตั้งค่า', dismissible: true };
        break;
    }
  }
  return null;
}
