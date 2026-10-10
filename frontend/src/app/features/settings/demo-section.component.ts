import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { errorCode, errorText } from '../../core/api/api-error';
import { DemoApi } from '../../core/api/line.api';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../../shared/icon.component';

/** ปุ่มเดโม (แสดงเฉพาะเมื่อ GET /api/config ตอบ demoMode = true) : "ทดลองส่งเตือนตอนนี้" และ "ทดลองแจ้งญาติตอนนี้" */
@Component({
  selector: 'app-demo-section',
  imports: [MatButton, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="hint">สำหรับนำเสนอ: ส่งข้อความเตือนของรอบกินยาที่ใกล้เวลาปัจจุบันที่สุดของวันนี้ (ก่อนหรือหลังเวลาก็ได้) เข้า LINE ทันที — หัวข้อข้อความเปลี่ยนตามช่วงเวลา (ไม่สร้างรอบยาปลอม)</p>
    <button mat-flat-button type="button" class="full" [disabled]="busy()" (click)="send()">
      <app-icon name="bell" /> {{ busy() ? 'กำลังส่ง…' : 'ทดลองส่งเตือนตอนนี้' }}
    </button>
    <p class="hint hint--gap">แจ้งญาติที่เชื่อม LINE แล้วทุกคนทันทีสำหรับรอบที่ใกล้เวลาปัจจุบันที่สุด โดยไม่ต้องรอเวลาที่ตั้งไว้</p>
    <button mat-stroked-button type="button" class="full" [disabled]="busyEsc()" (click)="escalate(false)">
      <app-icon name="alert" /> {{ busyEsc() ? 'กำลังแจ้ง…' : 'ทดลองแจ้งญาติตอนนี้' }}
    </button>
    @if (result(); as r) { <p class="yt-alert" role="status"><app-icon name="check" /> <span>{{ r }}</span></p> }
    @if (error(); as e) { <p class="yt-alert yt-alert--danger" role="alert"><app-icon name="alert" /> <span>{{ e }}</span></p> }
  `,
  styles: `
    :host { display: block; }
    .hint { margin: 0 0 var(--yt-space-3); color: var(--yt-text-muted); }
    .hint--gap { margin-top: var(--yt-space-4); }
    .full { width: 100%; }
    .yt-alert { margin-top: var(--yt-space-3); }
  `,
})
export class DemoSectionComponent {
  private api = inject(DemoApi);
  private dialog = inject(MatDialog);
  protected readonly busy = signal(false);
  protected readonly busyEsc = signal(false);
  protected readonly result = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected send(): void {
    this.busy.set(true);
    this.result.set(null);
    this.error.set(null);
    this.api.remindNow().subscribe({
      next: (r) => {
        this.busy.set(false);
        this.result.set(r.message);   // เช่น "ส่งเตือนมื้อเย็น 18:00 น. (2 รายการ) เข้า LINE แล้วค่ะ · เลยเวลามา 2 ชม."
      },
      error: (e) => { this.busy.set(false); this.error.set(errorText(e)); },
    });
  }

  /** 409 ALREADY_ESCALATED = แจ้งไปแล้ว → ถามก่อนส่งซ้ำ (force:true ใช้โควตาสำรอง) */
  protected escalate(force: boolean): void {
    this.busyEsc.set(true);
    this.result.set(null);
    this.error.set(null);
    this.api.escalateNow(force).subscribe({
      next: (r) => { this.busyEsc.set(false); this.result.set(r.message); },
      error: (e: unknown) => {
        this.busyEsc.set(false);
        if (errorCode(e) === 'ALREADY_ESCALATED' && !force) { this.askResend(e as HttpErrorResponse); return; }
        this.error.set(errorText(e));
      },
    });
  }

  private askResend(e: HttpErrorResponse): void {
    const left = Number((e.error as { quota_left?: number } | null)?.quota_left);
    const quota = Number.isFinite(left) ? ` (เหลือโควตาสำรอง ${left} ข้อความ)` : '';
    this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'แจ้งญาติไปแล้ว ส่งซ้ำไหม?', message: `ใช้โควตาสำรองของ LINE เพิ่ม${quota}`, confirmLabel: 'ส่งซ้ำ', cancelLabel: 'ไม่ส่ง' },
    }).afterClosed().subscribe((yes) => { if (yes === true) this.escalate(true); });
  }
}
