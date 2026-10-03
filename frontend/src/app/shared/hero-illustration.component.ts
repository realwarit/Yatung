import { ChangeDetectionStrategy, Component } from '@angular/core';

/** ภาพประกอบวาดเอง: ซองยากับนาฬิกาปลุก (ไม่ใช้ตัวการ์ตูน/โลโก้ที่มีลิขสิทธิ์) */
@Component({
  selector: 'app-hero-illustration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 360 260" role="img" aria-label="ภาพซองยากับนาฬิกาปลุก">
      <circle class="halo" cx="180" cy="140" r="112" />
      <path class="spark" d="M54 62l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" />
      <path class="spark" d="M312 44l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
      <circle class="dot" cx="300" cy="226" r="5" />
      <circle class="dot" cx="40" cy="190" r="4" />

      <g transform="rotate(-8 140 140)">
        <rect class="paper" x="62" y="64" width="158" height="148" rx="18" />
        <path class="top" d="M62 82a18 18 0 0 1 18-18h122a18 18 0 0 1 18 18v10H62z" />
        <path class="tear" d="M62 92h158" />
        <rect class="line-strong" x="86" y="112" width="84" height="11" rx="5.5" />
        <rect class="line" x="86" y="134" width="112" height="9" rx="4.5" />
        <rect class="line" x="86" y="152" width="92" height="9" rx="4.5" />
        <g transform="translate(86 172)">
          <rect class="cap-a" x="0" y="0" width="52" height="22" rx="11" />
          <path class="cap-b" d="M26 0h15a11 11 0 0 1 0 22H26z" />
        </g>
        <circle class="ok" cx="198" cy="116" r="15" />
        <path class="tick" d="m191 116.5 5 5 9-10" />
      </g>

      <g transform="translate(266 156)">
        <circle class="bell" cx="-34" cy="-54" r="15" />
        <circle class="bell" cx="34" cy="-54" r="15" />
        <path class="leg" d="M-30 46l-12 18M30 46l12 18" />
        <circle class="clock-rim" r="54" />
        <circle class="clock-face" r="44" />
        <path class="tick-mark" d="M0 -36v6M36 0h-6M0 36v-6M-36 0h6" />
        <path class="hand" d="M0 0V-26" />
        <path class="hand" d="M0 0L18 10" />
        <circle class="pin" r="5" />
      </g>
    </svg>
  `,
  styles: `
    :host { display: block; }
    svg { display: block; width: 100%; height: auto; }
    .halo { fill: var(--yt-on-primary); opacity: 0.12; }
    .spark, .dot { fill: var(--yt-accent); }
    .paper { fill: var(--yt-surface); }
    .top { fill: var(--yt-primary-soft); }
    .tear { stroke: var(--yt-primary); stroke-width: 2; stroke-dasharray: 6 6; fill: none; }
    .line-strong { fill: var(--yt-primary); }
    .line { fill: var(--yt-border); }
    .cap-a { fill: var(--yt-accent); }
    .cap-b { fill: var(--yt-primary-soft); stroke: var(--yt-primary); stroke-width: 2; }
    .ok { fill: var(--yt-success); }
    .tick { fill: none; stroke: var(--yt-on-primary); stroke-width: 3.5; stroke-linecap: round; stroke-linejoin: round; }
    .bell { fill: var(--yt-accent); }
    .leg { stroke: var(--yt-accent); stroke-width: 7; stroke-linecap: round; fill: none; }
    .clock-rim { fill: var(--yt-accent); }
    .clock-face { fill: var(--yt-surface); }
    .tick-mark { stroke: var(--yt-text-muted); stroke-width: 4; stroke-linecap: round; fill: none; }
    .hand { stroke: var(--yt-primary-dark); stroke-width: 5; stroke-linecap: round; fill: none; }
    .pin { fill: var(--yt-primary-dark); }
  `,
})
export class HeroIllustrationComponent {}
