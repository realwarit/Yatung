import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MascotComponent } from '../../../shared/components/mascot/mascot.component';
import { SpeechBubbleComponent } from '../../../shared/components/speech-bubble/speech-bubble.component';

const TEXT = 'น้องยาตรงช่วยอ่านซองยาให้นะคะ แต่อาจอ่านผิดได้ ตรวจทุกช่องก่อนบันทึกนะคะ';

/**
 * คำเตือนเรื่อง AI พูดโดยน้องยาตรง (D2.5 B1): กล่องคำพูด info (หางชี้ซ้าย) ข้างน้องยาตรง M แทนแถบฟ้า
 * จอกว้าง (container scan ≥ 720px) = คอลัมน์ซ้าย: น้องยาตรง L ใต้กล่องคำพูด (หางชี้ลง)
 */
@Component({
  selector: 'app-scan-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MascotComponent, SpeechBubbleComponent],
  template: `
    <app-mascot class="m" mood="happy" size="m" />
    <app-mascot class="l" mood="happy" size="l" />
    <app-speech-bubble class="b b-side" tone="info" tail="left" [typing]="false" [text]="text" />
    <app-speech-bubble class="b b-top" tone="info" tail="down" [typing]="false" [text]="text" />
  `,
  styles: `
    :host { display: flex; align-items: center; gap: var(--yt-space-3); }
    app-mascot { flex: none; }
    .b { flex: 1; min-width: 0; }
    .l, .b-top { display: none; }
    @container scan (min-width: 720px) {
      :host { flex-direction: column-reverse; align-items: stretch; gap: var(--yt-space-4); text-align: center; }
      .m, .b-side { display: none; }
      .l { display: block; align-self: center; }
      .b-top { display: block; flex: none; }
    }
  `,
  host: { 'data-first-screen': 'ai-notice', role: 'note' },
})
export class ScanNoticeComponent {
  protected readonly text = TEXT;
}
