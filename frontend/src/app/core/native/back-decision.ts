/**
 * ปุ่ม back ของ Android — ลำดับตามแผน (ฟังก์ชันล้วน เทสครบทุกกรณี) :
 *  1) กล่องยืนยัน inline ที่อยู่ใน sheet/dialog → ปิดกล่องนั้น
 *  2) sheet / dialog ที่เปิดอยู่ → ปิด
 *  3) กล่องยืนยัน inline ของหน้า → ปิด
 *  4) หน้าย่อย (/settings/*, ฟอร์มยา, Review, Scan) → ย้อนตามประวัติ (ผ่าน canDeactivate เดิม) ; ไม่มีประวัติในแอป = ไปแท็บแม่
 *  5) แท็บหลักที่ไม่ใช่ /today → /today (แทนที่ประวัติ ห้ามถอยข้ามแท็บ)
 *  6) /today, /login, /register → ออกจากแอป
 */
export type BackAction = 'ignore' | 'close-inline' | 'close-overlay' | 'history-back' | 'go-parent' | 'go-today' | 'exit';

export interface BackState {
  inline: 'page' | 'overlay' | null;
  overlayOpen: boolean;
  path: string;
  /** กำลังเปลี่ยนหน้าอยู่ (กดซ้ำเร็วๆ ต้องไม่ถอยซ้อน) */
  navigating: boolean;
  /** เคยเปลี่ยนหน้าในแอปนี้อย่างน้อย 1 ครั้ง (มีที่ให้ย้อน) */
  hasHistory: boolean;
}

export const MAIN_TABS: readonly string[] = ['/today', '/medications', '/overview', '/settings'];
const EXIT_PATHS: readonly string[] = ['/', '/today', '/login', '/register'];

export function normalizePath(url: string): string {
  const p = url.split('#')[0].split('?')[0].replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

/** แท็บแม่ของหน้าย่อย (ใช้เมื่อไม่มีประวัติให้ย้อน) */
export function parentOf(path: string): string {
  const p = normalizePath(path);
  if (p.startsWith('/settings/')) return '/settings';
  if (p.startsWith('/medications/')) return '/medications';
  return '/today';
}

export function decideBack(s: BackState): BackAction {
  if (s.overlayOpen) return s.inline === 'overlay' ? 'close-inline' : 'close-overlay';
  if (s.inline) return 'close-inline';
  if (s.navigating) return 'ignore';
  const p = normalizePath(s.path);
  if (EXIT_PATHS.includes(p)) return 'exit';
  if (MAIN_TABS.includes(p)) return 'go-today';
  return s.hasHistory ? 'history-back' : 'go-parent';
}

/** กดซ้ำเร็วกว่านี้ (มิลลิวินาที) นับเป็นการกดครั้งเดียว */
export const BACK_DEBOUNCE_MS = 350;

export function shouldHandleBack(now: number, lastHandledAt: number): boolean {
  return now - lastHandledAt >= BACK_DEBOUNCE_MS;
}
