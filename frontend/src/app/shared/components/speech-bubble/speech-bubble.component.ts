import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** กรอบคำพูดของน้องยาตรง — เป็นของตกแต่ง (aria-hidden); ข้อความสำคัญต้องมีในหน้าด้วย เช่น role="alert" */
@Component({
  selector: 'app-speech-bubble',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // track ที่ข้อความ → เปลี่ยนข้อความแล้วเล่น animation เข้าใหม่
  template: `@for (t of [text()]; track t) { <p class="bubble yt-enter">{{ t }}</p> }`,
  styles: `
    :host { display: block; }
    .bubble {
      position: relative;
      margin: 0;
      padding: var(--yt-space-3) var(--yt-space-5);
      background: var(--yt-surface);
      color: var(--yt-text);
      border-radius: var(--yt-radius-md);
      box-shadow: var(--yt-shadow-md);
      font-family: var(--yt-font-display);
      font-weight: 500;
      font-size: 1rem;   // 18px ที่สเกล 100%
      line-height: var(--yt-line-height-tight);
    }
    .bubble::before {
      content: '';
      position: absolute;
      width: 1rem;
      height: 1rem;
      background: inherit;
      border-radius: 3px;
    }
    // หางชี้ไปทางซ้าย (มือถือ: น้องอยู่ซ้ายของกรอบ)
    :host(.tail-left) .bubble::before { top: 50%; left: -0.4rem; transform: translateY(-50%) rotate(45deg); }
    // หางชี้ลงซ้าย (จอกว้าง: กรอบอยู่เหนือขวาของหัว ชี้เข้าหาปาก)
    :host(.tail-down) .bubble::before { bottom: -0.4rem; left: 1.6rem; transform: rotate(45deg); }
  `,
  host: { 'aria-hidden': 'true', '[class.tail-left]': 'tail() === "left"', '[class.tail-down]': 'tail() === "down"' },
})
export class SpeechBubbleComponent {
  readonly text = input.required<string>();
  readonly tail = input<'left' | 'down'>('left');
}
