import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { signal } from '@angular/core';
import { DISMISS_MS, InstallCtx, installMode, isDismissed, isIosSafari } from './install';
import { INSTALL_ENV, InstallEnv, InstallService } from './install.service';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1',
  iphoneLine: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.5.0',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};
const NOW = 1_800_000_000_000;
const ctx = (over: Partial<InstallCtx> = {}): InstallCtx => ({ ua: UA.desktopChrome, standalone: false, capacitor: false, hasPrompt: false, dismissedAt: null, now: NOW, ...over });

describe('isIosSafari', () => {
  it('iPhone Safari', () => expect(isIosSafari(UA.iphoneSafari)).toBe(true));
  it('iPadOS ขอเว็บเดสก์ท็อป (Macintosh + จอสัมผัส) = iOS Safari ; Mac จริง (ไม่มีจอสัมผัส) ไม่ใช่', () => {
    expect(isIosSafari(UA.ipadDesktop, 5)).toBe(true);
    expect(isIosSafari(UA.ipadDesktop, 0)).toBe(false);
  });
  it('Chrome บน iOS และเบราว์เซอร์ในแอป LINE ไม่ใช่', () => {
    expect(isIosSafari(UA.iphoneChrome)).toBe(false);
    expect(isIosSafari(UA.iphoneLine)).toBe(false);
  });
  it('Android/เดสก์ท็อป ไม่ใช่', () => {
    expect(isIosSafari(UA.androidChrome)).toBe(false);
    expect(isIosSafari(UA.desktopChrome)).toBe(false);
  });
});

describe('installMode', () => {
  it('Android/Chrome ที่มี beforeinstallprompt → native', () => expect(installMode(ctx({ ua: UA.androidChrome, hasPrompt: true }))).toBe('native'));
  it('iPhone Safari ยังไม่ได้เพิ่ม → ios-guide', () => expect(installMode(ctx({ ua: UA.iphoneSafari }))).toBe('ios-guide'));
  it('ติดตั้งแล้ว (standalone) → ซ่อน ทั้ง native และ ios', () => {
    expect(installMode(ctx({ ua: UA.androidChrome, hasPrompt: true, standalone: true }))).toBeNull();
    expect(installMode(ctx({ ua: UA.iphoneSafari, standalone: true }))).toBeNull();
  });
  it('Capacitor (แอป Android) → ซ่อน', () => expect(installMode(ctx({ ua: UA.androidChrome, hasPrompt: true, capacitor: true }))).toBeNull());
  it('เบราว์เซอร์ที่ไม่มี prompt และไม่ใช่ iOS Safari → ไม่แสดง', () => {
    expect(installMode(ctx({ ua: UA.desktopChrome }))).toBeNull();
    expect(installMode(ctx({ ua: UA.androidChrome }))).toBeNull();
    expect(installMode(ctx({ ua: UA.iphoneChrome }))).toBeNull();
  });
  it('กดปิดแล้วซ่อน 14 วัน แล้วกลับมาแสดง', () => {
    const base = { ua: UA.iphoneSafari };
    expect(installMode(ctx({ ...base, dismissedAt: NOW - 13 * 86_400_000 }))).toBeNull();
    expect(installMode(ctx({ ...base, dismissedAt: NOW - DISMISS_MS + 1 }))).toBeNull();
    expect(installMode(ctx({ ...base, dismissedAt: NOW - DISMISS_MS }))).toBe('ios-guide');
    expect(installMode(ctx({ ...base, dismissedAt: NOW - 15 * 86_400_000 }))).toBe('ios-guide');
  });
  it('ignoreDismiss (หน้าตั้งค่า) แสดงแม้เพิ่งกดปิด แต่ standalone ยังซ่อน', () => {
    expect(installMode(ctx({ ua: UA.iphoneSafari, dismissedAt: NOW - 1000, ignoreDismiss: true }))).toBe('ios-guide');
    expect(installMode(ctx({ ua: UA.iphoneSafari, dismissedAt: NOW - 1000, ignoreDismiss: true, standalone: true }))).toBeNull();
  });
  it('isDismissed: เวลาในอนาคต (นาฬิกาเพี้ยน) ไม่ถือว่าปิดอยู่', () => expect(isDismissed(NOW + 5000, NOW)).toBe(false));
});

describe('InstallService', () => {
  function setup(over: Partial<InstallEnv> = {}) {
    let dismissed: number | null = null;
    const listeners: Record<string, (e: Event) => void> = {};
    const env: InstallEnv = {
      ua: UA.androidChrome, maxTouchPoints: 5, isStandalone: () => false, isCapacitor: () => false,
      readDismissed: () => dismissed, writeDismissed: (ms) => { dismissed = ms; },
      listen: (t, fn) => { listeners[t] = fn; return () => undefined; }, now: () => NOW, ...over,
    };
    const user = signal<{ id: number } | null>({ id: 1 });
    TestBed.configureTestingModule({ providers: [{ provide: INSTALL_ENV, useValue: env }, { provide: AuthService, useValue: { currentUser: user } }] });
    return { svc: TestBed.inject(InstallService), listeners, user, getDismissed: () => dismissed };
  }
  const fakePrompt = (outcome: 'accepted' | 'dismissed') => Object.assign(new Event('beforeinstallprompt'), { prompt: vi.fn(async () => undefined), userChoice: Promise.resolve({ outcome }) });

  it('beforeinstallprompt → native (settings และ today) และ preventDefault', () => {
    const { svc, listeners } = setup();
    expect(svc.settingsMode()).toBeNull();
    const ev = fakePrompt('accepted'); const pd = vi.spyOn(ev, 'preventDefault');
    listeners['beforeinstallprompt'](ev);
    expect(pd).toHaveBeenCalled();
    expect(svc.settingsMode()).toBe('native');
    expect(svc.todayMode()).toBe('native');
  });
  it('install(): เรียก prompt ครั้งเดียว ; accepted → ซ่อน', async () => {
    const { svc, listeners } = setup();
    const ev = fakePrompt('accepted');
    listeners['beforeinstallprompt'](ev);
    expect(await svc.install()).toBe('accepted');
    expect(ev.prompt).toHaveBeenCalledTimes(1);
    expect(svc.settingsMode()).toBeNull();
    expect(await svc.install()).toBe('unavailable');
  });
  it('appinstalled → ซ่อนทันที', () => {
    const { svc, listeners } = setup();
    listeners['beforeinstallprompt'](fakePrompt('dismissed'));
    listeners['appinstalled'](new Event('appinstalled'));
    expect(svc.settingsMode()).toBeNull();
  });
  it('หน้าวันนี้ "ครั้งเดียวหลัง login": markTodayShown แล้วไม่ขึ้นอีก ; login ใหม่ (เปลี่ยนผู้ใช้) เริ่มรอบใหม่', () => {
    const { svc, listeners, user } = setup({ ua: UA.iphoneSafari });
    expect(svc.todayMode()).toBe('ios-guide');
    svc.markTodayShown();
    expect(svc.todayMode()).toBeNull();
    expect(svc.settingsMode()).toBe('ios-guide');   // หน้าตั้งค่าไม่ถูกนับ
    void listeners;
    user.set(null); TestBed.tick(); user.set({ id: 2 }); TestBed.tick();
    expect(svc.todayMode()).toBe('ios-guide');
  });
  it('dismiss(): บันทึกเวลา → today ซ่อน 14 วัน แต่ settings ยังแสดง', () => {
    const { svc, getDismissed } = setup({ ua: UA.iphoneSafari });
    svc.dismiss();
    expect(getDismissed()).toBe(NOW);
    expect(svc.todayModeNow()).toBeNull();
    expect(svc.settingsMode()).toBe('ios-guide');
  });
  it('standalone/Capacitor: ไม่แสดงเลย', () => {
    expect(setup({ ua: UA.iphoneSafari, isStandalone: () => true }).svc.settingsMode()).toBeNull();
    TestBed.resetTestingModule();
    expect(setup({ ua: UA.iphoneSafari, isCapacitor: () => true }).svc.settingsMode()).toBeNull();
  });
});
