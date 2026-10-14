import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MascotComponent, MascotMood } from '../../../shared/components/mascot/mascot.component';
import { SpeechBubbleComponent } from '../../../shared/components/speech-bubble/speech-bubble.component';

/**
 * น้องยาตรงเกาะขอบบนของการ์ดสแกน + กล่องคำพูด (หางชี้ซ้าย) — ระบบเดียวกับ Login (auth-shell `.peek`)
 * ขนาดน้อง: มือถือ 80px · จอเตี้ย (< 700px) 72px · container scan ≥ 720px = L 130px
 * ข้อความ: ยาวเมื่อที่พอ (วัดเป็น rem จึงตามขนาด ก/ก+/ก++) ไม่พอ = ข้อความสั้น → กล่องคำพูดไม่เกิน 2 บรรทัด
 * ภาพตัดที่ขอบการ์ด (ส่วนล่างอยู่หลังการ์ด มือเกาะขอบ) ; การ์ดต้องมี position: relative + z-index: 1
 */
@Component({
  selector: 'app-scan-perch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MascotComponent, SpeechBubbleComponent],
  template: `
    <div class="mascot"><app-mascot [mood]="mood()" [grip]="true" [fluid]="true" /></div>
    <app-speech-bubble class="b long" tone="info" tail="left" [typing]="false" [text]="text()" />
    <app-speech-bubble class="b short" tone="info" tail="left" [typing]="false" [text]="short()" />
  `,
  styles: `
    :host { --m: 80px; display: flex; align-items: flex-start; gap: var(--yt-space-3); }
    .mascot { flex: none; width: var(--m); height: calc(var(--m) * 0.82); margin-bottom: -0.4rem; overflow: hidden; }
    .b { flex: 0 1 auto; min-width: 0; margin-top: calc(var(--m) * 0.12); }
    .short { display: none; }
    @container scan (max-width: 20rem) { .long { display: none; } .short { display: block; } }
    @media (max-height: 700px) { :host { --m: 72px; } }
    @container scan (min-width: 720px) { :host { --m: 130px; } }
  `,
  host: { 'data-first-screen': 'ai-notice', role: 'note' },
})
export class ScanPerchComponent {
  readonly mood = input<MascotMood>('happy');
  readonly text = input.required<string>();
  readonly short = input.required<string>();
}
