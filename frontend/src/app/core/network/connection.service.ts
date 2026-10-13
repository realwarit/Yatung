import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { RECONNECT_PARAM, RECONNECT_URL, isHtmlContentType } from './html-response';

export interface ConnectionEnv {
  swEnabled: () => boolean;
  fetchText: (url: string, init: { headers: Record<string, string>; cache: 'no-store' }) => Promise<{ ok: boolean; contentType: string | null }>;
  go: (url: string) => void;
  location: () => { search: string; pathname: string; hash: string };
  replaceUrl: (url: string) => void;
}

export const CONNECTION_ENV = new InjectionToken<ConnectionEnv>('CONNECTION_ENV', {
  providedIn: 'root',
  factory: (): ConnectionEnv => {
    const sw = inject(SwUpdate, { optional: true });   // ไม่มี provider ถ้าไม่ได้เปิด service worker (เช่น ในเทส)
    return {
      swEnabled: () => !!sw?.isEnabled,
      fetchText: async (url, init) => {
        const r = await fetch(url, init);
        return { ok: r.ok, contentType: r.headers.get('content-type') };
      },
      go: (url) => window.location.assign(url),
      location: () => ({ search: location.search, pathname: location.pathname, hash: location.hash }),
      replaceUrl: (url) => history.replaceState(null, '', url),
    };
  },
});

export const PROBE_FIRST_DELAY_MS = 3000;
export const PROBE_MIN_GAP_MS = 30000;

/** เอา ?ngsw-bypass=true ที่ใช้พาไปหน้า Visit Site ออกจาก URL หลังกลับมา (คืน URL ใหม่ หรือ null ถ้าไม่มีพารามิเตอร์) */
export function stripReconnectParam(loc: { search: string; pathname: string; hash: string }): string | null {
  const params = new URLSearchParams(loc.search);
  if (!params.has(RECONNECT_PARAM)) return null;
  params.delete(RECONNECT_PARAM);
  const q = params.toString();
  return `${loc.pathname}${q ? '?' + q : ''}${loc.hash}`;
}

/**
 * สถานะ "การเชื่อมต่อหมดอายุ" (ngrok ฟรีแทรกหน้าเตือน HTML) มี 2 แหล่ง :
 * 1) API ตอบ 2xx เป็น HTML (ตรวจใน html-guard.interceptor)
 * 2) ngsw.json ที่ service worker ใช้เช็กอัปเดตได้ HTML (probe ที่นี่ — ยิงไฟล์ static ไม่พึ่ง API จึงแสดงแถบได้แม้ API พังทั้งหมด)
 */
@Injectable({ providedIn: 'root' })
export class ConnectionService {
  private readonly env = inject(CONNECTION_ENV);
  private readonly destroyRef = inject(DestroyRef);

  private readonly apiHtml = signal(false);
  private readonly swHtml = signal(false);
  readonly expired = computed(() => this.apiHtml() || this.swHtml());
  private lastProbe = 0;

  markApiHtml(): void { this.apiHtml.set(true); }
  markApiOk(): void { if (this.apiHtml()) this.apiHtml.set(false); }

  /** เช็ก ngsw.json แบบเดียวกับที่ service worker เห็น (คุกกี้เดียวกัน ไม่ใส่ header ข้ามหน้าเตือน) ; dev/ไม่มี SW = ข้าม */
  async probe(now = Date.now()): Promise<void> {
    if (!this.env.swEnabled()) return;
    if (this.lastProbe !== 0 && now - this.lastProbe < PROBE_MIN_GAP_MS) return;
    this.lastProbe = now;
    try {
      const r = await this.env.fetchText(`/ngsw.json?ngsw-cache-bust=${now}`, { headers: { 'ngsw-bypass': 'true' }, cache: 'no-store' });
      this.swHtml.set(r.ok && isHtmlContentType(r.contentType));
    } catch { /* ออฟไลน์ = ไม่ใช่เรื่องหน้าเตือน */ }
  }

  /** เรียกครั้งเดียวตอนเริ่มแอป: ล้างพารามิเตอร์พากลับ, probe ครั้งแรก, probe ซ้ำทุกครั้งที่กลับมาเปิดแอป */
  watch(): void {
    const clean = stripReconnectParam(this.env.location());
    if (clean) this.env.replaceUrl(clean);
    const first = setTimeout(() => void this.probe(), PROBE_FIRST_DELAY_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void this.probe(); };
    document.addEventListener('visibilitychange', onVisible);
    this.destroyRef.onDestroy(() => { clearTimeout(first); document.removeEventListener('visibilitychange', onVisible); });
  }

  /** พาไปหน้าที่ service worker ไม่ดักจับ → เห็นหน้า Visit Site → กดแล้ว ngrok พากลับ /today */
  reconnect(): void { this.env.go(RECONNECT_URL); }
}
