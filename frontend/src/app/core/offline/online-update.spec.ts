import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { htmlGuardInterceptor } from '../network/html-guard.interceptor';
import { UPDATE_BROKEN_TEXT, UPDATE_READY_TEXT, UpdateService } from '../pwa/update.service';
import { OnlineService } from './online.service';

describe('OnlineService', () => {
  function setup() {
    TestBed.configureTestingModule({});
    return TestBed.inject(OnlineService);
  }
  it('window offline/online event → สลับสถานะ และ online ยิง backOnline', () => {
    const svc = setup();
    let back = 0; svc.backOnline.subscribe(() => back++);
    window.dispatchEvent(new Event('offline'));
    expect(svc.offline()).toBe(true);
    window.dispatchEvent(new Event('online'));
    expect(svc.offline()).toBe(false);
    expect(back).toBe(1);
  });
  it('คำขอล้มเหลว (status 0) = offline แม้ navigator.onLine เป็นจริง ; คำขอสำเร็จครั้งถัดไป = กลับมา + backOnline 1 ครั้ง', () => {
    const svc = setup();
    let back = 0; svc.backOnline.subscribe(() => back++);
    svc.markFailed();
    expect(svc.offline()).toBe(true);
    svc.markOk(); svc.markOk();
    expect(svc.offline()).toBe(false);
    expect(back).toBe(1);
  });
  it('markOk ตอนไม่ได้ล้มเหลว ไม่ยิง backOnline', () => {
    const svc = setup();
    let back = 0; svc.backOnline.subscribe(() => back++);
    svc.markOk();
    expect(back).toBe(0);
  });
});

describe('htmlGuardInterceptor → OnlineService', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([htmlGuardInterceptor])), provideHttpClientTesting()] });
    return { http: TestBed.inject(HttpClient), ctl: TestBed.inject(HttpTestingController), online: TestBed.inject(OnlineService) };
  }
  it('API status 0 → offline ; ตอบ 200 ครั้งถัดไป → กลับมา', () => {
    const { http, ctl, online } = setup();
    http.get('/api/doses/today').subscribe({ error: () => undefined });
    ctl.expectOne('/api/doses/today').error(new ProgressEvent('error'));
    expect(online.offline()).toBe(true);
    http.get('/api/config').subscribe();
    ctl.expectOne('/api/config').flush({});
    expect(online.offline()).toBe(false);
  });
  it('เซิร์ฟเวอร์ตอบ 500 = ยังออนไลน์ (ไม่ใช่ปัญหาเครือข่าย)', () => {
    const { http, ctl, online } = setup();
    online.markFailed();
    http.get('/api/x').subscribe({ error: () => undefined });
    ctl.expectOne('/api/x').flush({}, { status: 500, statusText: 'x' });
    expect(online.offline()).toBe(false);
  });
});

describe('UpdateService', () => {
  function setup(enabled = true) {
    const versions = new Subject<{ type: string }>();
    const unrecoverable = new Subject<unknown>();
    const sw = { isEnabled: enabled, versionUpdates: versions, unrecoverable, activateUpdate: vi.fn(() => Promise.resolve(true)) };
    TestBed.configureTestingModule({ providers: [{ provide: SwUpdate, useValue: sw }] });
    const svc = TestBed.inject(UpdateService);
    svc.reload = vi.fn();
    return { svc, sw, versions, unrecoverable };
  }
  it('VERSION_READY → state ready (banner "' + UPDATE_READY_TEXT + '") ยังไม่ reload จนกว่าจะกด apply()', async () => {
    const { svc, sw, versions } = setup();
    svc.watch();
    versions.next({ type: 'VERSION_DETECTED' });
    expect(svc.state()).toBe('none');
    versions.next({ type: 'VERSION_READY' });
    expect(svc.state()).toBe('ready');
    expect(svc.reload).not.toHaveBeenCalled();
    svc.apply();
    await Promise.resolve(); await Promise.resolve();
    expect(sw.activateUpdate).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(svc.reload).toHaveBeenCalled();
  });
  it('unrecoverable → state broken (banner "' + UPDATE_BROKEN_TEXT + '") แล้ว reload เมื่อกด', () => {
    const { svc, sw, unrecoverable } = setup();
    svc.watch();
    unrecoverable.next({ reason: 'x' });
    expect(svc.state()).toBe('broken');
    svc.apply();
    expect(svc.reload).toHaveBeenCalled();
    expect(sw.activateUpdate).not.toHaveBeenCalled();
  });
  it('ไม่มี service worker (dev/http) = ไม่ทำอะไร', () => {
    const { svc, versions } = setup(false);
    svc.watch();
    versions.next({ type: 'VERSION_READY' });
    expect(svc.state()).toBe('none');
  });
  it('activateUpdate ล้มเหลวก็ยัง reload (ไม่ค้าง)', async () => {
    const { svc, sw, versions } = setup();
    sw.activateUpdate.mockReturnValueOnce(Promise.reject(new Error('x')));
    svc.watch();
    versions.next({ type: 'VERSION_READY' });
    svc.apply();
    await new Promise((r) => setTimeout(r, 0));
    expect(svc.reload).toHaveBeenCalled();
  });
});

describe('OnlineService — probe ในแอป Android', () => {
  afterEach(() => vi.useRealTimers());
  function setupNative(probe: () => Promise<boolean>) {
    TestBed.configureTestingModule({});
    const svc = TestBed.inject(OnlineService);
    svc.probeEnabled = true; svc.probe = probe;
    return svc;
  }
  it('คำขอล้มเหลวแล้ว tunnel กลับมา → probe สำเร็จเองภายใน 15 วินาที + backOnline ; probe หยุดหลังกลับมา', async () => {
    vi.useFakeTimers();
    let up = false; const probe = vi.fn(async () => up);
    const svc = setupNative(probe);
    let back = 0; svc.backOnline.subscribe(() => back++);
    svc.markFailed();
    await vi.advanceTimersByTimeAsync(15000);
    expect(svc.offline()).toBe(true);        // ยังต่อไม่ได้ = ยังออฟไลน์
    up = true;
    await vi.advanceTimersByTimeAsync(15000);
    expect(svc.offline()).toBe(false);
    expect(back).toBe(1);
    const calls = probe.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(probe.mock.calls.length).toBe(calls);   // หยุด probe แล้ว
  });
  it('เว็บ (probeEnabled=false) ไม่ probe เลย', async () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    const svc = TestBed.inject(OnlineService);
    const probe = vi.fn(async () => true); svc.probe = probe;
    svc.markFailed();
    await vi.advanceTimersByTimeAsync(60000);
    expect(probe).not.toHaveBeenCalled();
    expect(svc.offline()).toBe(true);
  });
});
