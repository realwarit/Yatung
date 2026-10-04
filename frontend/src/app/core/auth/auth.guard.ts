import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** หน้าที่ต้อง login — ถ้าไม่มี token ที่ใช้ได้ ส่งไป /login (จำ url เดิมไว้ใน returnUrl) */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.token) return true;
  auth.logout(false);
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** หน้า login/register — ถ้า login อยู่แล้วไม่ต้องเห็นฟอร์มอีก */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.token ? inject(Router).createUrlTree(['/today']) : true;
};
