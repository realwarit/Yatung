import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButton } from '@angular/material/button';
import { errorCode, errorText } from '../../core/api/api-error';
import { DemoApi } from '../../core/api/line.api';
import { FitLabelDirective } from '../../shared/fit-label.directive';
import { IconComponent } from '../../shared/icon.component';

/** ปุ่มเดโม (แสดงเฉพาะเมื่อ GET /api/config ตอบ demoMode = true) : "ทดลองส่งเตือนตอนนี้" และ "ทดลองแจ้งญาติตอนนี้" */
@Component({
  selector: 'app-demo-section',
  imports: [MatButton, IconComponent, FitLabelDirective],
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
    <p class="hint hint--gap">ส่งข้อความ "ยาใกล้หมด" ของยาที่ใกล้หมดตอนนี้เข้า LINE ทันที โดยไม่ต้องรอเวลา 09:00</p>
    <button mat-stroked-button type="button" class="full" [disabled]="busyLow()" fitLabel="ทดลองแจ้งยาใกล้หมดตอนนี้" fitShort="ทดลองแจ้ง" (click)="lowStock(false)">
      <app-icon class="fit-icon" name="pill" /> <span class="fl-full">{{ busyLow() ? 'กำลังส่ง…' : 'ทดลองแจ้งยาใกล้หมดตอนนี้' }}</span><span class="fl-short" aria-hidden="true">{{ busyLow() ? 'กำลังส่ง…' : 'ทดลองแจ้ง' }}</span>
    </button>
    @if (resend(); as q) {
      <div class="ask" role="group" aria-label="ยืนยันส่งซ้ำ">
        <p class="ask__t">{{ q.title }}</p>
        <p class="ask__m">{{ q.message }}</p>
        <div class="yt-fitrow">
          <button mat-stroked-button type="button" fitGroup="demo-ask" fitLabel="ไม่ส่ง" (click)="resend.set(null)">ไม่ส่ง</button>
          <button mat-flat-button type="button" fitGroup="demo-ask" fitLabel="ส่งซ้ำ" (click)="doResend(q.kind)">ส่งซ้ำ</button>
        </div>
      </div>
    }
    @if (result(); as r) { <p class="yt-alert" role="status"><app-icon name="check" /> <span>{{ r }}</span></p> }
    @if (error(); as e) { <p class="yt-alert yt-alert--danger" role="alert"><app-icon name="alert" /> <span>{{ e }}</span></p> }
  `,
  styles: `
    :host { display: block; }
    .hint { margin: 0 0 var(--yt-space-3); color: var(--yt-text-muted); }
    .hint--gap { margin-top: var(--yt-space-4); }
    .full { width: 100%; }
    .yt-alert { margin-top: var(--yt-space-3); }
    .ask { margin-top: var(--yt-space-3); padding: var(--yt-space-4); border: 1px solid var(--yt-border-strong); border-radius: var(--yt-radius-md); background: var(--yt-field-bg); }
    .ask p { margin: 0 0 var(--yt-space-1); }
    .ask__t { font-weight: 700; }
    .ask__m { margin-bottom: var(--yt-space-3) !important; color: var(--yt-text-muted); }
  `,
})
export class DemoSectionComponent {
  private api = inject(DemoApi);
  /** ถามส่งซ้ำแบบ inline (ห้ามเปิด dialog ซ้อนบน sheet) */
  protected readonly resend = signal<{ kind: 'esc' | 'low'; title: string; message: string } | null>(null);
  protected readonly busy = signal(false);
  protected readonly busyEsc = signal(false);
  protected readonly busyLow = signal(false);
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

  /** 409 ALREADY_NOTIFIED = เคยแจ้งยาตัวนี้แล้ว → ถามก่อนส่งซ้ำ ; 409 NO_LOW_STOCK แสดงข้อความจาก backend */
  protected lowStock(force: boolean): void {
    this.busyLow.set(true);
    this.result.set(null);
    this.error.set(null);
    this.api.lowStockNow(force).subscribe({
      next: (r) => { this.busyLow.set(false); this.result.set(r.message); },
      error: (e: unknown) => {
        this.busyLow.set(false);
        if (errorCode(e) === 'ALREADY_NOTIFIED' && !force) { this.askResendLow(e as HttpErrorResponse); return; }
        this.error.set(errorText(e));
      },
    });
  }

  private askResendLow(e: HttpErrorResponse): void {
    const left = Number((e.error as { quota_left?: number } | null)?.quota_left);
    const quota = Number.isFinite(left) ? ` (เหลือโควตาสำรอง ${left} ข้อความ)` : '';
    this.resend.set({ kind: 'low', title: 'แจ้งยาใกล้หมดไปแล้ว ส่งซ้ำไหม?', message: `ใช้โควตาสำรองของ LINE เพิ่ม${quota}` });
  }

  private askResend(e: HttpErrorResponse): void {
    const left = Number((e.error as { quota_left?: number } | null)?.quota_left);
    const quota = Number.isFinite(left) ? ` (เหลือโควตาสำรอง ${left} ข้อความ)` : '';
    this.resend.set({ kind: 'esc', title: 'แจ้งญาติไปแล้ว ส่งซ้ำไหม?', message: `ใช้โควตาสำรองของ LINE เพิ่ม${quota}` });
  }

  protected doResend(kind: 'esc' | 'low'): void {
    this.resend.set(null);
    if (kind === 'esc') this.escalate(true); else this.lowStock(true);
  }
}
