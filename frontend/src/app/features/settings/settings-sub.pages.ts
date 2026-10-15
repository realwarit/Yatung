import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { DemoApi } from '../../core/api/line.api';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { CaregiversSectionComponent } from './caregivers-section.component';
import { DevInfoSectionComponent } from './dev-info-section.component';
import { LineSectionComponent } from './line-section.component';

/**
 * โครงหน้าย่อย (page-header ← "ตั้งค่า" + การ์ดเนื้อหา) — สไตล์อยู่ที่นี่ที่เดียว
 * ห้ามให้หลายคอมโพเนนต์ในโปรเจกต์มี `styles` ข้อความเดียวกันทุกไบต์ : `ng build` สร้างเสร็จแล้วแต่ process ไม่ exit (ดู docs/day8d-plan.md "build ค้าง")
 */
@Component({
  selector: 'app-settings-sub-frame',
  imports: [PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="yt-page sub" [attr.data-first-screen]="firstScreen()">
      <app-page-header [title]="title()" back="/settings" backLabel="กลับไปตั้งค่า" />
      <section class="yt-card card"><ng-content /></section>
    </div>
  `,
  styles: `.sub { max-width: 44rem; } .card { padding: var(--yt-space-4); margin-top: var(--yt-space-3); }`,
})
export class SettingsSubFrameComponent {
  readonly title = input.required<string>();
  readonly firstScreen = input<string | null>(null);
}

@Component({
  selector: 'app-settings-line-page',
  imports: [SettingsSubFrameComponent, LineSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-settings-sub-frame title="เชื่อม LINE" firstScreen="line-sub"><app-line-section /></app-settings-sub-frame>`,
})
export class SettingsLinePage {}

@Component({
  selector: 'app-settings-caregivers-page',
  imports: [SettingsSubFrameComponent, CaregiversSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-settings-sub-frame title="ญาติ/ผู้ดูแล"><app-caregivers-section /></app-settings-sub-frame>`,
})
export class SettingsCaregiversPage {}

/** ข้อมูลสำหรับผู้พัฒนา (เฉพาะ demoMode) : ไม่ใช่ demoMode = เด้งกลับหน้ารวม */
@Component({
  selector: 'app-settings-developer-page',
  imports: [SettingsSubFrameComponent, DevInfoSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-settings-sub-frame title="ข้อมูลผู้พัฒนา"><app-dev-info-section /></app-settings-sub-frame>`,
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
