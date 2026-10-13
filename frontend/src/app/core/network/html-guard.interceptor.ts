import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, tap, throwError } from 'rxjs';
import { OnlineService } from '../offline/online.service';
import { ConnectionService } from './connection.service';
import { isHtmlSuccess, isInterstitialError } from './html-response';

/** API ตอบ HTML ทั้งที่สถานะ 2xx (หน้าเตือน ngrok) → แจ้ง ConnectionService เพื่อโชว์แถบ "เชื่อมต่อใหม่" ; ไม่แก้ response/error */
export const htmlGuardInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);
  const conn = inject(ConnectionService);
  const online = inject(OnlineService);
  return next(req).pipe(
    tap((ev) => {
      if (ev instanceof HttpResponse) {
        if (isHtmlSuccess(ev.status, ev.headers)) conn.markApiHtml(); else conn.markApiOk();
        online.markOk();
      }
    }),
    catchError((err: unknown) => {
      if (isInterstitialError(err)) conn.markApiHtml();
      if (err instanceof HttpErrorResponse && err.status === 0) online.markFailed();   // เชื่อมต่อเซิร์ฟเวอร์ไม่ได้
      else if (err instanceof HttpErrorResponse) online.markOk();                   // เซิร์ฟเวอร์ตอบ (แม้เป็น 4xx/5xx) = ยังออนไลน์
      return throwError(() => err as HttpErrorResponse);
    }),
  );
};
