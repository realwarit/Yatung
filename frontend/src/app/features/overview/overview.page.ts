import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MascotComponent } from '../../shared/components/mascot/mascot.component';

/** หน้า "ภาพรวม" (dashboard adherence 7 วัน) — ทำในวันที่ 8 ตอนนี้เป็น empty state */
@Component({
  selector: 'app-overview-page',
  imports: [MascotComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="yt-page">
      <h1 class="yt-page-title">ภาพรวม</h1>
      <section class="empty yt-card yt-enter">
        <app-mascot mood="happy" [size]="180" [decorative]="false" />
        <h2>เร็วๆ นี้นะคะ</h2>
        <p>สรุปการกินยา 7 วันย้อนหลังกำลังจะมาให้ดูที่นี่ค่ะ</p>
      </section>
    </div>
  `,
  styles: `
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--yt-space-2);
      max-width: 34rem;
      margin: var(--yt-space-5) auto;
      padding: var(--yt-space-6) var(--yt-space-5);
      text-align: center;
    }
    h2 { font-size: 1.6rem; }
    p { margin: 0; color: var(--yt-text-muted); }
  `,
})
export class OverviewPage {}
