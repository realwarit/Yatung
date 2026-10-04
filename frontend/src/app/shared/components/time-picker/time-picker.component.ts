import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { StepperComponent } from '../stepper/stepper.component';

const pad = (n: number) => String(n).padStart(2, '0');

/** ตัวเลือกเวลาตัวใหญ่ (ไม่ใช้ input type=time) — ชั่วโมงทีละ 1, นาทีทีละ 5; ค่าเป็น 'HH:MM' */
@Component({
  selector: 'app-time-picker',
  imports: [StepperComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tp" role="group" [attr.aria-label]="label()">
      <app-stepper [value]="hour()" (valueChange)="set($event, minute())" [min]="0" [max]="23" [step]="1"
                   [display]="pad(hour())" [label]="'ชั่วโมง' + label()" />
      <span class="colon" aria-hidden="true">:</span>
      <app-stepper [value]="minute()" (valueChange)="set(hour(), $event)" [min]="0" [max]="55" [step]="5"
                   [display]="pad(minute())" [label]="'นาที' + label()" />
    </div>
  `,
  styles: `
    :host { display: block; }
    .tp { display: flex; align-items: center; gap: var(--yt-space-3); flex-wrap: wrap; }
    .colon { font: 600 1.6rem / 1 var(--yt-font-display); }
  `,
})
export class TimePickerComponent {
  readonly value = model('08:00');
  readonly label = input('เวลา');
  protected readonly hour = computed(() => Number(this.value().slice(0, 2)) || 0);
  protected readonly minute = computed(() => Number(this.value().slice(3, 5)) || 0);
  protected readonly pad = pad;

  protected set(h: number, m: number): void {
    this.value.set(`${pad(h)}:${pad(m)}`);
  }
}
