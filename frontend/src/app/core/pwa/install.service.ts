import { DestroyRef, Injectable, InjectionToken, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { InstallMode, installMode } from './install';

export const INSTALL_DISMISS_KEY = 'yatung_install_dismissed';

/** ตัวแทนของ window (ให้ทดสอบได้) */
export interface InstallEnv {
  ua: string;
  maxTouchPoints: number;
  isStandalone: () => boolean;
  isCapacitor: () => boolean;
  readDismissed: () => number | null;
  writeDismissed: (ms: number) => void;
  listen: (type: 'beforeinstallprompt' | 'appinstalled', fn: (e: Event) => void) => () => void;
  now: () => number;
}

export const INSTALL_ENV = new InjectionToken<InstallEnv>('INSTALL_ENV', {
  providedIn: 'root',
  factory: (): InstallEnv => ({
    ua: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    maxTouchPoints: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints ?? 0,
    isStandalone: () => (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    isCapacitor: () => !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.(),
    readDismissed: () => { try { const v = Number(localStorage.getItem(INSTALL_DISMISS_KEY)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; } },
    writeDismissed: (ms) => { try { localStorage.setItem(INSTALL_DISMISS_KEY, String(ms)); } catch { /* ignore */ } },
    listen: (type, fn) => { window.addEventListener(type, fn); return () => window.removeEventListener(type, fn); },
    now: () => Date.now(),
  }),
});

interface DeferredPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>; }

/**
 * ชวนติดตั้งแอป: เก็บ beforeinstallprompt (Android/Chrome) · iPhone Safari = การ์ดสอน
 * การ์ดในหน้าวันนี้แสดง "ครั้งเดียวหลัง login" (กดปิดแล้วซ่อน 14 วัน) · หน้าตั้งค่าแสดงเสมอจนกว่าจะติดตั้ง
 */
@Injectable({ providedIn: 'root' })
export class InstallService {
  private readonly env = inject(INSTALL_ENV);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly prompt = signal<DeferredPrompt | null>(null);
  private readonly installed = signal(false);
  private readonly dismissedAt = signal<number | null>(this.env.readDismissed());
  /** หน้าวันนี้ชวนไปแล้วในรอบ login นี้ */
  private readonly todayShown = signal(false);
  private readonly tick = signal(this.env.now());

  constructor() {
    const off1 = this.env.listen('beforeinstallprompt', (e) => { e.preventDefault(); this.prompt.set(e as DeferredPrompt); });
    const off2 = this.env.listen('appinstalled', () => { this.installed.set(true); this.prompt.set(null); });
    this.destroyRef.onDestroy(() => { off1(); off2(); });
    // login/logout (เปลี่ยนผู้ใช้) = เริ่มรอบใหม่ของ "ครั้งเดียวหลัง login"
    effect(() => { this.auth.currentUser(); untracked(() => this.todayShown.set(false)); });
  }

  private modeFor(ignoreDismiss: boolean): InstallMode {
    return installMode({
      ua: this.env.ua, standalone: this.installed() || this.env.isStandalone(), capacitor: this.env.isCapacitor(),
      hasPrompt: this.prompt() !== null, dismissedAt: this.dismissedAt(), now: this.tick(), maxTouchPoints: this.env.maxTouchPoints, ignoreDismiss,
    });
  }

  readonly settingsMode = computed(() => this.modeFor(true));
  /** ติดตั้งแล้ว/เปิดในแอป (standalone หรือ Capacitor) → หน้าตั้งค่าซ่อนแถวติดตั้ง */
  readonly isInstalled = computed(() => this.installed() || this.env.isStandalone() || this.env.isCapacitor());
  /** หน้าวันนี้ ไม่สนว่าชวนไปแล้วหรือยัง (ใช้กับการ์ดที่กำลังแสดงอยู่: หายเมื่อกดปิด/ติดตั้งแล้ว) */
  readonly todayModeNow = computed(() => this.modeFor(false));
  /** หน้าวันนี้: เริ่มแสดงได้เมื่อยังไม่เคยชวนในรอบ login นี้ และไม่ได้กดปิดใน 14 วัน */
  readonly todayMode = computed(() => (this.todayShown() ? null : this.modeFor(false)));

  /** เรียกเมื่อการ์ดในหน้าวันนี้ถูกแสดงแล้ว — ไม่โผล่ซ้ำเมื่อกลับมาหน้านี้ */
  markTodayShown(): void { this.todayShown.set(true); }

  async install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const p = this.prompt();
    if (!p) return 'unavailable';
    this.prompt.set(null);   // prompt() ใช้ได้ครั้งเดียว
    await p.prompt();
    const r = await p.userChoice;
    if (r.outcome === 'accepted') this.installed.set(true);
    return r.outcome;
  }

  dismiss(): void {
    const now = this.env.now();
    this.env.writeDismissed(now);
    this.dismissedAt.set(now);
    this.tick.set(now);
  }
}
