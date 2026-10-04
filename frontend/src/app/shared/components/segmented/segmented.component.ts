import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface SegmentedOption {
  value: string;
  label: string;
  /** จำนวนที่แสดงเป็นป้ายเล็กๆ (เช่น จำนวนยาในแท็บ) */
  count?: number;
}

/** ปุ่มเลือก 1 ใน N แบบแบ่งช่อง (radiogroup) — ใช้เป็นแท็บและตัวเลือกก่อน/หลังอาหาร */
@Component({
  selector: 'app-segmented',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="seg" role="radiogroup" [attr.aria-label]="label()">
      @for (o of options(); track o.value) {
        <button type="button" role="radio" [attr.aria-checked]="value() === o.value"
                [class.on]="value() === o.value" (click)="value.set(o.value)">
          {{ o.label }}@if (o.count !== undefined) { <span class="count">{{ o.count }}</span> }
        </button>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .seg {
      display: flex;
      flex-wrap: wrap;
      gap: var(--yt-space-2);
    }
    button {
      flex: 1 1 8rem;
      min-height: var(--yt-tap);
      padding: var(--yt-space-2) var(--yt-space-4);
      border: 2px solid var(--yt-border-strong);
      border-radius: var(--yt-radius-field);
      background: var(--yt-surface);
      color: var(--yt-text);
      font: 500 1rem / 1.6 var(--yt-font-body);
      cursor: pointer;
      transition: background var(--yt-duration), border-color var(--yt-duration);
    }
    button:hover { background: var(--yt-primary-softer); }
    button.on {
      border-color: var(--yt-primary);
      background: var(--yt-primary);
      color: var(--yt-on-primary);
      font-weight: 600;
    }
    .count { margin-left: var(--yt-space-2); opacity: 0.85; }
  `,
})
export class SegmentedComponent {
  readonly options = input.required<SegmentedOption[]>();
  readonly value = model('');
  readonly label = input('ตัวเลือก');
}
