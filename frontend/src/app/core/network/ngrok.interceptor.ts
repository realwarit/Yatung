import { HttpInterceptorFn } from '@angular/common/http';
import { NGROK_SKIP_HEADER } from './html-response';

/**
 * ใส่ `ngrok-skip-browser-warning` ให้ทุก request ไป /api — ngrok ฟรีจะแทรกหน้าเตือน HTML แทน JSON
 * ให้คำขอที่ไม่มีคุกกี้ (เช่น แอปบนหน้าจอโฮมของ iPhone ที่คุกกี้หมดอายุ) ; นอก ngrok header นี้ไม่มีผลอะไร
 */
export const ngrokInterceptor: HttpInterceptorFn = (req, next) =>
  req.url.startsWith('/api/') && !req.headers.has(NGROK_SKIP_HEADER)
    ? next(req.clone({ setHeaders: { [NGROK_SKIP_HEADER]: '1' } }))
    : next(req);
