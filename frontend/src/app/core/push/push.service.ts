import { Injectable, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { errorCode, errorText } from '../api/api-error';
import { PushApi } from '../api/push.api';
import { isNative } from '../native/native';

/**
 * สถานะการแจ้งเตือนบน "เครื่องนี้"
 *  unsupported   เบราว์เซอร์/โหมดนี้ไม่รองรับ (หรือยังไม่ใช่แอปที่ติดตั้ง)
 *  needs-install iPhone/iPad ที่เปิดจาก Safari — ต้องเพิ่มลงหน้าจอโฮมก่อนถึงจะรับแจ้งเตือนได้ (iOS 16.4+)
 *  off           รองรับแล้ว ยังไม่เปิด
 *  enabled       เปิดแล้ว
 *  blocked       ผู้ใช้เคยกดไม่อนุญาต — ต้องไปเปิดในตั้งค่าของเครื่อง
 */
export type PushState = 'unsupported' | 'needs-install' | 'off' | 'enabled' | 'blocked' | 'native';

export interface PushEnv {
  /** แอป Android : ไม่ใช้ Web Push (ไม่มี service worker) การเตือนมาทาง LINE แทน */
  native?: boolean;
  isIos: boolean;
  standalone: boolean;
  swEnabled: boolean;
  hasPushManager: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
}

/** ตัดสินสถานะจากสภาพแวดล้อม (ฟังก์ชันล้วน ทดสอบได้) */
export function pushState(e: PushEnv): PushState {
  if (e.native) return 'native';
  if (e.isIos && !e.standalone) return 'needs-install';
  if (!e.swEnabled || !e.hasPushManager || e.permission === 'unsupported') return 'unsupported';
  if (e.permission === 'denied') return 'blocked';
  return e.subscribed && e.permission === 'granted' ? 'enabled' : 'off';
}

/** iPhone / iPad (iPadOS 13+ แจ้งตัวเองเป็น Mac แต่มีหน้าจอสัมผัส) */
export function detectIos(nav: { userAgent: string; platform?: string; maxTouchPoints?: number }): boolean {
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1);
}

@Injectable({ providedIn: 'root' })
export class PushService {
  private swPush = inject(SwPush);
  private api = inject(PushApi);

  readonly state = signal<PushState>('unsupported');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  /** ผลทดลองส่ง (แสดงใต้ปุ่ม) */
  readonly info = signal<string | null>(null);
  /** VAPID public key — โหลดไว้ก่อนผู้ใช้กดปุ่ม เพราะ iOS ต้องขอสิทธิ์ภายในการแตะโดยตรง (รอเครือข่ายก่อนขอสิทธิ์ไม่ได้) */
  readonly publicKey = signal<string | null>(null);
  readonly notConfigured = signal(false);

  private env(subscribed: boolean): PushEnv {
    const nav = typeof navigator === 'undefined' ? { userAgent: '' } : navigator;
    const standalone = typeof window !== 'undefined' &&
      ((navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true);
    return {
      native: isNative(),
      isIos: detectIos(nav),
      standalone,
      swEnabled: this.swPush.isEnabled,
      hasPushManager: typeof window !== 'undefined' && 'PushManager' in window,
      permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
      subscribed,
    };
  }

  /** อ่านสถานะจากเครื่องจริง + โหลด public key + (ถ้าเปิดอยู่) ยืนยันกับเซิร์ฟเวอร์ว่าเครื่องนี้เป็นของบัญชีที่ล็อกอินอยู่ */
  async refresh(): Promise<void> {
    let sub: PushSubscription | null = null;
    try { sub = this.swPush.isEnabled ? await firstValueFrom(this.swPush.subscription) : null; } catch { sub = null; }
    this.state.set(pushState(this.env(!!sub)));
    if (this.state() === 'off' || this.state() === 'enabled') await this.loadKey();
    if (this.state() === 'enabled' && sub) {
      // เครื่องเดียวใช้หลายบัญชี: ลงทะเบียนซ้ำเพื่อให้ endpoint นี้เป็นของบัญชีปัจจุบัน (เซิร์ฟเวอร์ upsert) — ล้มเหลวเงียบๆ ได้
      this.api.subscribe(sub.toJSON()).subscribe({ error: () => { /* ไม่รบกวนผู้ใช้ */ } });
    }
  }

  private async loadKey(): Promise<void> {
    if (this.publicKey()) return;
    try {
      this.publicKey.set((await firstValueFrom(this.api.publicKey())).publicKey);
      this.notConfigured.set(false);
    } catch (e) {
      this.notConfigured.set(errorCode(e) === 'PUSH_NOT_CONFIGURED');
      if (!this.notConfigured()) this.error.set(errorText(e));
    }
  }

  /** ต้องเรียกจากการกดปุ่มโดยตรง (ขอสิทธิ์การแจ้งเตือนต้องมาจากการแตะของผู้ใช้) */
  async enable(): Promise<void> {
    const key = this.publicKey();
    if (!key || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.info.set(null);
    try {
      const perm = await Notification.requestPermission();   // ต้องเป็นขั้นแรกหลังการแตะ
      if (perm !== 'granted') { await this.refresh(); return; }
      const sub = await this.swPush.requestSubscription({ serverPublicKey: key });
      try {
        await firstValueFrom(this.api.subscribe(sub.toJSON()));
      } catch (e) {
        await this.swPush.unsubscribe().catch(() => undefined);   // เซิร์ฟเวอร์ไม่รับ → อย่าปล่อยให้เครื่องคิดว่าเปิดอยู่
        throw e;
      }
      this.state.set('enabled');
    } catch (e) {
      this.error.set(this.explain(e));
      await this.refresh();
    } finally {
      this.busy.set(false);
    }
  }

  async disable(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.info.set(null);
    try {
      const sub = await firstValueFrom(this.swPush.subscription);
      await this.swPush.unsubscribe();
      if (sub) await firstValueFrom(this.api.unsubscribe(sub.endpoint)).catch(() => undefined);   // 404 = เซิร์ฟเวอร์ไม่มีอยู่แล้ว ถือว่าเรียบร้อย
      this.state.set('off');
    } catch (e) {
      this.error.set(this.explain(e));
      await this.refresh();
    } finally {
      this.busy.set(false);
    }
  }

  async sendTest(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.info.set(null);
    try {
      const r = await firstValueFrom(this.api.test());
      this.info.set(r.devices > 1 ? `ส่งแล้วไป ${r.sent} จาก ${r.devices} เครื่อง รอสักครู่จะเห็นแจ้งเตือนค่ะ` : 'ส่งแล้วค่ะ รอสักครู่จะเห็นแจ้งเตือนบนเครื่องนี้');
    } catch (e) {
      this.error.set(errorText(e));
      if (errorCode(e) === 'NO_SUBSCRIPTION') await this.refresh();
    } finally {
      this.busy.set(false);
    }
  }

  private explain(e: unknown): string {
    if (errorCode(e) || (e as { status?: number })?.status !== undefined) return errorText(e);
    const msg = String((e as { message?: string })?.message ?? '');
    if (/permission|denied|NotAllowed/i.test(msg)) return 'เครื่องนี้ไม่อนุญาตให้ส่งการแจ้งเตือน ไปเปิดในตั้งค่าของเครื่องแล้วลองใหม่ค่ะ';
    return 'เปิดการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่อีกครั้งค่ะ';
  }
}
