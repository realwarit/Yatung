import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { IconComponent } from '../../icon.component';

export interface TimeInputData { title: string; value: string; }

/** แปลง "8:30" "0830" "08.30" → "08:30" (ไม่ถูกต้อง = null) */
export function normalizeTime(raw: string): string | null {
  const m = /^(\d{1,2})\s*[:.]?\s*(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** พิมพ์เวลาเอง (HH:MM) — ปิดด้วยสตริงเวลาที่ปรับรูปแบบแล้ว */
@Component({
  selector: 'app-time-input-dialog',
  imports: [FormsModule, MatDialogTitle, MatDialogContent, MatDialogActions, MatButton, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <form (ngSubmit)="ok()">
      <mat-dialog-content>
        <label class="yt-label" for="ti">พิมพ์เวลา (เช่น 08:30)</label>
        <div class="yt-control" [class.is-invalid]="error()">
          <input id="ti" name="t" type="text" inputmode="numeric" maxlength="5" autocomplete="off"
                 [ngModel]="text()" (ngModelChange)="text.set($event); error.set(null)"
                 [attr.aria-invalid]="error() ? 'true' : null" [attr.aria-describedby]="error() ? 'ti-err' : null" />
        </div>
        @if (error()) { <p class="yt-error-text" id="ti-err" role="alert"><app-icon name="alert" /> {{ error() }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions>
        <button mat-stroked-button type="button" (click)="ref.close()">ยกเลิก</button>
        <button mat-flat-button type="submit">ตกลง</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-actions { flex-wrap: wrap; gap: var(--yt-space-2); padding: var(--yt-space-3) var(--yt-space-5) var(--yt-space-5); }
    .yt-control input { font: 600 1.6rem / 1.6 var(--yt-font-display); }
  `,
})
export class TimeInputDialogComponent {
  protected readonly data = inject<TimeInputData>(MAT_DIALOG_DATA);
  protected readonly ref = inject<MatDialogRef<TimeInputDialogComponent, string>>(MatDialogRef);
  protected readonly text = signal(this.data.value);
  protected readonly error = signal<string | null>(null);

  protected ok(): void {
    const t = normalizeTime(this.text());
    if (!t) { this.error.set('กรุณาพิมพ์เวลาให้ถูกต้อง เช่น 08:30 (00:00–23:59)'); return; }
    this.ref.close(t);
  }
}
