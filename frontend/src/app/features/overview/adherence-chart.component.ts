import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { AdherenceDay } from '../../core/api/stats.api';
import { barFraction, barLabel, chartSummary, dayChips, isPartialToday, toneOf } from './adherence-level';

/** กราฟแท่งอัตราการกินยารายวัน (CSS ล้วน ไม่ใช้ไลบรารี) — ตัวเลขวางชิดบนหัวแท่งทุกแท่ง จึงไม่พึ่งสีอย่างเดียว ;
 *  สีตามสเกลเดียวทั้งหน้า (teal/amber/coral) ; วันนี้ที่ยังไม่จบแสดง "กินแล้ว/ทั้งหมด" ด้วยแท่งกรอบประสี teal (ไม่ใช่สีแดง ไม่ใช่ข้อผิดพลาด) */
@Component({
  selector: 'app-adherence-chart',
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
  protected readonly chips = computed(() => { const s = this.selected(); return s ? dayChips(s) : []; });
  protected readonly summary = computed(() => chartSummary(this.days()));
  protected readonly cols = computed(() => `repeat(${this.days().length}, minmax(0, 1fr))`);

  protected select(d: AdherenceDay): void { this.picked.set(d.date); }
  protected partial = isPartialToday;
  protected label = barLabel;
  protected tone = toneOf;
  protected frac(d: AdherenceDay): number { return barFraction(d.rate); }
  /** สีตัวเลขบนแท่ง: เฉดเข้มของสีเดียวกับแท่ง */
  protected inkOf(d: AdherenceDay): string { return isPartialToday(d) ? 'good' : toneOf(d.rate); }
  protected dayNo(d: AdherenceDay): string { return d.label_th.split(' ')[1] ?? ''; }
  protected dow(d: AdherenceDay): string { return d.label_th.split(' ')[0] ?? ''; }
  protected pressLabel(d: AdherenceDay): string {
    const what = isPartialToday(d) ? `กินแล้ว ${d.taken} จาก ${d.due + d.upcoming} ครั้ง` : d.rate === null ? 'ไม่มียา' : d.rate + ' เปอร์เซ็นต์';
    return `${d.is_today ? 'วันนี้ ' : ''}${d.label_th} ${what} แตะเพื่อดูรายละเอียด`;
  }
}
