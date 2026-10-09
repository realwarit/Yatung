import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { errorText } from '../../core/api/api-error';
import { Caregiver, LineApi } from '../../core/api/line.api';
import { plainName } from '../../core/text';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { MascotComponent } from '../../shared/components/mascot/mascot.component';
import { IconComponent } from '../../shared/icon.component';
import { CaregiverCodeDialogComponent } from './caregiver-code-dialog.component';
import { CaregiverFormDialogComponent } from './caregiver-form-dialog.component';

/** ส่วน "ญาติ/ผู้ดูแล": รายการ + สถานะ LINE + เพิ่ม/แก้ไข/ลบ/ส่งรหัสให้ญาติ */
@Component({
  selector: 'app-caregivers-section',
  imports: [MatButton, IconComponent, MascotComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="hint">ถ้าลืมกินยานานเกินเวลาที่ตั้งไว้ น้องยาตรงจะแจ้งญาติทาง LINE</p>
    @if (loadError(); as e) {
      <div class="yt-alert yt-alert--danger" role="alert"><app-icon name="alert" /> <span>{{ e }}</span></div>
      <button mat-flat-button type="button" (click)="load()">ลองใหม่</button>
    } @else if (list(); as items) {
      @if (!items.length) {
        <div class="empty"><app-mascot mood="happy" [size]="96" /><p>ยังไม่มีผู้ดูแล เพิ่มญาติที่ไว้ใจได้เลยค่ะ</p></div>
      }
      <ul class="cgs">
        @for (c of items; track c.id) {
          <li class="cg">
            <div class="cg__top">
              <strong class="cg__name">{{ c.name }}</strong>
              @if (c.relation) { <span class="cg__rel">({{ c.relation }})</span> }
            </div>
            <p class="cg__line" [class.on]="c.line_linked">
              <app-icon [name]="c.line_linked ? 'check' : 'clock'" />
              <span>{{ c.line_linked ? 'เชื่อม LINE แล้ว' : 'ยังไม่เชื่อม LINE' }}@if (c.line_linked && c.line_display_name) {: <span class="line-name">{{ plain(c.line_display_name) }}</span>}</span>
            </p>
            <p class="cg__min">แจ้งเมื่อไม่กดกินยานานเกิน <span class="nb"><span class="num">{{ c.escalate_after_min }}</span> นาที</span></p>
            <div class="cg__acts">
              @if (c.line_linked) {
                <button mat-stroked-button type="button" (click)="sendCode(c)">เชื่อม LINE ใหม่</button>
              } @else {
                <button mat-flat-button type="button" (click)="sendCode(c)">ส่งรหัสให้ญาติ</button>
              }
              <button mat-stroked-button type="button" (click)="edit(c)"><app-icon name="edit" /> แก้ไข</button>
              <button mat-stroked-button type="button" (click)="remove(c)"><app-icon name="trash" /> ลบ</button>
            </div>
          </li>
        }
      </ul>
      <button mat-stroked-button type="button" class="add" (click)="edit(null)"><app-icon name="plus" /> เพิ่มผู้ดูแล</button>
    } @else {
      <div class="yt-skeleton sk" aria-busy="true" aria-label="กำลังโหลดรายการผู้ดูแล"></div>
    }
  `,
  styles: `
    :host { display: block; }
    .hint { margin: 0 0 var(--yt-space-3); color: var(--yt-text-muted); }
    .empty { display: flex; align-items: center; gap: var(--yt-space-3); margin-bottom: var(--yt-space-3); }
    .empty p { margin: 0; }
    .cgs { list-style: none; margin: 0 0 var(--yt-space-3); padding: 0; display: flex; flex-direction: column; gap: var(--yt-space-3); }
    .cg { padding: var(--yt-space-3) var(--yt-space-4); border: 2px solid var(--yt-border); border-radius: var(--yt-radius-md); }
    .cg__name { font-size: 1.2rem; }
    .cg__rel { margin-left: var(--yt-space-2); color: var(--yt-text-muted); }
    .cg p { margin: var(--yt-space-1) 0 0; }
    .cg__line { display: flex; align-items: center; gap: var(--yt-space-2); color: var(--yt-text-muted); font-weight: 600; }
    .cg__line.on { color: var(--yt-success); }
    .cg__line > span { min-width: 0; overflow-wrap: anywhere; }
    .line-name { font-family: var(--yt-font-body); }
    .nb { white-space: nowrap; }
    .cg__acts { display: flex; flex-wrap: wrap; gap: var(--yt-space-2); margin-top: var(--yt-space-3); }
    .add { width: 100%; }
    .sk { height: 8rem; }
  `,
})
export class CaregiversSectionComponent {
  private api = inject(LineApi);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  protected readonly plain = plainName;
  protected readonly list = signal<Caregiver[] | null>(null);
  protected readonly loadError = signal<string | null>(null);

  constructor() { this.load(); }

  protected load(): void {
    this.loadError.set(null);
    this.api.caregivers().subscribe({ next: (r) => this.list.set(r.caregivers), error: (e) => this.loadError.set(errorText(e)) });
  }

  protected edit(c: Caregiver | null): void {
    this.dialog.open(CaregiverFormDialogComponent, { data: c, width: '32rem', maxWidth: '95vw' }).afterClosed().subscribe((saved?: Caregiver) => {
      if (!saved) return;
      this.load();
      this.snack.open(c ? 'แก้ไขข้อมูลผู้ดูแลแล้ว' : 'เพิ่มผู้ดูแลแล้ว', undefined, { duration: 5000, panelClass: 'yt-snack' });
    });
  }

  protected sendCode(c: Caregiver): void {
    this.dialog.open(CaregiverCodeDialogComponent, { data: c, width: '32rem', maxWidth: '95vw' }).afterClosed().subscribe(() => this.load());
  }

  protected remove(c: Caregiver): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: { title: `ลบ ${c.name}?`, message: 'จะไม่มีการแจ้งเตือนไปที่ผู้ดูแลคนนี้อีก', confirmLabel: 'ลบผู้ดูแล' },
    }).afterClosed().subscribe((yes) => {
      if (yes !== true) return;
      this.api.deleteCaregiver(c.id).subscribe({
        next: () => { this.load(); this.snack.open('ลบผู้ดูแลแล้ว', undefined, { duration: 5000, panelClass: 'yt-snack' }); },
        error: (e) => this.snack.open(errorText(e), undefined, { duration: 7000, panelClass: 'yt-snack' }),
      });
    });
  }
}
