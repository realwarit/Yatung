import { ChangeDetectionStrategy, Component } from '@angular/core';

/** เนิน 3 ชั้น + ดอกไม้โยก 4 ดอก (ตกแต่งล้วน) ; ความสูงตาม `--hill-h` ที่หน้า /welcome กำหนด ; เนินยืดตามความกว้างจอ ดอกไม้ไม่ยืด */
@Component({
  selector: 'app-welcome-hills',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <svg class="hill h1" viewBox="0 0 384 272" preserveAspectRatio="none"><path d="M0 70C70 20 150 30 210 55C270 80 330 30 384 45V272H0Z"/></svg>
    <svg class="hill h2" viewBox="0 0 384 272" preserveAspectRatio="none"><path d="M0 120C60 80 130 44 200 44C270 44 330 86 384 100V272H0Z"/></svg>
    <svg class="flowers" viewBox="0 0 384 272" preserveAspectRatio="xMidYMax meet">
      @for (f of flowers; track $index) {
        <g class="sway" [style.animation-delay.s]="f.d">
          <path class="stem" [attr.d]="'M' + f.x + ' ' + f.y + 'V' + (f.y - 14)"/>
          <circle [class]="'bloom ' + f.c" [attr.cx]="f.x" [attr.cy]="f.y - 16" [attr.r]="f.r"/>
          <circle class="eye" [attr.cx]="f.x" [attr.cy]="f.y - 16" r="1.7"/>
        </g>
      }
    </svg>
    <svg class="hill h3" viewBox="0 0 384 272" preserveAspectRatio="none"><path d="M0 170C90 130 290 128 384 162V272H0Z"/></svg>
  `,
  styles: `
    :host { position: absolute; inset: auto 0 0 0; height: var(--hill-h); }
    svg { display: block; overflow: visible; }
    .hill, .flowers { position: absolute; inset: 0; width: 100%; height: 100%; animation: hill-up 1s cubic-bezier(0.22, 1, 0.36, 1) both; }
    .h1 { animation-delay: 0.15s; } .h1 path { fill: var(--yt-primary-soft-strong); }
    .h2, .flowers { animation-delay: 0.3s; } .h2 path { fill: var(--yt-wc-hill-mid); }
    .h3 { animation-delay: 0.45s; } .h3 path { fill: var(--yt-primary); }
    .sway { transform-box: fill-box; transform-origin: 50% 100%; animation: sway 3s ease-in-out infinite; }
    .stem { fill: none; stroke: var(--yt-primary); stroke-width: 2.5; stroke-linecap: round; }
    .bloom.amber { fill: var(--yt-accent); }
    .bloom.pink { fill: var(--yt-mascot-cheek); }
    .eye { fill: var(--yt-mascot-bottom); }
    @keyframes hill-up { from { transform: translateY(calc(var(--hill-h) * 0.5)); } }
    @keyframes sway { 0%, 100% { transform: rotate(-7deg); } 50% { transform: rotate(7deg); } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
  `,
})
export class WelcomeHillsComponent {
  protected readonly flowers = [
    { x: 58, y: 116, r: 5, c: 'amber', d: 0 }, { x: 88, y: 100, r: 4.5, c: 'pink', d: -1 },
    { x: 300, y: 90, r: 4.5, c: 'pink', d: -2 }, { x: 334, y: 104, r: 5, c: 'amber', d: -0.5 },
  ];
}
