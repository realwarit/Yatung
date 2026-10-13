import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MascotComponent, MascotMood } from '../../shared/components/mascot/mascot.component';
import { TtsButtonComponent } from '../../shared/components/tts-button/tts-button.component';

/**
 * การ์ดความคืบหน้าวันนี้ (สูง ≈ 76px) : น้องยาตรง S | "วันนี้กินแล้ว" "3 / 5" + แถบบาง 6px | ปุ่ม 🔊 ฟัง
 * กินครบทั้งวัน = น้องยาตรง L ท่าดีใจ + ข้อความ (ช่วงพิเศษเดียวที่ใช้ขนาด L บนหน้านี้)
 * ไม่มียาในวันนี้ = ข้อความเดียว ไม่มีตัวเลข/แถบ (ห้ามแสดง 0 / 0)
 */
@Component({
  selector: 'app-today-progress',
  imports: [MascotComponent, TtsButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './today-progress.component.html',
  styleUrl: './today-progress.component.scss',
  host: { '[class.done]': 'allDone()' },
})
export class TodayProgressComponent {
  readonly taken = input.required<number>();
  readonly total = input.required<number>();
  readonly mood = input.required<MascotMood>();
  readonly allDone = input.required<boolean>();
  /** อ่านออกเสียง "ยาที่ต้องกินวันนี้" */
  readonly speak = input.required<() => string[]>();

  protected readonly pct = computed(() => (this.total() ? Math.round((this.taken() * 100) / this.total()) : 0));
}
