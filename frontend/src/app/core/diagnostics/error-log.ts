import { endpointOf } from '../api/error-ref';

/**
 * บันทึก error ฝั่งแอป (เฉพาะเครื่องนี้ ใน localStorage) เพื่อให้ผู้ทดสอบดูย้อนหลังได้ — 20 รายการล่าสุด
 * เก็บแค่: เวลา · route (ไม่รวม query/fragment) · รหัส · endpoint (ไม่รวม query) · status
 * ห้ามเก็บ body / token / ชื่อยา / stack / ข้อความ error ; ล้างเมื่อ logout
 */
export const ERROR_LOG_KEY = 'yatung_errlog';
export const ERROR_LOG_MAX = 20;

export interface ErrorEntry {
  /** "YYYY-MM-DD HH:MM:SS" เวลาไทย */
  t: string;
  route: string;
  code: string;
  endpoint: string | null;
  status: number | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
export function bangkokStamp(ms: number): string {
  const d = new Date(ms + 7 * 3_600_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

const clip = (s: unknown, n: number) => String(s ?? '').replace(/[^\w/:.\-]/g, '').slice(0, n);

export function makeEntry(o: { now: number; url: string; code: string; endpoint?: string | null; status?: number | null }): ErrorEntry {
  return {
    t: bangkokStamp(o.now),
    route: endpointOf(o.url) || '/',
    code: clip(o.code, 12) || 'E-JS',
    endpoint: o.endpoint ? endpointOf(o.endpoint) : null,
    status: typeof o.status === 'number' ? o.status : null,
  };
}

export function parseLog(raw: string | null): ErrorEntry[] {
  try {
    const v = JSON.parse(raw ?? '[]') as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((e): e is ErrorEntry => !!e && typeof e === 'object' && typeof (e as ErrorEntry).t === 'string' && typeof (e as ErrorEntry).code === 'string').slice(-ERROR_LOG_MAX);
  } catch { return []; }
}

/** เพิ่มรายการท้ายสุด เก็บแค่ ERROR_LOG_MAX รายการล่าสุด */
export const appendEntry = (list: ErrorEntry[], e: ErrorEntry): ErrorEntry[] => [...list, e].slice(-ERROR_LOG_MAX);

export function readErrorLog(): ErrorEntry[] {
  try { return parseLog(localStorage.getItem(ERROR_LOG_KEY)); } catch { return []; }
}
export function recordError(e: ErrorEntry): ErrorEntry[] {
  const next = appendEntry(readErrorLog(), e);
  try { localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(next)); } catch { /* ใช้งานต่อได้ */ }
  return next;
}
export function clearErrorLog(): void {
  try { localStorage.removeItem(ERROR_LOG_KEY); } catch { /* ignore */ }
}
