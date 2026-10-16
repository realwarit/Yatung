import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

export const NATIVE_PROBE_MS = 15000;

/** แอป Android: ถามปลายทางเบาๆ (GET /api/config สาธารณะ) ว่าต่อเซิร์ฟเวอร์ได้หรือยัง — ต้องได้ JSON จริง (หน้าเตือน ngrok เป็น HTML ไม่นับ) */
async function defaultProbe(): Promise<boolean> {
  try {
    const r = await fetch(`${environment.apiBase}/api/config`, { cache: 'no-store', headers: { 'ngrok-skip-browser-warning': '1' }, signal: AbortSignal.timeout(8000) });
    return r.ok && (r.headers.get('content-type') ?? '').includes('json');
  } catch { return false; }
}

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
  /** แอป Android ไม่มี service worker/คำขอใหม่ที่จะมาล้างสถานะ "ออฟไลน์" เอง → ตรวจเป็นระยะหลังคำขอล้มเหลว (เว็บไม่ใช้) */
  probeEnabled = environment.native;
  probe: () => Promise<boolean> = defaultProbe;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    const goOnline = () => { this.navOnline.set(true); this.failed.set(false); this.stopProbe(); this.backOnline.next(); };
    const goOffline = () => this.navOnline.set(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    this.destroyRef.onDestroy(() => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); this.stopProbe(); });
  }

  /** คำขอ API ล้มเหลวแบบเชื่อมต่อไม่ได้ (status 0) */
  markFailed(): void {
    this.failed.set(true);
    if (this.probeEnabled && !this.timer) {
      this.timer = setInterval(() => { if (typeof document === 'undefined' || !document.hidden) void this.probe().then((ok) => { if (ok) this.markOk(); }); }, NATIVE_PROBE_MS);
    }
  }

  private stopProbe(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  /** คำขอ API สำเร็จ (ได้ response จากเซิร์ฟเวอร์) */
  markOk(): void {
    if (!this.failed()) return;
    this.stopProbe();
    this.failed.set(false);
    if (this.navOnline()) this.backOnline.next();
  }
}
