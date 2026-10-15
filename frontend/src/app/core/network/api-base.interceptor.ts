import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/** แอป Android: ต่อ URL ฐานของเซิร์ฟเวอร์หน้า `/api/...` (เว็บ/PWA : base ว่าง = ไม่เปลี่ยนอะไร) */
export const withApiBase = (url: string, base: string): string => (base && url.startsWith('/api/') ? base + url : url);

/**
 * ต้องเป็น interceptor "ตัวสุดท้าย" ของสาย : ตัวอื่น (ngrok / html-guard / auth / error-log) เช็ก `req.url.startsWith('/api/')`
 * จึงต้องเห็น URL แบบ relative ก่อน — ตัวนี้ค่อยเติมโดเมนทีหลังสุดก่อนส่งออกจริง
 */
export const makeApiBaseInterceptor = (base: string): HttpInterceptorFn => (req, next) => {
  const url = withApiBase(req.url, base);
  return url === req.url ? next(req) : next(req.clone({ url }));
};

export const apiBaseInterceptor = makeApiBaseInterceptor(environment.apiBase);
