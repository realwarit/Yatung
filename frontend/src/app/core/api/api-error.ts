import { HttpErrorResponse } from '@angular/common/http';
import { ApiError } from '../auth/auth.models';

/** รหัส error ของ API เช่น 'ALREADY_TAKEN', 'UNDO_EXPIRED', 'VALIDATION' (ไม่ใช่ error จาก API = null) */
export function errorCode(err: unknown): string | null {
  if (err instanceof HttpErrorResponse) {
    const b = err.error as Partial<ApiError> | null;
    if (b && typeof b.error === 'string') return b.error;
  }
  return null;
}

/** ข้อความไทยสำหรับแสดงผู้ใช้ */
export function errorText(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
    const b = err.error as Partial<ApiError> | null;
    if (b && typeof b.details === 'string') return b.details;
  }
  return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
}
