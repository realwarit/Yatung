import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { StatsApi } from '../../core/api/stats.api';
import { IconComponent } from '../../shared/icon.component';
import { ListRowComponent } from '../../shared/ui/list-row/list-row.component';
import { SectionComponent } from '../../shared/ui/section/section.component';

/** แถวเล็กท้ายหน้าวันนี้ "7 วันล่าสุด กินครบ 86% ›" → /overview ; ไม่มีข้อมูล/โหลดไม่ได้ = ซ่อนเงียบ ๆ (ไม่ขัดหน้าหลัก) */
@Component({
  selector: 'app-adherence-card',
  imports: [RouterLink, IconComponent, ListRowComponent, SectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rate() !== null) {
      <app-section>
        <a appListRow routerLink="/overview" [title]="'7 วันล่าสุด กินครบ ' + rate() + '%'" [chevron]="true"
           [attr.aria-label]="'7 วันล่าสุด กินครบ ' + rate() + ' เปอร์เซ็นต์ แตะเพื่อดูสรุป'">
          <app-icon lead name="chart" />
        </a>
      </app-section>
    }
  `,
  styles: ':host { display: block; } :host:empty { display: none; }',
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
