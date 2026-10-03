import { ChangeDetectionStrategy, Component, computed, effect, input, signal, untracked } from '@angular/core';
import { IconComponent } from '../../shared/icon.component';
import { MascotComponent, MascotMood } from '../../shared/components/mascot/mascot.component';
import { SpeechBubbleComponent } from '../../shared/components/speech-bubble/speech-bubble.component';

type Floater = { kind: 'pill' | 'pill2' | 'clock' | 'heart' | 'star'; x: number; y: number; size: number; dur: number; delay: number };

/** ประโยคที่น้องยาตรงพูดเมื่อถูกกด (สุ่ม ไม่ซ้ำประโยคเดิมติดกัน) */
const PHRASES = [
  'กินยาตรงเวลา สุขภาพดีขึ้นทุกวันนะคะ',
  'ถ่ายรูปซองยามา เดี๋ยวน้องจัดตารางให้เอง',
  'ลืมกินยาไม่ต้องกังวล น้องจะเตือนผ่าน LINE ให้ค่ะ',
  'ถ้าลืมกินยา น้องจะแจ้งญาติให้รู้ด้วยนะคะ',
  'อย่าลืมดื่มน้ำตามยานะคะ',
  'ยาใกล้หมดเมื่อไหร่ น้องบอกก่อนเลยค่ะ',
  'วันนี้กินยาครบทุกมื้อหรือยังเอ่ย',
  'กดฟังน้องอ่านรายละเอียดยาให้ได้นะคะ',
] as const;

/** "เวทีของน้องยาตรง" ซีกซ้ายของหน้า Login/Register บนจอกว้าง */
@Component({
  selector: 'app-auth-stage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, MascotComponent, SpeechBubbleComponent],
  templateUrl: './auth-stage.component.html',
  styleUrl: './auth-stage.component.scss',
})
export class AuthStageComponent {
  readonly mood = input<MascotMood>('happy');
  readonly message = input.required<string>();
  readonly peek = input(false);
  /** false = ฟอร์มกำลัง error/ส่งข้อมูล → กดมาสคอตได้แค่เด้งตัว ไม่เปลี่ยนข้อความ */
  readonly chatty = input(true);

  protected readonly hop = signal(false);
  private readonly spoken = signal<string | null>(null);
  protected readonly shownMessage = computed(() => this.spoken() ?? this.message());
  private last = -1;

  constructor() {
    // ข้อความจากฟอร์มเปลี่ยน (โฟกัส/error/ส่งข้อมูล) → ยกเลิกประโยคที่สุ่มไว้
    effect(() => { this.message(); untracked(() => this.spoken.set(null)); });
  }

  protected chat(): void {
    if (!this.hop()) {
      this.hop.set(true);
      setTimeout(() => this.hop.set(false), 600);
    }
    if (!this.chatty()) return;
    let i: number;
    do { i = Math.floor(Math.random() * PHRASES.length); } while (i === this.last);
    this.last = i;
    this.spoken.set(PHRASES[i]);
  }

  // ตำแหน่งเป็น % ของกล่องมาสคอต (blob กว้างกว่ากล่อง ~1.35 เท่า → ค่านอก 0–100 คือขอบ blob)
  protected readonly floaters: Floater[] = [
    { kind: 'pill', x: -14, y: 12, size: 2.8, dur: 6, delay: 0 },
    { kind: 'clock', x: 104, y: 44, size: 2.8, dur: 7, delay: -2 },
    { kind: 'heart', x: -16, y: 52, size: 2.3, dur: 5.5, delay: -1 },
    { kind: 'star', x: 108, y: 76, size: 2.2, dur: 4.5, delay: -3 },
    { kind: 'pill2', x: -6, y: 90, size: 2.5, dur: 6.5, delay: -4 },
    { kind: 'star', x: 88, y: 98, size: 1.6, dur: 5, delay: -2.5 },
  ];
}
