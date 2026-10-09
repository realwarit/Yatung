import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { Subscription, switchMap, takeWhile, timer } from 'rxjs';
import { errorText } from '../../core/api/api-error';
import { LineApi, LineStatus, LinkCode } from '../../core/api/line.api';
import { plainName } from '../../core/text';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { MascotComponent } from '../../shared/components/mascot/mascot.component';
import { IconComponent } from '../../shared/icon.component';
import { LinkCodePanelComponent } from './link-code-panel.component';

/** ส่วน "เชื่อม LINE" ของผู้ป่วย: ยังไม่เชื่อม → รับรหัส (poll สถานะทุก 3 วินาที) → เชื่อมแล้ว (ยกเลิกได้) */
@Component({
  selector: 'app-line-section',
  imports: [MatButton, IconComponent, MascotComponent, LinkCodePanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loadError(); as e) {
      <div class="yt-alert yt-alert--danger" role="alert"><app-icon name="alert" /> <span>{{ e }}</span></div>
      <button mat-flat-button type="button" (click)="load()">ลองใหม่</button>
    } @else if (status(); as s) {
      @if (s.linked) {
        <div class="ok" role="status">
          <app-mascot mood="celebrate" [size]="96" />
          <div class="ok__txt">
            <p class="ok__t"><app-icon name="check" /><span>เชื่อม LINE <span class="nb">สำเร็จแล้ว</span></span></p>
            @if (s.display_name) { <p class="ok__n">ชื่อ LINE: <strong class="line-name">{{ plain(s.display_name) }}</strong></p> }
            <p class="hint">น้องยาตรงจะเตือนเวลากินยาทาง LINE นี้</p>
          </div>
        </div>
        <button mat-stroked-button type="button" class="full" [disabled]="busy()" (click)="confirmUnlink()">ยกเลิกการเชื่อม</button>
      } @else if (link(); as l) {
        <app-link-code-panel [link]="l" (expired)="onExpired()" />
        @if (expiredFlag()) { <button mat-flat-button type="button" class="full" [disabled]="busy()" (click)="requestCode()">ขอรหัสใหม่</button> }
      } @else {
        <p class="hint">เชื่อม LINE เพื่อให้น้องยาตรงเตือนเวลากินยาในแชทที่คุณใช้อยู่แล้ว ใช้เวลาไม่ถึงหนึ่งนาที</p>
        <button mat-flat-button type="button" class="full" [disabled]="busy()" (click)="requestCode()">
          {{ busy() ? 'กำลังขอรหัส…' : 'รับรหัสเชื่อม LINE' }}
        </button>
      }
      @if (error(); as er) { <div class="yt-alert yt-alert--danger" role="alert"><app-icon name="alert" /> <span>{{ er }}</span></div> }
    } @else {
      <div class="yt-skeleton sk" aria-busy="true" aria-label="กำลังโหลดสถานะ LINE"></div>
    }
  `,
  styles: `
    :host { display: block; }
    .hint { margin: 0 0 var(--yt-space-3); color: var(--yt-text-muted); }
    .full { width: 100%; }
    /* จอแคบ (<30rem ≈ 480px ที่ 100%): มาสคอตอยู่บนตรงกลาง แล้วหัวข้อ ✓ ชื่อ LINE ต่อด้านล่างกึ่งกลาง; จอกว้างขึ้น: มาสคอตซ้าย ข้อความขวา */
    .ok { display: flex; flex-direction: column; align-items: center; gap: var(--yt-space-2); margin-bottom: var(--yt-space-3); text-align: center; }
    .ok__txt { min-width: 0; }
    .ok p { margin: 0; }
    /* ✓ อยู่บรรทัดเดียวกับต้นหัวข้อเสมอ; "สำเร็จแล้ว" ไม่ถูกตัดกลางคำ (.nb) ; text-wrap: balance กัน "แล้ว" ตกบรรทัดเดียวโดดๆ */
    .ok__t { display: flex; align-items: flex-start; justify-content: center; gap: var(--yt-space-2); font-weight: 700; color: var(--yt-success); font-size: 1.15rem; text-wrap: balance; }
    .ok__t app-icon { flex: none; margin-top: 0.3em; }
    .nb { white-space: nowrap; }
    .ok__n { margin: var(--yt-space-1) 0; overflow-wrap: anywhere; }
    .line-name { font-family: var(--yt-font-body); font-weight: 600; }
    @media (min-width: 30rem) {
      .ok { flex-direction: row; text-align: left; gap: var(--yt-space-3); }
      .ok__t { justify-content: flex-start; }
    }
    .sk { height: 7rem; }
  `,
})
export class LineSectionComponent {
  private api = inject(LineApi);
  private dialog = inject(MatDialog);
  private destroyRef = inject(DestroyRef);

  protected readonly status = signal<LineStatus | null>(null);
  protected readonly link = signal<LinkCode | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly expiredFlag = signal(false);
  private poll?: Subscription;
  protected readonly plain = plainName;

  constructor() {
    this.load();
    this.destroyRef.onDestroy(() => this.stopPoll());
  }

  protected load(): void {
    this.loadError.set(null);
    this.api.status().subscribe({ next: (s) => this.status.set(s), error: (e) => this.loadError.set(errorText(e)) });
  }

  protected requestCode(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.linkCode().subscribe({
      next: (l) => { this.busy.set(false); this.expiredFlag.set(false); this.link.set(l); this.startPoll(); },
      error: (e) => { this.busy.set(false); this.error.set(errorText(e)); },
    });
  }

  /** ถามสถานะทุก 3 วินาทีจนกว่าจะเชื่อมแล้ว / รหัสหมดอายุ / ออกจากหน้า */
  private startPoll(): void {
    this.stopPoll();
    this.poll = timer(3000, 3000).pipe(
      switchMap(() => this.api.status()),
      takeWhile((s) => !s.linked, true),
    ).subscribe({
      next: (s) => { if (s.linked) { this.status.set(s); this.link.set(null); } },
      error: () => { /* เครือข่ายสะดุดชั่วคราว: รอบถัดไปถามใหม่ไม่ได้เพราะ stream จบ → เริ่มใหม่ */ this.startPoll(); },
    });
  }
  private stopPoll(): void { this.poll?.unsubscribe(); this.poll = undefined; }

  protected onExpired(): void { this.stopPoll(); this.expiredFlag.set(true); }

  protected confirmUnlink(): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'ยกเลิกการเชื่อม LINE?', message: 'น้องยาตรงจะไม่ส่งข้อความเตือนไปที่ LINE นี้อีก คุณเชื่อมใหม่ได้ทุกเมื่อ', confirmLabel: 'ยกเลิกการเชื่อม' },
    }).afterClosed().subscribe((yes) => {
      if (yes !== true) return;
      this.busy.set(true);
      this.api.unlink().subscribe({
        next: () => { this.busy.set(false); this.status.set({ linked: false, display_name: null }); },
        error: (e) => { this.busy.set(false); this.error.set(errorText(e)); },
      });
    });
  }
}
