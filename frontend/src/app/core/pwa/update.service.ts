import { DestroyRef, Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate } from '@angular/service-worker';

export const UPDATE_READY_TEXT = 'มีเวอร์ชันใหม่ แตะเพื่ออัปเดต';
export const UPDATE_BROKEN_TEXT = 'แอปต้องโหลดใหม่เพื่อให้ใช้งานต่อได้';

/**
 * เวอร์ชันใหม่พร้อม (VERSION_READY) → snackbar "แตะเพื่ออัปเดต" → activateUpdate + reload (ไม่ reload เอง กันเสียฟอร์มที่กรอกค้าง)
 * service worker พัง/แคชไม่ตรง (unrecoverable) → snackbar ให้โหลดใหม่ ; ไม่มี SW (dev, http) = ไม่ทำอะไร
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly sw = inject(SwUpdate, { optional: true });
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  reload: () => void = () => location.reload();

  watch(): void {
    const sw = this.sw;
    if (!sw?.isEnabled) return;
    const subs = [
      sw.versionUpdates.subscribe((e) => {
        if (e.type !== 'VERSION_READY') return;
        this.snack.open(UPDATE_READY_TEXT, 'อัปเดต', { duration: undefined, panelClass: 'yt-snack' }).onAction().subscribe(() => {
          sw.activateUpdate().catch(() => undefined).finally(() => this.reload());
        });
      }),
      sw.unrecoverable.subscribe(() => {
        this.snack.open(UPDATE_BROKEN_TEXT, 'โหลดใหม่', { duration: undefined, panelClass: 'yt-snack' }).onAction().subscribe(() => this.reload());
      }),
    ];
    this.destroyRef.onDestroy(() => subs.forEach((s) => s.unsubscribe()));
  }
}
