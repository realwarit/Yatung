import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { Subscription, switchMap, takeWhile, timer } from 'rxjs';
import { errorText } from '../../core/api/api-error';
import { Caregiver, LineApi, LinkCode } from '../../core/api/line.api';
import { AuthService } from '../../core/auth/auth.service';
import { MascotComponent } from '../../shared/components/mascot/mascot.component';
import { IconComponent } from '../../shared/icon.component';
import { LinkCodePanelComponent } from './link-code-panel.component';

/** ส่งรหัสให้ญาติ: ขอรหัสทันทีที่เปิด, poll รายการผู้ดูแลทุก 3 วินาทีจนญาติเชื่อมสำเร็จ ; ปิดด้วย true ถ้าเชื่อมแล้ว */
@Component({
  selector: 'app-caregiver-code-dialog',
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatButton, LinkCodePanelComponent, MascotComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>ส่งรหัสให้ {{ cg.name }}</h2>
    <mat-dialog-content>
      @if (linked()) {
        <div class="done" role="status">
          <app-mascot mood="celebrate" [size]="110" />
          <p><app-icon name="check" /> {{ cg.name }} เชื่อม LINE สำเร็จแล้ว</p>
        </div>
      } @else if (link(); as l) {
        <p class="hint">ให้ {{ cg.name }} เปิดลิงก์ในข้อความเชิญ หรือสแกน QR แล้วกดส่งรหัสในแชท LINE</p>
        <app-link-code-panel [link]="l" [inviteText]="invite(l)" (expired)="expired.set(true)" />
        @if (expired()) { <button mat-flat-button type="button" class="again" (click)="request()">ขอรหัสใหม่</button> }
      } @else if (error(); as e) {
        <div class="yt-alert yt-alert--danger" role="alert"><app-icon name="alert" /> <span>{{ e }}</span></div>
        <button mat-flat-button type="button" (click)="request()">ลองใหม่</button>
      } @else {
        <div class="yt-skeleton sk" aria-busy="true" aria-label="กำลังขอรหัส"></div>
      }
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-stroked-button type="button" (click)="ref.close(linked())">ปิด</button>
    </mat-dialog-actions>
  `,
  styles: `
    .hint { margin: 0 0 var(--yt-space-3); color: var(--yt-text-muted); }
    .done { display: flex; flex-direction: column; align-items: center; text-align: center; }
    .done p { display: flex; align-items: center; gap: var(--yt-space-2); font-weight: 700; color: var(--yt-success); font-size: 1.2rem; }
    .again { width: 100%; }
    .sk { height: 12rem; }
    mat-dialog-actions { padding: var(--yt-space-3) var(--yt-space-5) var(--yt-space-5); }
  `,
})
export class CaregiverCodeDialogComponent {
  protected readonly cg = inject<Caregiver>(MAT_DIALOG_DATA);
  protected readonly ref = inject<MatDialogRef<CaregiverCodeDialogComponent, boolean>>(MatDialogRef);
  private api = inject(LineApi);
  private auth = inject(AuthService);
  private destroyRef = inject(DestroyRef);

  protected readonly link = signal<LinkCode | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly expired = signal(false);
  protected readonly linked = signal(false);
  private poll?: Subscription;

  constructor() {
    this.request();
    this.destroyRef.onDestroy(() => this.poll?.unsubscribe());
  }

  protected request(): void {
    this.error.set(null);
    this.expired.set(false);
    this.api.caregiverLinkCode(this.cg.id).subscribe({
      next: (l) => { this.link.set(l); this.startPoll(); },
      error: (e) => this.error.set(errorText(e)),
    });
  }

  private startPoll(): void {
    this.poll?.unsubscribe();
    this.poll = timer(3000, 3000).pipe(
      switchMap(() => this.api.caregivers()),
      takeWhile((r) => !r.caregivers.find((c) => c.id === this.cg.id)?.line_linked, true),
    ).subscribe({
      next: (r) => { if (r.caregivers.find((c) => c.id === this.cg.id)?.line_linked) this.linked.set(true); },
      error: () => this.startPoll(),
    });
  }

  protected invite(l: LinkCode): string {
    const me = this.auth.currentUser()?.display_name ?? 'ผู้ใช้ยาตรง';
    return `${me} ขอเชิญ ${this.cg.name} เป็นผู้ดูแลเรื่องกินยาในแอป “ยาตรง”\n` +
      (l.oa_message_url ? `กดลิงก์นี้เพื่อเปิด LINE แล้วกดส่งข้อความรหัสได้เลย: ${l.oa_message_url}\n` : '') +
      `รหัสเชื่อม: ${l.code.slice(0, 3)} ${l.code.slice(3)} (ใช้ได้ 10 นาที)`;
  }
}
