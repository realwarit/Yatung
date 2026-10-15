import { MedNamePipe } from '../../core/i18n/labels.pipe';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AdherenceMedication, AdherenceSources } from '../../core/api/stats.api';
import { sourceLine, toneOf } from './adherence-level';

/** การ์ด "แยกตามยา": ชื่อ + "กิน/ถึงเวลา" + แถบสีตามสเกลเดียวกับกราฟ (เรียงจากกินครบน้อยไปมาก ตามที่ API ส่ง) + บรรทัดท้าย "บันทึกผ่าน แอป 3 · LINE 1" */
@Component({
  selector: 'app-med-breakdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './med-breakdown.component.html',
  styleUrl: './med-breakdown.component.scss',
  imports: [MedNamePipe],
})
export class MedBreakdownComponent {
  readonly meds = input.required<AdherenceMedication[]>();
  readonly sources = input.required<AdherenceSources>();
  protected readonly line = computed(() => sourceLine(this.sources()));
  protected width(m: AdherenceMedication): number { return m.rate ?? 0; }
  protected tone(m: AdherenceMedication): string { return toneOf(m.rate); }
}
