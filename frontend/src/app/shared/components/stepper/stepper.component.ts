import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { HoldRepeatDirective } from '../../directives/hold-repeat.directive';
import { IconComponent } from '../../icon.component';

/** ปุ่ม − / + ใหญ่ๆ พร้อมตัวเลขตรงกลาง (ใช้กับปริมาณยา จำนวนเติมยา เวลา) */
@Component({
  selector: 'app-stepper',
  imports: [IconComponent, HoldRepeatDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stepper" role="group" [attr.aria-label]="label()">
      <button type="button" (appHoldRepeat)="bump(-1)" [disabled]="value() <= min()" [attr.aria-label]="'ลด' + label()">
        <app-icon name="minus" />
      </button>
      <output aria-live="polite">{{ text() }}</output>
      <button type="button" (appHoldRepeat)="bump(1)" [disabled]="value() >= max()" [attr.aria-label]="'เพิ่ม' + label()">
        <app-icon name="plus" />
      </button>
    </div>
  `,
  styles: `
    :host { display: block; }
    .stepper { display: flex; align-items: center; gap: var(--yt-space-3); }
    output {
      flex: 1;
      min-width: 3.5rem;
      text-align: center;
      font: 600 1.6rem / 1.6 var(--yt-font-display);
      color: var(--yt-text);
    }
    button {
      display: grid;
      place-items: center;
      width: var(--yt-tap);
      height: var(--yt-tap);
      border: 2px solid var(--yt-primary);
      border-radius: var(--yt-radius-pill);
      background: var(--yt-surface);
      color: var(--yt-primary-dark);
      font-size: 1.1rem;
      cursor: pointer;
      touch-action: manipulation;
      user-select: none;
      transition: background var(--yt-duration);
    }
    button:hover:not(:disabled) { background: var(--yt-primary-soft); }
    button:active:not(:disabled) { background: var(--yt-primary-soft); }
    button:disabled { border-color: var(--yt-border); color: var(--yt-text-muted); cursor: not-allowed; }
  `,
})
export class StepperComponent {
  readonly value = model(0);
  readonly step = input(1);
  readonly min = input(0);
  readonly max = input(999);
  /** ข้อความตัวเลขที่แสดง (ไม่ระบุ = ค่าตัวเลขตรงๆ) */
  readonly display = input<string | null>(null);
  readonly label = input('จำนวน');

  protected readonly text = computed(() => this.display() ?? String(this.value()));

  protected bump(dir: 1 | -1): void {
    const next = Math.round((this.value() + dir * this.step()) * 100) / 100;
    this.value.set(Math.min(this.max(), Math.max(this.min(), next)));
  }
}
