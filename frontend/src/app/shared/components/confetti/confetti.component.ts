import { ChangeDetectionStrategy, Component } from '@angular/core';

/** confetti สั้นๆ ครั้งเดียว (ผู้ใช้ที่ตั้ง prefers-reduced-motion จะไม่เห็น) — ผู้เรียกเป็นคนเอาออกหลัง ~2 วินาที */
@Component({
  selector: 'app-confetti',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (p of pieces; track $index) {
      <i [style.left.%]="p.x" [style.animation-delay.ms]="p.delay" [style.--drift.px]="p.drift" [class]="'c' + p.c"></i>
    }
  `,
  styles: `
    :host { position: fixed; inset: 0; z-index: 2000; overflow: hidden; pointer-events: none; }
    i {
      position: absolute;
      top: -16px;
      width: 10px;
      height: 16px;
      border-radius: 3px;
      animation: fall 1500ms var(--yt-ease) both;
    }
    .c0 { background: var(--yt-primary); }
    .c1 { background: var(--yt-amber); }
    .c2 { background: var(--yt-peach); }
    .c3 { background: var(--yt-mint-mid); }
    @keyframes fall {
      from { transform: translate(0, 0) rotate(0); opacity: 1; }
      to   { transform: translate(var(--drift), 105vh) rotate(540deg); opacity: 0; }
    }
  `,
})
export class ConfettiComponent {
  protected readonly pieces = Array.from({ length: 36 }, (_, i) => ({
    x: (i * 100) / 36 + ((i * 7) % 5),
    delay: (i * 53) % 400,
    drift: ((i * 37) % 120) - 60,
    c: i % 4,
  }));
}
