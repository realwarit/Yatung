import { ChangeDetectionStrategy, Component, computed, effect, input, signal, untracked } from '@angular/core';
import { IconComponent } from '../../shared/icon.component';
import { MascotComponent, MascotMood } from '../../shared/components/mascot/mascot.component';
import { SpeechBubbleComponent } from '../../shared/components/speech-bubble/speech-bubble.component';

type Floater = { kind: 'pill' | 'pill2' | 'clock' | 'heart' | 'star'; x: number; y: number; size: number; dur: number; delay: number };

/** ประโยคที่น้องยาตรงพูดเมื่อถูกกด (สุ่ม ไม่ซ้ำประโยคเดิมติดกัน) */
const PHRASES = [
  'กินยาตรงเวลา สุขภาพดีขึ้นทุกวันนะคะ',
  'ถ่ายรูปซองยามา เดี๋ยวน้องจัดตารางให้เอง',
  'ลืมกินยา น้องเตือนผ่าน LINE ให้นะคะ',
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

  // ตำแหน่งเป็น % ของ stage (= กล่อง blob) วางบนขอบวงกลม ตามมุมนับตามเข็มจากด้านบน; เว้นมุม 0–70° (ขวาบน) ไว้ให้กรอบคำพูด
  // และเว้นด้านล่าง (ป้ายชื่อ/คำโปรย); ดาว ×2 คือประกายที่ย้ายมาจากหัวข้อเดิม
  protected readonly floaters: Floater[] = [
    { kind: 'pill', x: 21, y: 9, size: 2.8, dur: 6, delay: 0 },       // 325°
    { kind: 'star', x: 5, y: 29, size: 1.7, dur: 4.5, delay: -1.5 },  // 295°
    { kind: 'heart', x: 0, y: 54, size: 2.3, dur: 5.5, delay: -1 },   // 265°
    { kind: 'pill2', x: 12, y: 82, size: 2.5, dur: 6.5, delay: -4 },  // 230°
    { kind: 'clock', x: 100, y: 54, size: 2.8, dur: 7, delay: -2 },   // 95°
    { kind: 'star', x: 88, y: 82, size: 2.2, dur: 4.8, delay: -3 },   // 130°
  ];
}
