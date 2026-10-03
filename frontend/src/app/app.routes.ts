import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'scan' },   // ชั่วคราว จนกว่าจะมีหน้า today
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/auth/login.page').then(m => m.LoginPage) },
  { path: 'register', canActivate: [guestGuard], loadComponent: () => import('./features/auth/register.page').then(m => m.RegisterPage) },
  {
    path: 'scan',
    canActivate: [authGuard],
    // lazy load → Ionic ถูกโหลดเฉพาะตอนเปิดหน้า Scan ไม่ทำให้หน้าอื่นหนัก
    loadComponent: () => import('./features/scan/scan.page').then(m => m.ScanPage),
  },
  // { path: 'review/:id', loadComponent: () => import('./features/review/review.page').then(m => m.ReviewPage) },
  // { path: 'today', loadComponent: ... },
];
