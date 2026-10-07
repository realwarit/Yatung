import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { HoldRepeatDirective } from '../../directives/hold-repeat.directive';
import { IconComponent, IconName } from '../../icon.component';
import { TimeInputDialogComponent } from './time-input-dialog.component';

const STEP_MIN = 15;
const DAY_MIN = 24 * 60;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * แถวตั้งเวลา: ไอคอน + ชื่อมื้อ แล้วแถว [−] 08:00 [+] — ทีละ 15 นาที วนรอบ 24 ชม. กดค้างเปลี่ยนต่อเนื่อง
 * กดที่ตัวเลขเวลาเพื่อพิมพ์เองได้; error = ข้อความเตือนใต้แถว (ผู้เรียกเป็นคนตรวจลำดับ)
 */
@Component({
  selector: 'app-time-row',
  imports: [IconComponent, HoldRepeatDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="name"><app-icon [name]="icon()" /> {{ label() }}</p>
    <div class="ctl" role="group" [attr.aria-label]="'เวลามื้อ' + label()">
      <button type="button" class="step" (appHoldRepeat)="bump(-1)" [attr.aria-label]="'ลดเวลามื้อ' + label() + ' 15 นาที'">
        <app-icon name="minus" />
      </button>
      <button type="button" class="time num" [class.bad]="error()" (click)="edit()" [attr.aria-label]="'เวลามื้อ' + label() + ' ' + value() + ' กดเพื่อพิมพ์เวลาเอง'">
        {{ value() }}
      </button>
      <button type="button" class="step" (appHoldRepeat)="bump(1)" [attr.aria-label]="'เพิ่มเวลามื้อ' + label() + ' 15 นาที'">
        <app-icon name="plus" />
      </button>
    </div>
    @if (error()) {
      <p class="yt-error-text" role="alert"><app-icon name="alert" /> {{ error() }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    .name { display: flex; align-items: center; gap: var(--yt-space-2); margin: 0 0 var(--yt-space-2); font-weight: 600; color: var(--yt-primary-dark); }
    .ctl { display: flex; align-items: center; gap: var(--yt-space-3); }
    .step {
      --icon-optical-offset: 0;
      display: grid;
      place-items: center;
      flex: none;
      width: 56px;
      height: 56px;
      font-size: 1.5rem;
      border: 2px solid var(--yt-primary);
      border-radius: 50%;
      background: var(--yt-surface);
      color: var(--yt-primary-dark);
      cursor: pointer;
      touch-action: manipulation;
      user-select: none;
      &:hover { background: var(--yt-primary-soft); }
      &:active { background: var(--yt-primary-soft); }
    }
    .time {
      flex: 1;
      min-height: 56px;
      border: 2px dashed transparent;
      border-radius: var(--yt-radius-field);
      background: transparent;
      color: var(--yt-text);
      font-size: 2rem;   /* 32px ที่สเกล 100% (ฟอนต์/น้ำหนักมาจาก .num) */
      line-height: 1.6;
      text-align: center;
      cursor: pointer;
      &:hover { border-color: var(--yt-border-strong); }
      &.bad { color: var(--yt-danger); border-color: var(--yt-danger); }
    }
  `,
})
export class TimeRowComponent {
  readonly value = model('08:00');
  readonly label = input.required<string>();
  readonly icon = input.required<IconName>();
  readonly error = input<string | null>(null);

  private dialog = inject(MatDialog);
  protected readonly minutes = computed(() => Number(this.value().slice(0, 2)) * 60 + Number(this.value().slice(3, 5)));

  protected bump(dir: 1 | -1): void {
    // ปัดเข้าช่อง 15 นาทีก่อน (เช่น 08:07 → 08:15 ตอนกด +) แล้ววนรอบ 24 ชม.
    const cur = this.minutes();
    const snapped = dir === 1 ? Math.floor(cur / STEP_MIN) * STEP_MIN + STEP_MIN : Math.ceil(cur / STEP_MIN) * STEP_MIN - STEP_MIN;
    const next = ((snapped % DAY_MIN) + DAY_MIN) % DAY_MIN;
    this.value.set(`${pad(Math.floor(next / 60))}:${pad(next % 60)}`);
  }

  protected edit(): void {
    this.dialog.open<TimeInputDialogComponent, { title: string; value: string }, string>(TimeInputDialogComponent, {
      width: '24rem', maxWidth: '92vw', autoFocus: 'input',
      data: { title: `เวลามื้อ${this.label()}`, value: this.value() },
    }).afterClosed().subscribe((t) => { if (t) this.value.set(t); });
  }
}
