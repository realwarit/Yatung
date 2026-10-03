import { ChangeDetectionStrategy, Component } from '@angular/core';

/** ไอคอนมือโบก (flat สี primary) ใช้แทนอีโมจิ 👋 — โบกครั้งเดียวตอนโหลด ปิดเมื่อ prefers-reduced-motion */
@Component({
  selector: 'app-wave-hand',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <g class="hand">
        <!-- นิ้วและนิ้วโป้ง = เส้นหนาปลายมน สีเดียวกันซ้อนกันเป็นรูปมือ -->
        <g class="digits">
          <path d="M11 15V8.5M15.5 14V5M20 14.5V7M24 17V11.5" />
          <path d="M11 18 7 13.5" />
        </g>
        <path class="palm" d="M10.5 16h14.2c.3 5.5-2.6 11-8.6 11-4.600 0-6.700-3.700-5.600-11z" />
      </g>
      <path class="lines" d="M5 6.500c-1.200 1.300-1.700 3-1.300 4.800M27.500 4.500c1.700 1 2.700 2.600 3 4.400" />
    </svg>
  `,
  styles: `
    :host { display: inline-block; width: 1.1em; height: 1.1em; vertical-align: -0.12em; }
    svg { display: block; width: 100%; height: 100%; overflow: visible; }
    .digits path { fill: none; stroke: var(--yt-primary); stroke-width: 4; stroke-linecap: round; }
    .palm { fill: var(--yt-primary); }
    .lines { fill: none; stroke: var(--yt-peach); stroke-width: 2; stroke-linecap: round; }
    .hand { transform-origin: 16px 26px; animation: wave 1.1s ease-in-out 0.3s 1 both; }
    @keyframes wave {
      0%, 100% { transform: rotate(0); }
      25% { transform: rotate(16deg); }
      50% { transform: rotate(-12deg); }
      75% { transform: rotate(10deg); }
    }
    @media (prefers-reduced-motion: reduce) { .hand { animation: none; } }
  `,
})
export class WaveHandComponent {}
