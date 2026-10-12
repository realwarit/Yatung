import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { StatsApi } from '../../core/api/stats.api';
import { IconComponent } from '../../shared/icon.component';

/** การ์ดเล็กบนหน้าวันนี้ "7 วันล่าสุด กินครบ 86% ›" → /overview ; ไม่มีข้อมูล/โหลดไม่ได้ = ซ่อนเงียบ ๆ (ไม่ขัดหน้าหลัก) */
@Component({
  selector: 'app-adherence-card',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rate() !== null) {
      <a class="card" routerLink="/overview" [attr.aria-label]="'7 วันล่าสุด กินครบ ' + rate() + ' เปอร์เซ็นต์ แตะเพื่อดูสรุป'">
        <app-icon name="chart" />
        <span class="txt">7 วันล่าสุด กินครบ <span class="num">{{ rate() }}%</span></span>
        <app-icon name="arrow-right" class="go" />
      </a>
    }
  `,
  styleUrl: './adherence-card.component.scss',
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
