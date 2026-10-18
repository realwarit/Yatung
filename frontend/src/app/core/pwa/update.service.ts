import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { OnlineService } from '../offline/online.service';

export { UPDATE_BROKEN_TEXT, UPDATE_FAILED_TEXT, UPDATE_READY_TEXT } from '../banner/banner';

/** เว้นระยะขั้นต่ำระหว่างการเช็กอัปเดตตอนแอปกลับมาเปิด */
export const RECHECK_MIN_MS = 5 * 60 * 1000;
/** แถบ "โหลดเวอร์ชันใหม่ไม่สำเร็จ" หายเอง */
export const FAILED_AUTOHIDE_MS = 10_000;

/**
 * เวอร์ชันใหม่พร้อม (VERSION_READY) → state 'ready' → yt-banner "แตะเพื่ออัปเดต" → apply() = activateUpdate + reload (ไม่ reload เอง กันเสียฟอร์มที่กรอกค้าง)
 *  - ปิดแถบได้ (`dismiss()`): จำในหน่วยความจำรอบเปิดแอปนี้ว่าปิดเวอร์ชันไหน (hash) → ไม่ขึ้นซ้ำเมื่อสลับแอปกลับมา ; เวอร์ชันใหม่กว่า (hash ต่าง) ขึ้นได้อีก ; เปิดแอปใหม่จะได้เวอร์ชันล่าสุดเองอยู่แล้ว
 *  - ติดตั้งเวอร์ชันใหม่ไม่สำเร็จ (VERSION_INSTALLATION_FAILED) → state 'failed' → แถบสุภาพ "จะลองใหม่อัตโนมัติ" ขึ้น **ครั้งเดียวต่อการเปิดแอป** หายเองใน 10 วินาที/กดปิดได้ ; ไม่ขึ้นตอนออฟไลน์ (ไม่นับเป็นครั้งที่ขึ้นแล้ว) ; ready/broken มาก่อนก็ไม่ขึ้น ; ลองใหม่เมื่อแอปกลับมาเปิด (ข้างล่าง) หรือเปิดแอปครั้งถัดไป
 *  - แอปกลับมาเปิด (visibilitychange → visible / pageshow ที่กู้จาก bfcache) → `checkForUpdate()` เว้น ≥ 5 นาทีต่อครั้ง ไม่เช็กตอนออฟไลน์/มีเวอร์ชันรออยู่แล้ว ; ไม่มี service worker (แอป Android, dev, http) = ไม่ทำอะไรเลย
 * service worker พัง/แคชไม่ตรง (unrecoverable) → state 'broken' → banner ให้โหลดใหม่
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly sw = inject(SwUpdate, { optional: true });
  private readonly online = inject(OnlineService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<'none' | 'ready' | 'broken' | 'failed'>('none');
  private readonly readyKey = signal<string | null>(null);
  private readonly dismissedKey = signal<string | null>(null);
  /** ค่าที่ banner ใช้ : 'ready' ที่ผู้ใช้ปิดไปแล้ว (เวอร์ชันเดียวกัน) = 'none' */
  readonly bannerState = computed(() => {
    const s = this.state();
    return s === 'ready' && this.dismissedKey() === this.readyKey() ? 'none' : s;
  });

  reload: () => void = () => location.reload();
  now: () => number = () => Date.now();
  private lastCheckAt = this.now();   // ตอนเปิดแอป service worker เช็กเองแล้ว
  private checking = false;
  private failedShown = false;
  private failedTimer: ReturnType<typeof setTimeout> | null = null;

  watch(): void {
    const sw = this.sw;
    if (!sw?.isEnabled) return;
    const subs = [
      sw.versionUpdates.subscribe((e) => {
        if (e.type === 'VERSION_READY') this.onReady(e.latestVersion?.hash ?? null);
        else if (e.type === 'VERSION_INSTALLATION_FAILED') this.onFailed();
      }),
      sw.unrecoverable.subscribe(() => { this.clearFailedTimer(); this.state.set('broken'); }),
    ];
    const onVisible = () => { if (document.visibilityState === 'visible') this.recheck(); };
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) this.recheck(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    this.destroyRef.onDestroy(() => {
      subs.forEach((s) => s.unsubscribe());
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
      this.clearFailedTimer();
    });
  }

  /** กดปุ่มบน banner */
  apply(): void {
    const sw = this.sw;
    if (this.state() === 'ready' && sw) sw.activateUpdate().catch(() => undefined).finally(() => this.reload());
    else this.reload();
  }

  /** กดปิดแถบ (เฉพาะ ready / failed) */
  dismiss(): void {
    const s = this.state();
    if (s === 'ready') this.dismissedKey.set(this.readyKey() ?? 'ready');
    else if (s === 'failed') { this.clearFailedTimer(); this.state.set('none'); }
  }

  private onReady(hash: string | null): void {
    this.clearFailedTimer();
    this.readyKey.set(hash ?? 'ready');
    this.state.set('ready');
  }

  private onFailed(): void {
    if (this.failedShown || this.online.offline() || this.state() !== 'none') return;
    this.failedShown = true;
    this.state.set('failed');
    this.failedTimer = setTimeout(() => { this.failedTimer = null; if (this.state() === 'failed') this.state.set('none'); }, FAILED_AUTOHIDE_MS);
  }

  private recheck(): void {
    const sw = this.sw;
    if (!sw?.isEnabled || this.checking) return;
    const s = this.state();
    if (s === 'ready' || s === 'broken' || this.online.offline()) return;
    const t = this.now();
    if (t - this.lastCheckAt < RECHECK_MIN_MS) return;
    this.lastCheckAt = t;   // ล้มเหลวก็นับ กันยิงถี่
    this.checking = true;
    sw.checkForUpdate().catch(() => false).finally(() => { this.checking = false; });
  }

  private clearFailedTimer(): void {
    if (this.failedTimer) { clearTimeout(this.failedTimer); this.failedTimer = null; }
  }
}
