import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MascotComponent, MascotMood } from '../../shared/components/mascot/mascot.component';
import { SpeechBubbleComponent } from '../../shared/components/speech-bubble/speech-bubble.component';
import { TtsButtonComponent } from '../../shared/components/tts-button/tts-button.component';
import { AdherenceCardComponent } from './adherence-card.component';
import { TodayBubble } from './today-model';

const RING_R = 21;
const RING_LEN = 2 * Math.PI * RING_R;

/**
 * แถบทักทายหน้าวันนี้ (D2.5): พื้น hero-bg เต็มความกว้าง โค้งมุมล่าง 24px
 *  แถว 1  "สวัสดี คุณ…" 20/500 + วันที่ย่อ
 *  การ์ดหลัก (ขาว radius 20): [น้องยาตรง M + กล่องคำพูด 1 กล่อง] · [วงแหวน 48 "3/5" + "วันนี้กินแล้ว" + ลิงก์ 7 วัน + ปุ่ม 🔊 ฟัง]
 *  กินครบทั้งวัน = น้องยาตรง L ท่า celebrate + กล่องคำพูด success
 * ไม่มียา = ข้อความเดียว ไม่มีวงแหวน (ห้ามแสดง 0/0)
 */
@Component({
  selector: 'app-today-progress',
  imports: [MascotComponent, SpeechBubbleComponent, TtsButtonComponent, AdherenceCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './today-progress.component.html',
  styleUrl: './today-progress.component.scss',
  host: { '[class.done]': 'allDone()' },
})
export class TodayProgressComponent {
  readonly greet = input.required<string>();
  readonly date = input.required<string>();
  readonly taken = input.required<number>();
  readonly total = input.required<number>();
  readonly mood = input.required<MascotMood>();
  readonly allDone = input.required<boolean>();
  readonly bubble = input.required<TodayBubble>();
  /** อ่านออกเสียง "ยาที่ต้องกินวันนี้" */
  readonly speak = input.required<() => string[]>();

  protected readonly ringLen = RING_LEN;
  protected readonly dash = computed(() => `${(this.total() ? this.taken() / this.total() : 0) * RING_LEN} ${RING_LEN}`);
  /** "10/12" ยาวกว่า "3/5" → ลดตัวอักษรให้อยู่ในวง */
  protected readonly ringFont = computed(() => (`${this.taken()}/${this.total()}`.length > 3 ? 11 : 14));
}
