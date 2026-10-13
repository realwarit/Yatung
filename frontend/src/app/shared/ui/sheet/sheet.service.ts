import { Injectable, inject } from '@angular/core';
import { ComponentType } from '@angular/cdk/portal';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatDialog } from '@angular/material/dialog';

export const SHEET_WIDE_QUERY = '(min-width: 1024px)';

/**
 * เปิด component เป็น yt-sheet: มือถือ = แผ่นล่าง (MatBottomSheet) · จอ ≥ 1024px = แผงขวา (MatDialog ชิดขวาเต็มสูง)
 * กติกา: ห้ามเปิด dialog ซ้อนบน sheet — ผู้เรียกต้อง `await closed` แล้วค่อยเปิด dialog (ใช้ `closeThen`)
 */
@Injectable({ providedIn: 'root' })
export class SheetService {
  private readonly bottom = inject(MatBottomSheet);
  private readonly dialog = inject(MatDialog);

  wide(): boolean {
    try { return matchMedia(SHEET_WIDE_QUERY).matches; } catch { return false; }
  }

  /** คืน Promise ที่ resolve (ด้วยผลที่ sheet ส่งตอนปิด) เมื่อ sheet ปิดสนิทแล้ว */
  open<T, D = unknown, R = unknown>(component: ComponentType<T>, data?: D): Promise<R | undefined> {
    if (this.wide()) {
      const ref = this.dialog.open<T, D, R>(component, {
        data, panelClass: 'yt-sheet-side', position: { right: '0', top: '0' }, width: '26.25rem', maxWidth: '100vw', height: '100dvh',
        autoFocus: 'first-tabbable', restoreFocus: true,
      });
      return new Promise((res) => ref.afterClosed().subscribe((r) => res(r)));
    }
    const ref = this.bottom.open<T, D, R>(component, { data, panelClass: 'yt-sheet-bottom', autoFocus: 'first-tabbable', restoreFocus: true });
    return new Promise((res) => ref.afterDismissed().subscribe((r) => res(r)));
  }
}
