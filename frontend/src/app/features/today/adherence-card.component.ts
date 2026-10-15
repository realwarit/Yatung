import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { StatsApi } from '../../core/api/stats.api';

/** ลิงก์เล็กในการ์ดหลัก "7 วันล่าสุด กินครบ 44% ›" → /overview ; ไม่มีข้อมูล/โหลดไม่ได้ = ซ่อนเงียบ ๆ (ไม่ขัดหน้าหลัก) */
@Component({
  selector: 'app-adherence-card',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rate() !== null) {
      <a routerLink="/overview" [attr.aria-label]="'7 วันล่าสุด กินครบ ' + rate() + ' เปอร์เซ็นต์ แตะเพื่อดูสรุป'"><span class="long">7 วันล่าสุด </span><span class="short">7 วัน </span><span class="num">{{ rate() }}%</span> ›</a>
    }
  `,
  styles: `
    :host { display: inline-block; }
    a {
      position: relative; display: inline-block; white-space: nowrap; font-size: var(--yt-text-label); line-height: var(--yt-line-height-tight);
      color: var(--yt-primary-dark); text-decoration: none; font-weight: 500;
    }
    a::before { content: ''; position: absolute; inset: -0.9rem -0.5rem; }   /* พื้นที่แตะ ≥ 48px */
    a:hover { text-decoration: underline; }
    .short { display: none; }
    /* ที่แคบ (ก++ บนจอ 360px) ย่อเป็น "7 วัน n% ›" ให้ ›  ไม่ตกบรรทัดเดียวโดด ๆ ; .txt ของ today-progress เป็น container */
    @container (max-width: 8.5rem) { .long { display: none; } .short { display: inline; } }
  `,
})
export class AdherenceCardComponent {
  private api = inject(StatsApi);
  private destroyRef = inject(DestroyRef);

  /** เปลี่ยนค่าเมื่อมีการกิน/ยกเลิก → โหลดอัตราใหม่ */
  readonly version = input<number>(0);
  protected readonly rate = signal<number | null>(null);

  constructor() {
    effect(() => {
      this.version();
      this.api.adherence(7).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (r) => this.rate.set(r.overall.rate),
        error: () => this.rate.set(null),
      });
    });
  }
}
