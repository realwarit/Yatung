import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DemoApi } from '../../core/api/line.api';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { CaregiversSectionComponent } from './caregivers-section.component';
import { DevInfoSectionComponent } from './dev-info-section.component';
import { LineSectionComponent } from './line-section.component';

/** หน้าย่อยของตั้งค่า : page-header ← "ตั้งค่า" + เนื้อหาเดิมทั้งหมด (polling/QR/dialog อยู่ในหน้านี้ ไม่ใช่ sheet) */

@Component({
  selector: 'app-settings-line-page',
  imports: [PageHeaderComponent, LineSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="yt-page sub" data-first-screen="line-sub">
      <app-page-header title="เชื่อม LINE" back="/settings" backLabel="กลับไปตั้งค่า" />
      <section class="yt-card card"><app-line-section /></section>
    </div>
  `,
  styles: `.sub { max-width: 44rem; } .card { padding: var(--yt-space-4); margin-top: var(--yt-space-3); }`,
})
export class SettingsLinePage {}

@Component({
  selector: 'app-settings-caregivers-page',
  imports: [PageHeaderComponent, CaregiversSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="yt-page sub">
      <app-page-header title="ญาติ/ผู้ดูแล" back="/settings" backLabel="กลับไปตั้งค่า" />
      <section class="yt-card card"><app-caregivers-section /></section>
    </div>
  `,
  styles: `.sub { max-width: 44rem; } .card { padding: var(--yt-space-4); margin-top: var(--yt-space-3); }`,
})
export class SettingsCaregiversPage {}

/** ข้อมูลสำหรับผู้พัฒนา (เฉพาะ demoMode) : ไม่ใช่ demoMode = เด้งกลับหน้ารวม */
@Component({
  selector: 'app-settings-developer-page',
  imports: [PageHeaderComponent, DevInfoSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="yt-page sub">
      <app-page-header title="ข้อมูลผู้พัฒนา" back="/settings" backLabel="กลับไปตั้งค่า" />
      <section class="yt-card card"><app-dev-info-section /></section>
    </div>
  `,
  styles: `.sub { max-width: 44rem; } .card { padding: var(--yt-space-4); margin-top: var(--yt-space-3); }`,
})
export class SettingsDeveloperPage {
  constructor() {
    const router = inject(Router);
    inject(DemoApi).config().subscribe({
      next: (c) => { if (c.demoMode !== true) void router.navigateByUrl('/settings', { replaceUrl: true }); },
      error: () => void router.navigateByUrl('/settings', { replaceUrl: true }),
    });
  }
}
