import { TestBed } from '@angular/core/testing';
import { CONNECTION_ENV, ConnectionEnv, ConnectionService, PROBE_MIN_GAP_MS, stripReconnectParam } from './connection.service';
import { RECONNECT_URL } from './html-response';

function setup(over: Partial<ConnectionEnv> = {}) {
  const env: ConnectionEnv = {
    swEnabled: () => true,
    fetchText: vi.fn(async () => ({ ok: true, contentType: 'application/json' })),
    go: vi.fn(),
    location: () => ({ search: '', pathname: '/today', hash: '' }),
    replaceUrl: vi.fn(),
    ...over,
  };
  TestBed.configureTestingModule({ providers: [{ provide: CONNECTION_ENV, useValue: env }] });
  return { env, svc: TestBed.inject(ConnectionService) };
}

describe('stripReconnectParam', () => {
  it('ลบ ngsw-bypass และคงพารามิเตอร์อื่น/hash', () => {
    expect(stripReconnectParam({ search: '?ngsw-bypass=true', pathname: '/today', hash: '' })).toBe('/today');
    expect(stripReconnectParam({ search: '?a=1&ngsw-bypass=true', pathname: '/today', hash: '#take=T' })).toBe('/today?a=1#take=T');
  });
  it('ไม่มีพารามิเตอร์ = null (ไม่แตะ URL)', () => expect(stripReconnectParam({ search: '?a=1', pathname: '/today', hash: '' })).toBeNull());
});

describe('ConnectionService.probe (ngsw.json ที่ service worker เห็น)', () => {
  it('ได้ HTML = expired (แม้ API ไม่ได้ถูกเรียกเลย)', async () => {
    const { svc } = setup({ fetchText: vi.fn(async () => ({ ok: true, contentType: 'text/html; charset=utf-8' })) });
    await svc.probe(1000);
    expect(svc.expired()).toBe(true);
  });
  it('ได้ JSON = ปกติ และกลับมาปกติหลังกดผ่านหน้าเตือน', async () => {
    let ct = 'text/html';
    const { svc } = setup({ fetchText: vi.fn(async () => ({ ok: true, contentType: ct })) });
    await svc.probe(1000);
    expect(svc.expired()).toBe(true);
    ct = 'application/json';
    await svc.probe(1000 + PROBE_MIN_GAP_MS);
    expect(svc.expired()).toBe(false);
  });
  it('ยิงด้วย ngsw-bypass + no-store และไม่ใส่ header ข้ามหน้าเตือน (ต้องเห็นแบบเดียวกับ SW)', async () => {
    const { svc, env } = setup();
    await svc.probe(5000);
    const [url, init] = (env.fetchText as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/ngsw.json');
    expect(init.headers['ngsw-bypass']).toBe('true');
    expect(init.headers['ngrok-skip-browser-warning']).toBeUndefined();
    expect(init.cache).toBe('no-store');
  });
  it('ไม่มี service worker (dev) = ไม่ยิงเลย ไม่มี false positive', async () => {
    const { svc, env } = setup({ swEnabled: () => false });
    await svc.probe(1000);
    expect(env.fetchText).not.toHaveBeenCalled();
    expect(svc.expired()).toBe(false);
  });
  it('ถี่เกินไป (น้อยกว่า 30 วินาที) ข้าม', async () => {
    const { svc, env } = setup();
    await svc.probe(1000);
    await svc.probe(2000);
    expect(env.fetchText).toHaveBeenCalledTimes(1);
  });
  it('fetch ล้ม (ออฟไลน์) = ไม่ถือว่าหมดอายุ ไม่ throw', async () => {
    const { svc } = setup({ fetchText: vi.fn(async () => { throw new Error('offline'); }) });
    await expect(svc.probe(1000)).resolves.toBeUndefined();
    expect(svc.expired()).toBe(false);
  });
});

describe('ConnectionService.reconnect / watch', () => {
  it('reconnect ไปที่ path ที่ SW ไม่ดักจับ (ngsw-bypass) แล้วกลับ /today', () => {
    const { svc, env } = setup();
    svc.reconnect();
    expect(env.go).toHaveBeenCalledWith(RECONNECT_URL);
    expect(RECONNECT_URL).toBe('/today?ngsw-bypass=true');
  });
  it('watch() ล้าง ?ngsw-bypass จาก URL ที่พากลับมา', () => {
    const { svc, env } = setup({ location: () => ({ search: '?ngsw-bypass=true', pathname: '/today', hash: '' }) });
    svc.watch();
    expect(env.replaceUrl).toHaveBeenCalledWith('/today');
  });
  it('API พังทั้งหมดก็ยัง expired ได้ (สถานะเป็น signal ในเครื่อง ไม่พึ่งเครือข่าย)', () => {
    const { svc } = setup();
    svc.markApiHtml();
    expect(svc.expired()).toBe(true);
    svc.markApiOk();
    expect(svc.expired()).toBe(false);
  });
});
