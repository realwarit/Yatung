import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * สถานะออนไลน์ของแอป: offline = เบราว์เซอร์บอกว่าไม่มีเน็ต (navigator.onLine) หรือคำขอ API ล่าสุดล้มเหลวแบบ status 0
 * (navigator.onLine บางเครื่องยังเป็น true ทั้งที่ออกเน็ตไม่ได้) — คำขอสำเร็จครั้งถัดไป/กลับมาออนไลน์ = หาย
 * backOnline ยิงทุกครั้งที่กลับมาใช้ได้ → หน้าวันนี้/สรุปรีเฟรชเอง
 */
@Injectable({ providedIn: 'root' })
export class OnlineService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly navOnline = signal(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  private readonly failed = signal(false);
  readonly offline = computed(() => !this.navOnline() || this.failed());
  readonly backOnline = new Subject<void>();

  constructor() {
    if (typeof window === 'undefined') return;
    const goOnline = () => { this.navOnline.set(true); this.failed.set(false); this.backOnline.next(); };
    const goOffline = () => this.navOnline.set(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    this.destroyRef.onDestroy(() => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); });
  }

  /** คำขอ API ล้มเหลวแบบเชื่อมต่อไม่ได้ (status 0) */
  markFailed(): void { this.failed.set(true); }

  /** คำขอ API สำเร็จ (ได้ response จากเซิร์ฟเวอร์) */
  markOk(): void {
    if (!this.failed()) return;
    this.failed.set(false);
    if (this.navOnline()) this.backOnline.next();
  }
}
