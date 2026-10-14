import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';

const DOTS_MS = 600;   // จุด "..." กะพริบก่อนพิมพ์
const TYPE_MS = 28;    // ความเร็วพิมพ์ต่อตัวอักษร

export type BubbleTone = 'neutral' | 'info' | 'warning' | 'success';

/** แบ่งเป็นกลุ่มตัวอักษรที่มองเห็นเป็นหนึ่งตัว (สระ/วรรณยุกต์ไทยไม่แยกจากพยัญชนะ) */
function graphemes(text: string): string[] {
  const Seg = (Intl as { Segmenter?: new (l: string, o: object) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  return Seg ? Array.from(new Seg('th', { granularity: 'grapheme' }).segment(text), x => x.segment) : Array.from(text);
}

/**
 * กรอบคำพูดของน้องยาตรง (D2.5: 1 กล่องต่อหน้า = "ข้อความเรื่องเดียวที่พูดครั้งเดียว")
 * - tone: neutral (ขาว ขอบเขียวอ่อน) · info · warning · success ตาม token `--yt-bubble-*` ; หางชี้ซ้าย/ลง
 * - ข้อความหลัก 15/500 + บรรทัดรอง 13 (`sub`, ไม่บังคับ) ; padding 10×14 radius 16 ; ยืดเต็มพื้นที่ข้างน้องยาตรง ก++ ตัดบรรทัดได้
 * - typing = true (ค่าเดิม ใช้ที่เวทีจอกว้างของ auth): ข้อความเต็มอยู่ใน DOM ตลอด ส่วนที่มองเห็นเป็นชั้นซ้อนที่ "พิมพ์" ทีละตัวหลังจุด "..." ; reduced-motion = แสดงทันที
 * - typing = false (หน้าวันนี้ ฯลฯ ที่ข้อความเปลี่ยนตามสถานะ): แสดงทันที ไม่พิมพ์ซ้ำทุกครั้งที่ตัวเลขเปลี่ยน
 * - live = true → aria-live="polite" (ใช้เฉพาะกล่องที่ข้อความเปลี่ยนตามสถานะ)
 */
@Component({
  selector: 'app-speech-bubble',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // track ที่ข้อความ → เปลี่ยนข้อความแล้วเล่น animation เข้าใหม่ (เฉพาะ typing)
  template: `
    @if (typing()) {
      @for (t of [text()]; track t) {
        <p class="bubble yt-enter">
          <span class="full">{{ t }}</span>
          <span class="typed" aria-hidden="true">
            @if (dots()) { <i class="dot"></i><i class="dot"></i><i class="dot"></i> } @else { {{ shown() }} }
          </span>
        </p>
      }
    } @else {
      <p class="bubble" [attr.aria-live]="live() ? 'polite' : null">
        <span class="t">{{ text() }}</span>
        @if (sub()) { <span class="s">{{ sub() }}</span> }
      </p>
    }
  `,
  styles: `
    :host {
      display: block; --pad-y: 0.625rem; --pad-x: 0.875rem;
      --b-bg: var(--yt-bubble-neutral-bg); --b-fg: var(--yt-bubble-neutral-fg); --b-border: var(--yt-bubble-neutral-border);
    }
    :host(.tone-info) { --b-bg: var(--yt-bubble-info-bg); --b-fg: var(--yt-bubble-info-fg); --b-border: var(--yt-bubble-info-border); }
    :host(.tone-warning) { --b-bg: var(--yt-bubble-warning-bg); --b-fg: var(--yt-bubble-warning-fg); --b-border: var(--yt-bubble-warning-border); }
    :host(.tone-success) { --b-bg: var(--yt-bubble-success-bg); --b-fg: var(--yt-bubble-success-fg); --b-border: var(--yt-bubble-success-border); }
    .bubble {
      position: relative;
      margin: 0;
      padding: var(--pad-y) var(--pad-x);
      background: var(--b-bg);
      color: var(--b-fg);
      border: 1px solid var(--b-border);
      border-radius: 1rem;
      box-shadow: var(--yt-shadow-soft);
      font-family: var(--yt-font-display);
      font-weight: 500;
      font-size: var(--bubble-fs, 0.9375rem);
      line-height: var(--yt-line-height-tight);
      overflow-wrap: anywhere;
      text-wrap: pretty;   // ไม่ให้เหลือคำเดียวโดดๆ บรรทัดสุดท้าย
    }
    :host(.tail-down) .bubble { text-wrap: balance; }
    .t { display: block; }
    .s { display: block; margin-top: 0.125rem; font-family: var(--yt-font-body); font-weight: 400; font-size: 0.8125rem; opacity: 0.9; }
    .full { display: block; opacity: 0; }
    .typed { position: absolute; top: var(--pad-y); left: var(--pad-x); right: var(--pad-x); }
    .dot {
      display: inline-block; width: 0.45rem; height: 0.45rem; margin: 0.4rem 0.2rem 0 0; border-radius: 50%;
      background: var(--yt-text-muted); animation: blink 600ms ease-in-out infinite;
    }
    .dot:nth-child(2) { animation-delay: 150ms; }
    .dot:nth-child(3) { animation-delay: 300ms; }
    @keyframes blink { 50% { opacity: 0.25; } }
    // หาง = สี่เหลี่ยมหมุน 45° มีขอบเฉพาะสองด้านที่ยื่นออก (ต่อเนื่องกับขอบกล่อง)
    .bubble::before {
      content: ''; position: absolute; width: 0.75rem; height: 0.75rem; background: var(--b-bg);
      border: 1px solid var(--b-border); border-radius: 2px; transform: rotate(45deg);
    }
    :host(.tail-left) .bubble::before { top: 50%; left: -0.4rem; margin-top: -0.375rem; border-right: 0; border-top: 0; }
    :host(.tail-down) .bubble::before { bottom: -0.4rem; left: 50%; margin-left: -0.375rem; border-left: 0; border-top: 0; }
    :host(.tail-down-left) .bubble::before { bottom: -0.4rem; left: 1.5rem; border-left: 0; border-top: 0; }
  `,
  host: { '[class.tail-left]': 'tail() === "left"', '[class.tail-down]': 'tail() === "down"', '[class.tone-info]': 'tone() === "info"', '[class.tone-warning]': 'tone() === "warning"', '[class.tone-success]': 'tone() === "success"' },
})
export class SpeechBubbleComponent {
  readonly text = input.required<string>();
  readonly tail = input<'left' | 'down'>('left');
  readonly tone = input<BubbleTone>('neutral');
  /** บรรทัดรอง 13px (ไม่บังคับ) */
  readonly sub = input<string | null>(null);
  /** พิมพ์ทีละตัว (ค่าเดิม) — ปิดสำหรับกล่องที่ข้อความเปลี่ยนตามสถานะ */
  readonly typing = input(true);
  /** aria-live="polite" เฉพาะกล่องที่ข้อความเปลี่ยนตามสถานะ (ใช้กับ typing = false) */
  readonly live = input(false);

  protected readonly dots = signal(false);
  protected readonly shown = signal('');

  constructor() {
    effect((onCleanup) => {
      if (!this.typing()) return;
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
