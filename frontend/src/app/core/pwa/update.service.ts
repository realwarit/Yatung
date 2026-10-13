import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

export { UPDATE_BROKEN_TEXT, UPDATE_READY_TEXT } from '../banner/banner';

/**
 * เวอร์ชันใหม่พร้อม (VERSION_READY) → state 'ready' → yt-banner "แตะเพื่ออัปเดต" → apply() = activateUpdate + reload (ไม่ reload เอง กันเสียฟอร์มที่กรอกค้าง)
 * service worker พัง/แคชไม่ตรง (unrecoverable) → state 'broken' → banner ให้โหลดใหม่ ; ไม่มี SW (dev, http) = ไม่ทำอะไร
 * (8D: เปลี่ยนจาก snackbar เป็น banner เพราะ snackbar บังปุ่มของหน้า — การแสดงอยู่ที่ BannerService)
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly sw = inject(SwUpdate, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<'none' | 'ready' | 'broken'>('none');
  reload: () => void = () => location.reload();

  watch(): void {
    const sw = this.sw;
    if (!sw?.isEnabled) return;
    const subs = [
      sw.versionUpdates.subscribe((e) => { if (e.type === 'VERSION_READY') this.state.set('ready'); }),
      sw.unrecoverable.subscribe(() => this.state.set('broken')),
    ];
    this.destroyRef.onDestroy(() => subs.forEach((s) => s.unsubscribe()));
  }

  /** กดปุ่มบน banner */
  apply(): void {
    const sw = this.sw;
    if (this.state() === 'ready' && sw) sw.activateUpdate().catch(() => undefined).finally(() => this.reload());
    else this.reload();
  }
}
