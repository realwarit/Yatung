import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** แนบ Bearer token ให้ทุก request ไป /api และถ้าได้ 401 (เซสชันหมดอายุ/ไม่ถูกต้อง) → logout + ไปหน้า login */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isApi = req.url.startsWith('/api/');
  const isAuthEndpoint = req.url.startsWith('/api/auth/');   // 401 ที่นี่ = รหัสผิด ไม่ใช่ session หมดอายุ

  const token = auth.token;
  if (isApi && token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req).pipe(
    catchError((err: unknown) => {
      if (isApi && !isAuthEndpoint && err instanceof HttpErrorResponse && err.status === 401) {
        auth.logout();
      }
      return throwError(() => err);
    }),
  );
};
