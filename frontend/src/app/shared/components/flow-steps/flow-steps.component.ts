import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../../icon.component';

/** ตัวบอกขั้นตอน ① ② ③ — ขั้นก่อนหน้า = ✓, ขั้นปัจจุบัน = เข้ม, ขั้นถัดไป = จาง (อ่านออกเสียงได้ครบ ไม่ใช้สีอย่างเดียว) */
@Component({
  selector: 'app-flow-steps',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="steps" aria-label="ขั้นตอน">
      @for (l of labels(); track l; let i = $index) {
        <li class="step" [attr.data-state]="i < current() ? 'done' : i === current() ? 'now' : 'next'"
            [attr.aria-current]="i === current() ? 'step' : null">
          <span class="mark num" aria-hidden="true">@if (i < current()) { <app-icon name="check" /> } @else { {{ i + 1 }} }</span>
          <span class="label">{{ l }}</span>
          <span class="sr-only">{{ i < current() ? ' เสร็จแล้ว' : i === current() ? ' ขั้นตอนปัจจุบัน' : '' }}</span>
        </li>
      }
    </ol>
  `,
  styles: `
    :host { display: block; }
    .steps { display: flex; flex-wrap: wrap; gap: var(--yt-space-2) var(--yt-space-4); margin: 0; padding: 0; list-style: none; }
    .step { display: flex; align-items: center; gap: var(--yt-space-2); color: var(--yt-text-muted); font-weight: 500; }
    .mark {
      --icon-optical-offset: 0;
      display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: 50%;
      border: 2px solid var(--yt-border-strong); background: var(--yt-surface); font-size: var(--yt-text-sm); line-height: 1;
    }
    .step[data-state='now'] { color: var(--yt-primary-deep); font-weight: 600; }
    .step[data-state='now'] .mark { border-color: var(--yt-primary); background: var(--yt-primary); color: var(--yt-on-primary); }
    .step[data-state='done'] { color: var(--yt-primary-deep); }
    .step[data-state='done'] .mark { border-color: var(--yt-primary); background: var(--yt-primary-soft); color: var(--yt-primary-deep); }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
})
export class FlowStepsComponent {
  readonly labels = input.required<string[]>();
  /** ลำดับขั้นปัจจุบัน เริ่มที่ 0 */
  readonly current = input(0);
}
