import { HttpErrorResponse } from '@angular/common/http';
import { ApiError } from '../../core/auth/auth.models';

/** ข้อความไทยตาม error code ของ POST /api/scan (แสดงในกรอบคำพูดของน้องยาตรง ตอน worried) */
const FIXED: Record<string, string> = {
  AI_UNAVAILABLE: 'ระบบ AI ไม่ว่างชั่วคราว ลองใหม่อีกครั้งนะคะ',
  AI_NO_RESULT: 'น้องอ่านซองนี้ไม่ได้ ลองถ่ายให้ชัดขึ้น หรือพิมพ์เองก็ได้นะคะ',
  AI_INVALID_JSON: 'น้องอ่านผลไม่สำเร็จ ลองใหม่อีกครั้ง หรือพิมพ์เองก็ได้นะคะ',
  AI_SCHEMA_MISMATCH: 'น้องอ่านผลไม่สำเร็จ ลองใหม่อีกครั้ง หรือพิมพ์เองก็ได้นะคะ',
};

/** VALIDATION / RATE_LIMIT ใช้ข้อความจาก backend (ภาษาไทยอยู่แล้ว และต่างกันตามเหตุผล) */
const FROM_SERVER = new Set(['VALIDATION', 'RATE_LIMIT']);

/** คืนข้อความไทยถ้าเป็น error ของ pipeline สแกนที่รู้จัก ไม่ใช่ = null (ให้ผู้เรียกจัดการตาม HTTP status) */
export function scanErrorMessage(err: HttpErrorResponse): string | null {
  const body = err.error as Partial<ApiError> | null;
  const code = body && typeof body.error === 'string' ? body.error : null;
  if (!code) return null;
  if (code in FIXED) return FIXED[code];
  if (FROM_SERVER.has(code)) return typeof body?.details === 'string' ? body.details : 'ส่งข้อมูลไม่ถูกต้อง กรุณาลองใหม่';
  return null;
}
