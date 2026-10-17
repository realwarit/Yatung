import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

/** หน้าต้อนรับ (วันที่ 9W) — W1 = โครงปุ่ม + การนำทาง ; หน้าตา/motion มาใน W2–W3 */
@Component({
  selector: 'app-welcome-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="w">
      <h1>ยาตรง</h1>
      <button type="button" class="yt-btn yt-btn--primary" (click)="start()">เริ่มต้นใช้งาน</button>
    </main>`,
  styles: `.w { min-height: 100dvh; display: grid; place-content: center; gap: 1rem; text-align: center; }`,
})
export class WelcomePage {
  private readonly router = inject(Router);

  /** ไม่ใส่ returnUrl → หลัง login ไป /today ; state.from ให้ปุ่ม back ของ Android กลับมาที่นี่ */
  start(): void {
    void this.router.navigate(['/login'], { state: { from: 'welcome' } });
  }
}
