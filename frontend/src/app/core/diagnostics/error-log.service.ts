import { ErrorHandler, Injectable, signal } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { errorRef } from '../api/error-ref';
import { ErrorEntry, clearErrorLog, makeEntry, readErrorLog, recordError } from './error-log';

@Injectable({ providedIn: 'root' })
export class ErrorLogService {
  readonly entries = signal<ErrorEntry[]>(readErrorLog());

  record(o: { code: string; endpoint?: string | null; status?: number | null }): void {
    let url = '/';
    try { url = location.pathname; } catch { /* ignore */ }
    this.entries.set(recordError(makeEntry({ now: Date.now(), url, ...o })));
  }
  clear(): void { clearErrorLog(); this.entries.set([]); }
  reload(): void { this.entries.set(readErrorLog()); }
}

/** บันทึกทุก request ของ /api ที่ล้มเหลว (อยู่ท้ายสุดของรายการ interceptor เพื่อเห็น error ก่อนที่ auth จะ logout) */
export const errorLogInterceptor: HttpInterceptorFn = (req, next) => {
  const log = inject(ErrorLogService);
  return next(req).pipe(catchError((err: unknown) => {
    if (req.url.startsWith('/api/') && err instanceof HttpErrorResponse) log.record({ code: errorRef(err), endpoint: req.url, status: err.status });
    return throwError(() => err);
  }));
};

/** error ในแอปเอง (ไม่ใช่ HTTP): บันทึกรหัส E-JS อย่างเดียว ไม่เก็บข้อความ/stack ; ยัง console.error ตามปกติ */
@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private readonly log = inject(ErrorLogService);
  handleError(error: unknown): void {
    console.error(error);
    if (error instanceof HttpErrorResponse) return;   // อยู่ในบันทึกจาก interceptor แล้ว
    try { this.log.record({ code: 'E-JS' }); } catch { /* อย่าให้ตัวบันทึกพังซ้ำ */ }
  }
}
