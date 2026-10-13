import { HttpErrorResponse } from '@angular/common/http';
import { ApiError } from '../auth/auth.models';
import { isInterstitialError } from '../network/html-response';
import { errorRef, showsRef } from './error-ref';

/** รหัส error ของ API เช่น 'ALREADY_TAKEN', 'UNDO_EXPIRED', 'VALIDATION' (ไม่ใช่ error จาก API = null) */
export function errorCode(err: unknown): string | null {
  if (err instanceof HttpErrorResponse) {
    const b = err.error as Partial<ApiError> | null;
    if (b && typeof b.error === 'string') return b.error;
  }
  return null;
}

/** ข้อความไทยสำหรับแสดงผู้ใช้ ; error ที่ไม่คาดคิดต่อท้ายด้วยรหัสอ้างอิง "(E-304)" (ดู error-ref.ts) */
export function errorText(err: unknown): string {
  const ref = errorRef(err);
  const withRef = (msg: string, hasDetails: boolean) => (showsRef(err, hasDetails) ? `${msg} (${ref})` : msg);
  if (isInterstitialError(err)) return withRef('การเชื่อมต่อหมดอายุ กรุณาแตะแถบสีเหลืองด้านบนเพื่อเชื่อมต่อใหม่', false);
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return withRef('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่', false);
    const b = err.error as Partial<ApiError> | null;
    if (b && typeof b.details === 'string') return withRef(b.details, true);
  }
  return withRef('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง', false);
}
