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

/** `/` : ล็อกอินแล้ว → /today · ยังไม่ล็อกอิน → /welcome (เฉพาะทางเข้า `/` ; deep link อื่นยังไป /login ผ่าน authGuard) */
export const rootGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return inject(Router).createUrlTree([auth.token ? '/today' : '/welcome']);
};

/** /welcome — ล็อกอินอยู่แล้วไม่ต้องเห็นหน้าต้อนรับ (UrlTree = แทนที่ประวัติ ไม่ค้าง /welcome ให้ back ย้อนมา) */
export const welcomeGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.token ? inject(Router).createUrlTree(['/today']) : true;
};

/** หน้า login/register — ถ้า login อยู่แล้วไม่ต้องเห็นฟอร์มอีก */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.token ? inject(Router).createUrlTree(['/today']) : true;
};
