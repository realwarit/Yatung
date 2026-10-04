import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const R = 52;
const C = 2 * Math.PI * R;

/** วงแหวนความคืบหน้า "กินแล้ว x จาก y" */
@Component({
  selector: 'app-progress-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 120 120" role="img" [attr.aria-label]="'กินแล้ว ' + done() + ' จาก ' + total()">
      <circle class="track" cx="60" cy="60" [attr.r]="r" />
      <circle class="bar" cx="60" cy="60" [attr.r]="r" [attr.stroke-dasharray]="dash()" transform="rotate(-90 60 60)" />
      <text x="60" y="62" text-anchor="middle" dominant-baseline="middle" class="num">{{ done() }}/{{ total() }}</text>
    </svg>
  `,
  styles: `
    :host { display: inline-block; width: 8.5rem; flex: none; }
    svg { display: block; width: 100%; height: auto; }
    circle { fill: none; stroke-width: 12; }
    .track { stroke: var(--yt-primary-soft); }
    .bar { stroke: var(--yt-primary); stroke-linecap: round; transition: stroke-dasharray 400ms var(--yt-ease); }
    :host(.complete) .bar { stroke: var(--yt-success); }
    .num { font: 600 28px var(--yt-font-display); fill: var(--yt-text); }
  `,
  host: { '[class.complete]': 'total() > 0 && done() >= total()' },
})
export class ProgressRingComponent {
  readonly done = input(0);
  readonly total = input(0);
  protected readonly r = R;
  protected readonly dash = computed(() => {
    const frac = this.total() > 0 ? Math.min(1, this.done() / this.total()) : 0;
    return `${frac * C} ${C}`;
  });
}
