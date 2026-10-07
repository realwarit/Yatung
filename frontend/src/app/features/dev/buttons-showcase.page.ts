import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { FontSizeToggleComponent } from '../../shared/font-size-toggle.component';
import { IconComponent, IconName } from '../../shared/icon.component';

/** ข้อความที่มีสระบน/วรรณยุกต์ และที่ไม่มี — ใช้ตรวจว่าไอคอนอยู่กึ่งกลางข้อความทั้งสองแบบ */
const TEXTS = [
  { kind: 'มีสระบน/วรรณยุกต์', label: 'กินแล้ว' },
  { kind: 'มีสระบน/วรรณยุกต์', label: 'ตั้งค่า' },
  { kind: 'ไม่มีสระบน', label: 'ตามเวลา' },
  { kind: 'ไม่มีสระบน', label: 'ลบยา' },
];

/** หน้าตรวจปุ่มทุกแบบ (เปิดเฉพาะ dev — ดู app.routes.ts) เส้นแดง = กึ่งกลางแนวตั้งของกล่อง */
@Component({
  selector: 'app-buttons-showcase',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, IconComponent, FontSizeToggleComponent],
  template: `
    <header class="head">
      <h1>ปุ่มทุกแบบ <small>/dev/buttons</small></h1>
      <app-font-size-toggle />
    </header>
    <label class="guides"><input type="checkbox" [checked]="guides()" (change)="guides.set(!guides())" /> แสดงเส้นกึ่งกลาง</label>

    @for (t of texts; track t.label) {
      <section [class.guides-on]="guides()">
        <h2>“{{ t.label }}” <span>{{ t.kind }}</span></h2>
        <div class="row">
          <div class="g"><button mat-flat-button type="button"><app-icon name="check" /> {{ t.label }}</button></div>
          <div class="g"><button mat-stroked-button type="button"><app-icon name="plus" /> {{ t.label }}</button></div>
          <div class="g"><button mat-flat-button type="button" class="quiet"><app-icon name="edit" /> {{ t.label }}</button></div>
          <div class="g"><button mat-flat-button type="button" disabled><app-icon name="check" /> {{ t.label }}</button></div>
          <div class="g"><a mat-flat-button href="javascript:void 0"><app-icon name="camera" /> {{ t.label }}</a></div>
          <div class="g"><button type="button" class="cta"><app-icon name="camera" /> {{ t.label }}</button></div>
          <div class="g"><button type="button" class="outline"><app-icon name="logout" /> {{ t.label }}</button></div>
          <div class="g"><button type="button" class="link"><app-icon name="undo" /> {{ t.label }}</button></div>
          <div class="g"><span class="yt-chip"><app-icon name="alert" /> {{ t.label }}</span></div>
          <div class="g"><p class="status"><app-icon name="clock" /> {{ t.label }}</p></div>
          <div class="g"><p class="yt-alert yt-alert--warning"><app-icon name="alert" /> <span>{{ t.label }}</span></p></div>
        </div>
      </section>
    }

    <section [class.guides-on]="guides()">
      <h2>ไอคอนล้วน · เวลา · ตัวเลข</h2>
      <div class="row">
        <div class="g"><button type="button" class="round yt-icon-only"><app-icon name="minus" /></button></div>
        <div class="g"><button type="button" class="round yt-icon-only"><app-icon name="plus" /></button></div>
        <div class="g"><span class="num big">08:00</span></div>
        <div class="g"><span class="num big">0123456789</span></div>
        <div class="g"><span class="mitr">Mitr 08:00 20:00</span></div>
      </div>
    </section>

    <section [class.guides-on]="guides()">
      <h2>ไอคอนมื้อ (เช้า · กลางวัน · เย็น · ก่อนนอน)</h2>
      <div class="row">
        @for (i of slotIcons; track i[0]) {
          <div class="g"><span class="slot"><app-icon [name]="i[1]" /> {{ i[0] }}</span></div>
        }
      </div>
    </section>
  `,
  styles: `
    :host { position: fixed; inset: 0; overflow-y: auto; padding: var(--yt-space-4); background: var(--yt-bg); }
    .head { display: flex; align-items: center; justify-content: space-between; gap: var(--yt-space-3); flex-wrap: wrap; }
    h1 { font-size: 1.6rem; color: var(--yt-primary-dark); small { font: 500 1rem var(--yt-font-body); color: var(--yt-text-muted); } }
    h2 { margin: var(--yt-space-5) 0 var(--yt-space-2); font-size: 1.15rem; span { font: 400 1rem var(--yt-font-body); color: var(--yt-text-muted); } }
    .guides { display: inline-flex; align-items: center; gap: var(--yt-space-2); min-height: 44px; }
    .row { display: flex; flex-wrap: wrap; gap: var(--yt-space-3); align-items: center; }
    .g { position: relative; display: inline-flex; }
    .g > * { margin: 0; }
    .guides-on .g::after { content: ''; position: absolute; left: -4px; right: -4px; top: 50%; height: 1px; background: rgb(220 38 38 / 0.7); pointer-events: none; z-index: 3; }
    .quiet { --mat-button-filled-container-color: var(--yt-primary-soft); --mat-button-filled-label-text-color: var(--yt-primary-deep); }
    .cta {
      display: inline-flex; align-items: center; gap: 0.5em; min-height: var(--yt-tap); padding: 0 var(--yt-space-5);
      border: 0; border-radius: var(--yt-radius-pill); background: linear-gradient(135deg, var(--yt-primary), var(--yt-primary-light));
      color: var(--yt-on-primary); font: 500 1.1rem / 1 var(--yt-font-display);
    }
    .outline {
      display: inline-flex; align-items: center; gap: 0.5em; min-height: var(--yt-tap); padding: 0 var(--yt-space-4);
      border: 2px solid var(--yt-border-strong); border-radius: var(--yt-radius-pill); background: transparent; color: var(--yt-text); font: 500 1rem / 1 var(--yt-font-body);
    }
    .link {
      display: inline-flex; align-items: center; gap: 0.5em; min-height: 44px; padding: 0 var(--yt-space-3);
      border: 0; background: transparent; color: var(--yt-on-success-soft); font: 600 var(--yt-text-sm) / 1 var(--yt-font-body); text-decoration: underline;
    }
    .status { display: inline-flex; align-items: center; gap: 0.5em; font-weight: 600; color: var(--yt-text-muted); }
    .round { display: grid; place-items: center; width: 56px; height: 56px; border: 2px solid var(--yt-primary); border-radius: 50%; background: var(--yt-surface); color: var(--yt-primary-dark); }
    .big { font-size: 2rem; }
    .mitr { font: 600 2rem var(--yt-font-display); }
    .slot { display: inline-flex; align-items: center; gap: 0.5em; font: 600 1.4rem var(--yt-font-display); color: var(--yt-primary-dark); }
  `,
})
export class ButtonsShowcasePage {
  protected readonly texts = TEXTS;
  protected readonly guides = signal(true);
  protected readonly slotIcons: [string, IconName][] = [
    ['เช้า', 'sunrise'], ['กลางวัน', 'sun'], ['เย็น', 'sunset'], ['ก่อนนอน', 'moon'],
  ];
}
