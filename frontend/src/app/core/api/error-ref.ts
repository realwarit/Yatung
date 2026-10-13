import { HttpErrorResponse } from '@angular/common/http';
import { isInterstitialError } from '../network/html-response';

/**
 * รหัสอ้างอิงสั้นๆ ของ error (ให้ผู้ใช้/ผู้ทดสอบจดแจ้งได้) — ไม่มีข้อมูลส่วนตัว
 *  E-NET = ติดต่อเซิร์ฟเวอร์ไม่ได้ (status 0) · E-HTML = ได้หน้า HTML แทน API (หน้าเตือน ngrok) · E-304/E-401/E-404/E-500/E-502… = status จริง · E-JS = ข้อผิดพลาดในแอปเอง (ไม่ใช่ HTTP)
 */
export function errorRef(err: unknown): string {
  if (isInterstitialError(err)) return 'E-HTML';
  if (err instanceof HttpErrorResponse) return err.status === 0 ? 'E-NET' : `E-${err.status}`;
  return 'E-JS';
}

/** รหัสที่ควรโชว์ต่อท้ายข้อความ: error ที่ไม่คาดคิด (ไม่มีข้อความจาก API / เครือข่าย / 304 / 401 / 5xx) ; ข้อความตรวจสอบข้อมูลปกติของ API ไม่ต้องมี */
export function showsRef(err: unknown, hasDetails: boolean): boolean {
  if (!(err instanceof HttpErrorResponse) || isInterstitialError(err)) return true;
  return !hasDetails || err.status === 0 || err.status === 304 || err.status === 401 || err.status >= 500;
}

const REF_AT_END = /^([\s\S]*?)\s*\((E-[A-Z0-9]{2,5})\)\s*$/;
/** แยก "ข้อความ (E-304)" → { text, ref } */
export function splitRef(s: string): { text: string; ref: string | null } {
  const m = REF_AT_END.exec(s ?? '');
  return m ? { text: m[1], ref: m[2] } : { text: s ?? '', ref: null };
}

/** path ของ endpoint สำหรับบันทึก: ตัด query/fragment, เลขล้วน → :n, segment ยาวคล้าย token → :x */
export function endpointOf(url: string): string {
  const path = String(url ?? '').split('#')[0].split('?')[0].replace(/^https?:\/\/[^/]+/i, '');
  return path.split('/').map((s) => (/^\d+$/.test(s) ? ':n' : s.length > 24 && /^[\w-]+$/.test(s) ? ':x' : s)).join('/').slice(0, 80);
}
