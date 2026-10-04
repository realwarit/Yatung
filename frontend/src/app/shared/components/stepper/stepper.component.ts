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
      <output class="num" aria-live="polite">{{ text() }}</output>
      <button type="button" (appHoldRepeat)="bump(1)" [disabled]="value() >= max()" [attr.aria-label]="'เพิ่ม' + label()">
        <app-icon name="plus" />
      </button>
    </div>
  `,
  styles: `
    :host { display: block; }
    /* [−] ค่า [+] เป็นชุดเดียวในกรอบ pill ใบเดียว */
    .stepper {
      display: inline-flex;
      align-items: center;
      gap: var(--yt-space-1);
      padding: var(--yt-space-1);
      border: 2px solid var(--yt-border-strong);
      border-radius: var(--yt-radius-pill);
      background: var(--yt-surface);
    }
    output {
      min-width: 5.5rem;
      padding: 0 var(--yt-space-2);
      text-align: center;
      font-size: 1.4rem;
      line-height: 1.6;
      color: var(--yt-text);
    }
    button {
      --icon-optical-offset: 0;
      display: grid;
      place-items: center;
      flex: none;
      width: 56px;
      height: 56px;
      border: 0;
      border-radius: 50%;
      background: var(--yt-primary-soft);
      color: var(--yt-primary-deep);
      font-size: 1.5rem;
      cursor: pointer;
      touch-action: manipulation;
      user-select: none;
      transition: background var(--yt-duration), color var(--yt-duration);
    }
    button:hover:not(:disabled), button:active:not(:disabled) { background: var(--yt-primary); color: var(--yt-on-primary); }
    button:disabled { background: var(--yt-field-bg); color: var(--yt-text-muted); cursor: not-allowed; }
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
