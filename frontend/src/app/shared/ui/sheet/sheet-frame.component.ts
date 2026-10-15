import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatDialogRef } from '@angular/material/dialog';
import { IconComponent } from '../../icon.component';

/**
 * กรอบมาตรฐานของ yt-sheet: หัว (ชื่อ + ปุ่ม "ปิด") + เนื้อหาเลื่อนได้ — ใช้เป็นรากของ component ที่เปิดผ่าน SheetService
 * ปิดได้ด้วยปุ่ม "ปิด" · ปัดลง/แตะพื้นหลัง/Esc (ของ Material) · closeOnNavigation (ค่าเริ่มต้น) — ไม่ push history
 */
@Component({
  selector: 'app-sheet-frame',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <h2>{{ title() }}</h2>
      <button type="button" class="yt-compact" (click)="close()"><app-icon name="close" /> ปิด</button>
    </header>
    <div class="body"><ng-content /></div>
  `,
  styleUrl: './sheet-frame.component.scss',
})
export class SheetFrameComponent {
  readonly title = input.required<string>();
  private readonly bottom = inject(MatBottomSheetRef, { optional: true });
  private readonly dialog = inject(MatDialogRef, { optional: true });
  close(result?: unknown): void {
    if (this.bottom) this.bottom.dismiss(result);
    else this.dialog?.close(result);
  }
}
