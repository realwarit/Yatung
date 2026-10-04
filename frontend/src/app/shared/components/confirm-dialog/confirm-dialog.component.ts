import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';

export interface ConfirmData {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
}

/** dialog ยืนยัน — ปิดด้วยค่า true เมื่อกดยืนยัน (false/undefined = ยกเลิก) */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, MatButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content><p>{{ data.message }}</p></mat-dialog-content>
    <mat-dialog-actions>
      <button mat-stroked-button [mat-dialog-close]="false">{{ data.cancelLabel ?? 'ยกเลิก' }}</button>
      <button mat-flat-button [mat-dialog-close]="true">{{ data.confirmLabel }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    p { margin: 0; font-size: var(--yt-text-base); }
    mat-dialog-actions { flex-wrap: wrap; gap: var(--yt-space-2); padding: var(--yt-space-3) var(--yt-space-5) var(--yt-space-5); }
  `,
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
}
