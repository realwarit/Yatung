import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MascotComponent, MascotMood } from '../../shared/components/mascot/mascot.component';
import { ProgressRingComponent } from '../../shared/components/progress-ring/progress-ring.component';
import { IconComponent } from '../../shared/icon.component';

export interface NextSlot { label: string; time: string; remain: string; }

/** การ์ดความคืบหน้าวันนี้ + กล่อง "รอบถัดไป/ยังไม่ได้กิน" (แยกจาก today.page เพื่อคุมงบ scss 4 kB ; host = display: contents จึงเป็นลูกตรงของ .aside เหมือนเดิม) */
@Component({
  selector: 'app-today-progress',
  imports: [IconComponent, MascotComponent, ProgressRingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './today-progress.component.html',
  styleUrl: './today-progress.component.scss',
})
export class TodayProgressComponent {
  readonly taken = input.required<number>();
  readonly total = input.required<number>();
  readonly mood = input.required<MascotMood>();
  readonly bubble = input.required<string>();
  readonly notTaken = input.required<number>();
  readonly allDone = input.required<boolean>();
  readonly next = input<NextSlot | null>(null);
  /** กดปุ่ม "ดูรายการ" */
  readonly goFirst = output<void>();
}
