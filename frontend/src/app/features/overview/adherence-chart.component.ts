import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { AdherenceDay } from '../../core/api/stats.api';
import { IconComponent } from '../../shared/icon.component';
import { barFraction, chartSummary, dayDetail, dayKind } from './adherence-level';

/** กราฟแท่งอัตราการกินยารายวัน (SVG/CSS ล้วน ไม่ใช้ไลบรารี) — สื่อความหมายด้วยตัวเลข + ไอคอน + ลวดลาย ไม่ใช้สีอย่างเดียว */
@Component({
  selector: 'app-adherence-chart',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './adherence-chart.component.html',
  styleUrl: './adherence-chart.component.scss',
})
export class AdherenceChartComponent {
  readonly days = input.required<AdherenceDay[]>();
  private readonly picked = signal<string | null>(null);

  /** วันที่เลือก (ค่าเริ่มต้น = วันนี้ ไม่มีก็วันสุดท้าย) */
  protected readonly selected = computed<AdherenceDay | null>(() => {
    const list = this.days();
    return list.find((d) => d.date === this.picked()) ?? list.find((d) => d.is_today) ?? list[list.length - 1] ?? null;
  });
  protected readonly detail = computed(() => { const s = this.selected(); return s ? dayDetail(s) : ''; });
  protected readonly summary = computed(() => chartSummary(this.days()));
  protected readonly cols = computed(() => `repeat(${this.days().length}, minmax(0, 1fr))`);

  protected select(d: AdherenceDay): void { this.picked.set(d.date); }
  protected pct(d: AdherenceDay): number { return Math.round(barFraction(d.rate) * 100); }
  protected kind = dayKind;
  protected tone(rate: number | null): 'good' | 'mid' | 'low' | 'none' {
    return rate === null ? 'none' : rate >= 80 ? 'good' : rate >= 50 ? 'mid' : 'low';
  }
  protected barClass(d: AdherenceDay): string { return `bar tone-${this.tone(d.rate)}${d.is_today ? ' today' : ''}`; }
  protected dayNo(d: AdherenceDay): string { return d.label_th.split(' ')[1] ?? ''; }
  protected dow(d: AdherenceDay): string { return d.label_th.split(' ')[0] ?? ''; }
  protected pressLabel(d: AdherenceDay): string {
    return `${d.label_th} ${d.rate === null ? 'ไม่มียา' : d.rate + ' เปอร์เซ็นต์'} แตะเพื่อดูรายละเอียด`;
  }
}
