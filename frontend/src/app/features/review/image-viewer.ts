import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogClose } from '@angular/material/dialog';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButton } from '@angular/material/button';
import { IconComponent } from '../../shared/icon.component';

export interface ImageViewData { url: string; }

const ZOOMS = [1, 1.5, 2, 3];

/** ดูรูปซองเต็มจอ ซูมได้ (ปุ่ม − / + แล้วเลื่อนดู) ; ปิดด้วยปุ่มหรือ Esc */
@Component({
  selector: 'app-image-zoom-dialog',
  imports: [MatDialogClose, MatButton, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      <button mat-stroked-button type="button" (click)="zoom(-1)" [disabled]="level() === 0" aria-label="ย่อรูป">−</button>
      <output class="num" aria-live="polite">{{ pct() }}%</output>
      <button mat-stroked-button type="button" (click)="zoom(1)" [disabled]="level() === zooms.length - 1" aria-label="ขยายรูป">+</button>
      <span class="grow"></span>
      <button mat-flat-button type="button" mat-dialog-close><app-icon name="close" /> ปิด</button>
    </div>
    <div class="pane" tabindex="0" aria-label="รูปซองยา เลื่อนเพื่อดูส่วนอื่น">
      <img [src]="data.url" alt="รูปซองยาที่สแกน" [style.width.%]="pct()" />
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; height: 100%; background: var(--yt-surface); }
    .bar { display: flex; align-items: center; gap: var(--yt-space-3); padding: var(--yt-space-3) var(--yt-space-4); }
    .bar button { min-width: 3.5rem; min-height: var(--yt-tap); }
    .bar output { min-width: 4rem; text-align: center; font-weight: 700; }
    .grow { flex: 1; }
    .pane { flex: 1; overflow: auto; background: var(--yt-field-bg); }
    img { display: block; max-width: none; height: auto; margin: 0 auto; }
  `,
})
export class ImageZoomDialog {
  protected readonly data = inject<ImageViewData>(MAT_DIALOG_DATA);
  protected readonly zooms = ZOOMS;
  protected readonly level = signal(0);
  protected pct(): number { return Math.round(ZOOMS[this.level()] * 100); }
  protected zoom(d: 1 | -1): void { this.level.update((l) => Math.min(ZOOMS.length - 1, Math.max(0, l + d))); }
}

/** มือถือ: รูปซองใน bottom sheet (แตะรูปหรือปุ่มเพื่อขยายเต็มจอ) */
@Component({
  selector: 'app-image-sheet',
  imports: [MatButton, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="pic" (click)="zoom()" aria-label="ขยายรูปซองยาเต็มจอ">
      <img [src]="data.url" alt="รูปซองยาที่สแกน" />
    </button>
    <div class="row">
      <button mat-flat-button type="button" (click)="zoom()"><app-icon name="search" /> ขยายรูป</button>
      <button mat-stroked-button type="button" (click)="ref.dismiss()">ปิด</button>
    </div>
  `,
  styles: `
    :host { display: block; }
    .pic { display: block; width: 100%; padding: 0; border: 0; background: none; cursor: zoom-in; }
    img { display: block; width: 100%; max-height: 55vh; object-fit: contain; border-radius: var(--yt-radius-sm); background: var(--yt-field-bg); }
    .row { display: flex; gap: var(--yt-space-3); margin-top: var(--yt-space-3); }
    .row button { flex: 1; min-height: var(--yt-tap); }
  `,
})
export class ImageSheet {
  protected readonly data = inject<ImageViewData>(MAT_BOTTOM_SHEET_DATA);
  protected readonly ref = inject<MatBottomSheetRef<ImageSheet>>(MatBottomSheetRef);
  private readonly dialog = inject(MatDialog);
  protected zoom(): void {
    this.ref.dismiss();
    openImageZoom(this.dialog, this.data.url);
  }
}

export function openImageZoom(dialog: MatDialog, url: string): void {
  dialog.open<ImageZoomDialog, ImageViewData>(ImageZoomDialog, {
    data: { url }, width: '100vw', height: '100vh', maxWidth: '100vw', panelClass: 'yt-fullscreen-dialog', autoFocus: 'dialog',
  });
}
