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
  host: { '[class.pill]': 'pill()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="seg" [class.pill]="pill()" role="radiogroup" [attr.aria-label]="label()">
      @for (o of options(); track o.value) {
        <button type="button" role="radio" [attr.aria-checked]="value() === o.value"
                [class.on]="value() === o.value" (click)="value.set(o.value)">
          {{ o.label }}@if (o.count !== undefined) { <span class="count num">{{ o.count }}</span> }
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

    /* แบบ pill (แท็บ): กว้างตามเนื้อหา ตัวที่เลือก = primary-soft + ตัวอักษรเข้ม (ไม่ใช่สีทึบ) */
    :host(.pill) { display: inline-block; max-width: 100%; }
    .pill {
      display: inline-flex;
      flex-wrap: nowrap;
      gap: var(--yt-space-1);
      padding: var(--yt-space-1);
      border: 2px solid var(--yt-border);
      border-radius: var(--yt-radius-pill);
      background: var(--yt-surface);
    }
    .pill button {
      flex: none;
      padding: var(--yt-space-2) var(--yt-space-5);
      border: 0;
      border-radius: var(--yt-radius-pill);
      background: transparent;
    }
    .pill button:hover { background: var(--yt-primary-softer); }
    .pill button.on { background: var(--yt-primary-soft); color: var(--yt-primary-deep); box-shadow: inset 0 0 0 2px var(--yt-primary); }
  `,
})
export class SegmentedComponent {
  readonly options = input.required<SegmentedOption[]>();
  readonly value = model('');
  readonly label = input('ตัวเลือก');
  /** true = แท็บรูป pill กว้างตามเนื้อหา */
  readonly pill = input(false);
}
