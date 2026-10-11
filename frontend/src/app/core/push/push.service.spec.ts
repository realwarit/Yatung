import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { PushApi } from '../api/push.api';
import { PushEnv, PushService, detectIos, pushState } from './push.service';

const base: PushEnv = { isIos: false, standalone: false, swEnabled: true, hasPushManager: true, permission: 'default', subscribed: false };

describe('pushState (5 สถานะ)', () => {
  it('ยังไม่เปิด', () => expect(pushState(base)).toBe('off'));
  it('เปิดแล้ว (มี subscription + อนุญาต)', () => expect(pushState({ ...base, permission: 'granted', subscribed: true })).toBe('enabled'));
  it('อนุญาตแล้วแต่ไม่มี subscription → ยังไม่เปิด', () => expect(pushState({ ...base, permission: 'granted' })).toBe('off'));
  it('มี subscription แต่ถูกถอนสิทธิ์ → blocked', () => expect(pushState({ ...base, permission: 'denied', subscribed: true })).toBe('blocked'));
  it('ผู้ใช้กดไม่อนุญาต → blocked', () => expect(pushState({ ...base, permission: 'denied' })).toBe('blocked'));
  it('ไม่มี service worker (เช่น dev) → ไม่รองรับ', () => expect(pushState({ ...base, swEnabled: false })).toBe('unsupported'));
  it('ไม่มี PushManager → ไม่รองรับ', () => expect(pushState({ ...base, hasPushManager: false })).toBe('unsupported'));
  it('ไม่มี Notification → ไม่รองรับ', () => expect(pushState({ ...base, permission: 'unsupported' })).toBe('unsupported'));
  it('iPhone เปิดจาก Safari → ต้องเพิ่มลงหน้าจอโฮมก่อน (แม้ไม่มี PushManager/SW)', () => {
    expect(pushState({ ...base, isIos: true, swEnabled: false, hasPushManager: false, permission: 'unsupported' })).toBe('needs-install');
    expect(pushState({ ...base, isIos: true })).toBe('needs-install');
  });
  it('iPhone เปิดจากหน้าจอโฮม (standalone) → ใช้กฎปกติ', () => {
    expect(pushState({ ...base, isIos: true, standalone: true })).toBe('off');
    expect(pushState({ ...base, isIos: true, standalone: true, permission: 'granted', subscribed: true })).toBe('enabled');
  });
});

describe('detectIos', () => {
  it('iPhone / iPad', () => {
    expect(detectIos({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe(true);
    expect(detectIos({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_4 like Mac OS X)' })).toBe(true);
  });
  it('iPadOS ที่แจ้งว่าเป็น Mac แต่มีจอสัมผัส', () => expect(detectIos({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true));
  it('Mac จริง / Android / Windows ไม่ใช่', () => {
    expect(detectIos({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
    expect(detectIos({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(false);
    expect(detectIos({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32' })).toBe(false);
  });
});

describe('PushService (SwPush จำลอง)', () => {
  const EP = 'https://fcm.googleapis.com/fcm/send/x';
  const rawSub = { endpoint: EP, toJSON: () => ({ endpoint: EP, keys: { p256dh: 'P', auth: 'A' } }) } as unknown as PushSubscription;
  let perm: NotificationPermission;
  let requestPermission: ReturnType<typeof vi.fn>;
  let sw: { isEnabled: boolean; subscription: BehaviorSubject<PushSubscription | null>; requestSubscription: ReturnType<typeof vi.fn>; unsubscribe: ReturnType<typeof vi.fn> };
  let api: { publicKey: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn>; unsubscribe: ReturnType<typeof vi.fn>; test: ReturnType<typeof vi.fn> };
  const original = { Notification: (globalThis as { Notification?: unknown }).Notification, PushManager: (window as { PushManager?: unknown }).PushManager };

  beforeEach(() => {
    perm = 'default';
    requestPermission = vi.fn(async () => { perm = 'granted'; return perm; });
    Object.defineProperty(globalThis, 'Notification', { configurable: true, writable: true, value: { get permission() { return perm; }, requestPermission } });
    (window as unknown as { PushManager: unknown }).PushManager = function PushManager() { /* stub */ };
    sw = {
      isEnabled: true, subscription: new BehaviorSubject<PushSubscription | null>(null),
      requestSubscription: vi.fn(async () => { sw.subscription.next(rawSub); return rawSub; }),
      unsubscribe: vi.fn(async () => { sw.subscription.next(null); }),
    };
    api = {
      publicKey: vi.fn(() => of({ publicKey: 'KEY' })), subscribe: vi.fn(() => of({ subscribed: true, devices: 1 })),
      unsubscribe: vi.fn(() => of({ subscribed: false })), test: vi.fn(() => of({ sent: 1, failed: 0, devices: 1 })),
    };
    TestBed.configureTestingModule({ providers: [{ provide: SwPush, useValue: sw }, { provide: PushApi, useValue: api }] });
  });
  afterEach(() => {
    Object.defineProperty(globalThis, 'Notification', { configurable: true, writable: true, value: original.Notification });
    (window as unknown as { PushManager: unknown }).PushManager = original.PushManager;
  });

  it('refresh: ยังไม่เปิด → off + โหลด public key ไว้ก่อน', async () => {
    const s = TestBed.inject(PushService);
    await s.refresh();
    expect(s.state()).toBe('off'); expect(s.publicKey()).toBe('KEY');
  });
  it('enable: ขอสิทธิ์ → subscribe กับเบราว์เซอร์ → ลงทะเบียนกับเซิร์ฟเวอร์ → enabled', async () => {
    const s = TestBed.inject(PushService);
    await s.refresh(); await s.enable();
    expect(requestPermission).toHaveBeenCalled();
    expect(sw.requestSubscription).toHaveBeenCalledWith({ serverPublicKey: 'KEY' });
    expect(api.subscribe).toHaveBeenCalledWith({ endpoint: EP, keys: { p256dh: 'P', auth: 'A' } });
    expect(s.state()).toBe('enabled'); expect(s.error()).toBeNull();
  });
  it('enable: ผู้ใช้ไม่อนุญาต → blocked และไม่ลงทะเบียน', async () => {
    requestPermission.mockImplementation(async () => { perm = 'denied'; return perm; });
    const s = TestBed.inject(PushService);
    await s.refresh(); await s.enable();
    expect(s.state()).toBe('blocked'); expect(api.subscribe).not.toHaveBeenCalled();
  });
  it('enable: เซิร์ฟเวอร์ไม่รับ → ถอน subscription ในเครื่อง + แสดงข้อความไทย (ไม่ค้างว่าเปิดอยู่)', async () => {
    api.subscribe.mockImplementation(() => throwError(() => new HttpErrorResponse({ status: 400, error: { error: 'VALIDATION', details: 'endpoint ไม่ถูกต้อง' } })));
    const s = TestBed.inject(PushService);
    await s.refresh(); await s.enable();
    expect(sw.unsubscribe).toHaveBeenCalled();
    expect(s.error()).toBe('endpoint ไม่ถูกต้อง'); expect(s.state()).toBe('off');
  });
  it('ระบบยังไม่ตั้ง VAPID (503) → notConfigured และกดเปิดไม่ได้', async () => {
    api.publicKey.mockImplementation(() => throwError(() => new HttpErrorResponse({ status: 503, error: { error: 'PUSH_NOT_CONFIGURED', details: 'x' } })));
    const s = TestBed.inject(PushService);
    await s.refresh();
    expect(s.notConfigured()).toBe(true); expect(s.publicKey()).toBeNull();
    await s.enable(); expect(requestPermission).not.toHaveBeenCalled();
  });
  it('refresh เมื่อเปิดอยู่แล้ว → enabled และ upsert endpoint ให้เป็นของบัญชีปัจจุบัน', async () => {
    perm = 'granted'; sw.subscription.next(rawSub);
    const s = TestBed.inject(PushService);
    await s.refresh();
    expect(s.state()).toBe('enabled'); expect(api.subscribe).toHaveBeenCalledTimes(1);
  });
  it('disable: ถอนในเครื่อง + DELETE endpoint → off', async () => {
    perm = 'granted'; sw.subscription.next(rawSub);
    const s = TestBed.inject(PushService);
    await s.refresh(); await s.disable();
    expect(api.unsubscribe).toHaveBeenCalledWith(EP); expect(s.state()).toBe('off');
  });
  it('sendTest: ข้อความผลลัพธ์ ; ไม่มี subscription ฝั่งเซิร์ฟเวอร์ → แสดง error', async () => {
    perm = 'granted'; sw.subscription.next(rawSub);
    const s = TestBed.inject(PushService);
    await s.refresh(); await s.sendTest();
    expect(s.info()).toContain('ส่งแล้ว');
    api.test.mockImplementation(() => throwError(() => new HttpErrorResponse({ status: 409, error: { error: 'NO_SUBSCRIPTION', details: 'ยังไม่ได้เปิด' } })));
    await s.sendTest();
    expect(s.error()).toBe('ยังไม่ได้เปิด');
  });
});
