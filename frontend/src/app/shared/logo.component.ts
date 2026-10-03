import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** โลโก้ยาตรง: เม็ดยาแคปซูลมุมมน + เครื่องหมายถูก, ตามด้วยคำว่า "ยาตรง" (Mitr) */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect class="tile" x="0" y="0" width="48" height="48" rx="14" />
      <g transform="rotate(-40 24 24)">
        <rect class="cap-a" x="7" y="15" width="34" height="18" rx="9" />
        <path class="cap-b" d="M24 15h8a9 9 0 0 1 0 18h-8z" />
      </g>
      <circle class="badge" cx="36" cy="36" r="9" />
      <path class="tick" d="m31.8 36.2 3 3 5.2-6" />
    </svg>
    @if (!iconOnly()) { <span class="word">ยาตรง</span> }
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: var(--yt-space-3); }
    svg { width: 2.4rem; height: 2.4rem; flex: none; }
    .word { font-family: var(--yt-font-display); font-weight: 600; font-size: 1.6rem; line-height: 1.6; }

    // บนพื้นอ่อน
    :host(.on-light) { color: var(--yt-primary-dark); }
    :host(.on-light) .tile { fill: var(--yt-primary); }
    :host(.on-light) .cap-a { fill: var(--yt-surface); }
    :host(.on-light) .cap-b { fill: var(--yt-primary-soft); }
    // บนพื้นเข้ม
    :host(.on-dark) { color: var(--yt-on-primary); }
    :host(.on-dark) .tile { fill: var(--yt-surface); }
    :host(.on-dark) .cap-a { fill: var(--yt-primary); }
    :host(.on-dark) .cap-b { fill: var(--yt-primary-deep); }

    // ขนาดใหญ่ (หัวหน้าจอบนจอกว้าง): ไอคอน ~56px ตัวอักษร ~32px
    @media (min-width: 1024px) {
      :host(.lg) svg { width: 3.1rem; height: 3.1rem; }
      :host(.lg) .word { font-size: 1.8rem; }
    }

    .badge { fill: var(--yt-accent); }
    .tick { fill: none; stroke: var(--yt-on-accent); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
  `,
  host: { '[class.lg]': 'large()', '[class.on-light]': 'tone() === "light"', '[class.on-dark]': 'tone() === "dark"' },
})
export class LogoComponent {
  /** 'light' = วางบนพื้นอ่อน, 'dark' = วางบนพื้น primary */
  readonly tone = input<'light' | 'dark'>('light');
  readonly iconOnly = input(false);
  /** ขยายเมื่อจอ ≥ 1024px */
  readonly large = input(false);
}
