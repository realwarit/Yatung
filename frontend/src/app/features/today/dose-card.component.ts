import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Dose } from '../../core/api/models';
import { sourceLabel } from '../../core/i18n/labels';
import { DoseQtyPipe, MealLabelPipe } from '../../core/i18n/labels.pipe';
import { IconComponent } from '../../shared/icon.component';

export type DoseState = 'waiting' | 'due' | 'overdue' | 'taken';

/** การ์ดยา 1 ตัวในรอบกินยา — สถานะแสดงด้วยสี + ไอคอน + ข้อความเสมอ */
@Component({
  selector: 'app-dose-card',
  imports: [MatButton, IconComponent, DoseQtyPipe, MealLabelPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dose-card.component.html',
  styleUrl: './dose-card.component.scss',
  host: { '[class]': '"state-" + state()' },
})
export class DoseCardComponent {
  readonly dose = input.required<Dose>();
  readonly state = input.required<DoseState>();
  /** กี่นาทีที่เลยเวลามา (ใช้เมื่อ state = overdue) */
  readonly lateMin = input(0);
  /** เวลาที่กิน 'HH:mm' */
  readonly takenClock = input<string | null>(null);
  /** ช่องทางที่ยืนยัน (dose_logs.source) */
  readonly source = input<string | null>(null);
  readonly canUndo = input(false);
  readonly busy = input(false);
  /** เพิ่งกดกิน → เล่น animation เครื่องหมายถูกเด้ง */
  readonly pop = input(false);

  readonly take = output<void>();
  readonly undo = output<void>();

  protected readonly sourceText = computed(() => sourceLabel(this.source()));

  /** < 1 ชม.: "เลยเวลามา 45 นาที" · ≥ 1 ชม.: "ยังไม่ได้กิน · เลยเวลามา 13 ชม." (ไม่แสดงนาที) */
  protected readonly lateText = computed(() => {
    const m = this.lateMin();
    return m < 60 ? `เลยเวลามา ${m} นาที` : `ยังไม่ได้กิน · เลยเวลามา ${Math.floor(m / 60)} ชม.`;
  });
}
