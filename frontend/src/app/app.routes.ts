import { isDevMode } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { unsavedChangesGuard } from './core/unsaved-changes.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'today' },
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/auth/login.page').then(m => m.LoginPage) },
  { path: 'register', canActivate: [guestGuard], loadComponent: () => import('./features/auth/register.page').then(m => m.RegisterPage) },
  {
    path: 'scan',
    canActivate: [authGuard],
    // lazy load → Ionic ถูกโหลดเฉพาะตอนเปิดหน้า Scan ไม่ทำให้หน้าอื่นหนัก
    loadComponent: () => import('./features/scan/scan.page').then(m => m.ScanPage),
  },
  // โครงแอปหลัง login: แถบล่าง (มือถือ) / sidebar (จอกว้าง)
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell.component').then(m => m.ShellComponent),
    children: [
      { path: 'today', loadComponent: () => import('./features/today/today.page').then(m => m.TodayPage) },
      { path: 'medications', loadComponent: () => import('./features/medications/medications.page').then(m => m.MedicationsPage) },
      {
        path: 'medications/new',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./features/medications/med-form.page').then(m => m.MedFormPage),
      },
      {
        path: 'medications/:id/edit',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./features/medications/med-form.page').then(m => m.MedFormPage),
      },
      { path: 'overview', loadComponent: () => import('./features/overview/overview.page').then(m => m.OverviewPage) },
      { path: 'settings', loadComponent: () => import('./features/settings/settings.page').then(m => m.SettingsPage) },
    ],
  },
  // หน้าตรวจมาสคอต: เปิดเฉพาะ dev (ng serve) ไม่มีใน production build
  ...(isDevMode() ? [
    { path: 'dev/mascot', loadComponent: () => import('./features/dev/mascot-showcase.page').then(m => m.MascotShowcasePage) },
    { path: 'dev/buttons', loadComponent: () => import('./features/dev/buttons-showcase.page').then(m => m.ButtonsShowcasePage) },
  ] : []),
  // { path: 'review/:id', loadComponent: () => import('./features/review/review.page').then(m => m.ReviewPage) },
  { path: '**', redirectTo: 'today' },
];
