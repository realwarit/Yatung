import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AdherenceMedication, AdherenceSources } from '../../core/api/stats.api';
import { sourceGroups } from './adherence-level';

/** รายการอัตราต่อยา (เรียงจากกินครบน้อยไปมาก ตามที่ API ส่ง) + ช่องทางที่บันทึกว่ากินแล้ว */
@Component({
  selector: 'app-med-breakdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './med-breakdown.component.html',
  styleUrl: './med-breakdown.component.scss',
})
export class MedBreakdownComponent {
  readonly meds = input.required<AdherenceMedication[]>();
  readonly sources = input.required<AdherenceSources>();
  protected readonly groups = computed(() => sourceGroups(this.sources()));
  protected readonly anySource = computed(() => this.groups().some((g) => g.count > 0));
  protected width(m: AdherenceMedication): number { return m.rate ?? 0; }
}
