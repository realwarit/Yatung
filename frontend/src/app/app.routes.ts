import { isDevMode } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard, guestGuard, rootGuard, welcomeGuard } from './core/auth/auth.guard';
import { unsavedChangesGuard } from './core/unsaved-changes.guard';

export const routes: Routes = [
  // `/` : ยังไม่ล็อกอิน = หน้าต้อนรับ ; ล็อกอินแล้ว = /today (rootGuard คืน UrlTree เสมอ)
  { path: '', pathMatch: 'full', canActivate: [rootGuard], children: [] },
  { path: 'welcome', canActivate: [welcomeGuard], loadComponent: () => import('./features/welcome/welcome.page').then(m => m.WelcomePage) },
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/auth/login.page').then(m => m.LoginPage) },
  { path: 'register', canActivate: [guestGuard], loadComponent: () => import('./features/auth/register.page').then(m => m.RegisterPage) },
  // โครงแอปหลัง login: แถบล่าง (มือถือ) / sidebar (จอกว้าง)
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell.component').then(m => m.ShellComponent),
    children: [
      { path: 'today', data: { ownHeader: true }, loadComponent: () => import('./features/today/today.page').then(m => m.TodayPage) },
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
      {
        // Ionic ถูกโหลดเฉพาะตอนเปิดหน้า Scan (lazy) · hideBottomNav = มือถือซ่อนแถบเมนูล่างเพื่อให้โฟกัสงานตรงหน้า
        path: 'scan',
        data: { hideBottomNav: true },
        loadChildren: () => import('./features/scan/scan.routes').then(m => m.SCAN_ROUTES),
      },
      {
        // หน้าตรวจผลสแกนก่อนบันทึก: งานโฟกัส (ซ่อนแถบเมนูล่างบนมือถือ) · แก้แล้วยังไม่บันทึก = ถามก่อนออก
        path: 'review/:id',
        data: { hideBottomNav: true },
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./features/review/review.page').then(m => m.ReviewPage),
      },
      { path: 'overview', loadComponent: () => import('./features/overview/overview.page').then(m => m.OverviewPage) },
      {
        // หน้ารวม + หน้าย่อย 3 หน้า (LINE / ญาติ / ผู้พัฒนา) ; แถบเมนูล่างยังอยู่ ; developer ซ่อนเมื่อไม่ได้ demoMode (เด้งกลับหน้ารวม)
        path: 'settings',
        children: [
          { path: '', pathMatch: 'full', loadComponent: () => import('./features/settings/settings.page').then(m => m.SettingsPage) },
          { path: 'line', loadComponent: () => import('./features/settings/settings-sub.pages').then(m => m.SettingsLinePage) },
          { path: 'caregivers', loadComponent: () => import('./features/settings/settings-sub.pages').then(m => m.SettingsCaregiversPage) },
          { path: 'developer', loadComponent: () => import('./features/settings/settings-sub.pages').then(m => m.SettingsDeveloperPage) },
        ],
      },
    ],
  },
  // หน้าตรวจมาสคอต: เปิดเฉพาะ dev (ng serve) ไม่มีใน production build
  ...(isDevMode() ? [
    { path: 'dev/mascot', loadComponent: () => import('./features/dev/mascot-showcase.page').then(m => m.MascotShowcasePage) },
    { path: 'dev/scan-states', loadChildren: () => import('./features/scan/scan.routes').then(m => m.SCAN_DEV_ROUTES) },
    { path: 'dev/buttons', loadComponent: () => import('./features/dev/buttons-showcase.page').then(m => m.ButtonsShowcasePage) },
    { path: 'dev/ui', loadComponent: () => import('./features/dev/ui-showcase.page').then(m => m.UiShowcasePage) },
    { path: 'dev/push-states', loadComponent: () => import('./features/dev/push-states.page').then(m => m.PushStatesPage) },
  ] : []),
  { path: '**', redirectTo: 'today' },
];
