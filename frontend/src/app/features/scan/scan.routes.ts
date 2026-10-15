import { DOCUMENT } from '@angular/common';
import { inject, provideEnvironmentInitializer } from '@angular/core';
import { Routes } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { initialize } from '@ionic/core/components';
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import { unsavedChangesGuard } from '../../core/unsaved-changes.guard';

const IONIC_CONFIG = { mode: 'md' as const };   // หน้าตาเหมือนกันทั้ง Android/iOS/เว็บ

/**
 * Ionic ใช้เฉพาะหน้า Scan → โหลดพร้อม chunk ของหน้านี้เท่านั้น (ไม่อยู่ใน initial bundle)
 * `provideIonicAngular` ผูก initializer กับ APP_INITIALIZER ซึ่งไม่ทำงานใน injector ของ route
 * จึงเรียก `initialize()` + ตั้ง class `ion-ce` เอง (เหมือนที่ provider ทำ) และเปิด UI กล้องของ @capacitor/camera บนเว็บ
 */
function scanProviders() {
  return [
    provideIonicAngular(IONIC_CONFIG),
    provideEnvironmentInitializer(() => {
      inject(DOCUMENT).documentElement.classList.add('ion-ce');
      initialize(IONIC_CONFIG);
      defineCustomElements(window);
    }),
  ];
}

export const SCAN_ROUTES: Routes = [
  {
    path: '',
    providers: scanProviders(),
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./scan.page').then((m) => m.ScanPage),
  },
];

/** หน้าตรวจสถานะ /dev/scan-states (เฉพาะ ng serve) ใช้คอมโพเนนต์ Ionic ชุดเดียวกัน */
export const SCAN_DEV_ROUTES: Routes = [
  {
    path: '',
    providers: scanProviders(),
    loadComponent: () => import('../dev/scan-states.page').then((m) => m.ScanStatesPage),
  },
];
