import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';

const DOTS_MS = 600;   // จุด "..." กะพริบก่อนพิมพ์
const TYPE_MS = 28;    // ความเร็วพิมพ์ต่อตัวอักษร

/** แบ่งเป็นกลุ่มตัวอักษรที่มองเห็นเป็นหนึ่งตัว (สระ/วรรณยุกต์ไทยไม่แยกจากพยัญชนะ) */
function graphemes(text: string): string[] {
  const Seg = (Intl as { Segmenter?: new (l: string, o: object) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  return Seg ? Array.from(new Seg('th', { granularity: 'grapheme' }).segment(text), x => x.segment) : Array.from(text);
}

/**
 * กรอบคำพูดของน้องยาตรง — ข้อความเต็มอยู่ใน DOM ตลอด (ให้ screen reader อ่านได้ครบ, กำหนดขนาดกรอบตั้งแต่แรก)
 * ส่วนที่มองเห็นเป็นชั้นซ้อนที่ "พิมพ์" ทีละตัวหลังจุด "..." กะพริบ; reduced-motion = แสดงทันที
 */
@Component({
  selector: 'app-speech-bubble',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // track ที่ข้อความ → เปลี่ยนข้อความแล้วเล่น animation เข้าใหม่
  template: `
    @for (t of [text()]; track t) {
      <p class="bubble yt-enter">
        <span class="full">{{ t }}</span>
        <span class="typed" aria-hidden="true">
          @if (dots()) { <i class="dot"></i><i class="dot"></i><i class="dot"></i> } @else { {{ shown() }} }
        </span>
      </p>
    }
  `,
  styles: `
    :host { display: block; --pad-y: var(--yt-space-3); --pad-x: var(--yt-space-5); }
    .bubble {
      position: relative;
      margin: 0;
      padding: var(--pad-y) var(--pad-x);
      background: var(--yt-surface);
      color: var(--yt-text);
      border-radius: 20px;
      box-shadow: var(--yt-shadow-md);
      font-family: var(--yt-font-display);
      font-weight: 500;
      font-size: 1rem;   // 18px ที่สเกล 100%
      line-height: var(--yt-line-height-tight);
      text-wrap: pretty;   // ไม่ให้เหลือคำเดียวโดดๆ บรรทัดสุดท้าย
    }
    .full { display: block; opacity: 0; }
    .typed { position: absolute; top: var(--pad-y); left: var(--pad-x); right: var(--pad-x); }
    .dot {
      display: inline-block;
      width: 0.45rem;
      height: 0.45rem;
      margin: 0.55rem 0.2rem 0 0;
      border-radius: 50%;
      background: var(--yt-text-muted);
      animation: blink 600ms ease-in-out infinite;
    }
    .dot:nth-child(2) { animation-delay: 150ms; }
    .dot:nth-child(3) { animation-delay: 300ms; }
    @keyframes blink { 50% { opacity: 0.25; } }
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
  host: { '[class.tail-left]': 'tail() === "left"', '[class.tail-down]': 'tail() === "down"' },
})
export class SpeechBubbleComponent {
  readonly text = input.required<string>();
  readonly tail = input<'left' | 'down'>('left');

  protected readonly dots = signal(false);
  protected readonly shown = signal('');

  constructor() {
    effect((onCleanup) => {
      const full = this.text();
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        this.dots.set(false);
        this.shown.set(full);
        return;
      }
      const chars = graphemes(full);
      let n = 0;
      let typer: ReturnType<typeof setInterval> | undefined;
      this.dots.set(true);
      this.shown.set('');
      const wait = setTimeout(() => {
        this.dots.set(false);
        typer = setInterval(() => {
          n++;
          this.shown.set(chars.slice(0, n).join(''));
          if (n >= chars.length) clearInterval(typer);
        }, TYPE_MS);
      }, DOTS_MS);
      onCleanup(() => { clearTimeout(wait); clearInterval(typer); });
    });
  }
}
