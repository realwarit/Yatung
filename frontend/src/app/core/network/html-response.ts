import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';

/** header ที่บอก ngrok ฟรีให้ข้ามหน้าเตือน "Visit Site" (ไม่มีผลเมื่อไม่ได้ผ่าน ngrok) */
export const NGROK_SKIP_HEADER = 'ngrok-skip-browser-warning';

/** พารามิเตอร์ที่ service worker ไม่ดักจับ (ngsw-bypass) → ไปแล้วเห็นหน้า Visit Site จริง แล้ว ngrok พากลับ URL เดิม */
export const RECONNECT_PARAM = 'ngsw-bypass';
export const RECONNECT_URL = `/today?${RECONNECT_PARAM}=true`;

export function isHtmlContentType(ct: string | null | undefined): boolean {
  return /^\s*(text\/html|application\/xhtml)/i.test(ct ?? '');
}

/** ข้อความที่ขึ้นต้นเหมือนเอกสาร HTML (ใช้เมื่อไม่มี content-type) */
export function looksLikeHtml(text: unknown): boolean {
  return typeof text === 'string' && /^\s*(<!doctype\s+html|<html[\s>])/i.test(text);
}

function ctOf(headers: HttpHeaders | null | undefined): string | null {
  return headers?.get('content-type') ?? null;
}

/**
 * response ของ API ที่ "สำเร็จ" (2xx) แต่เป็น HTML = ไม่ได้มาจากเซิร์ฟเวอร์เรา (หน้าเตือนของ ngrok / captive portal)
 * — API ของเราไม่เคยตอบ HTML ; 502 ของ nginx เป็น HTML เหมือนกันแต่สถานะไม่ใช่ 2xx จึงไม่นับ
 */
export function isHtmlSuccess(status: number, headers: HttpHeaders | null | undefined): boolean {
  return status >= 200 && status < 300 && isHtmlContentType(ctOf(headers));
}

/** HttpClient อ่าน JSON ไม่ได้ (status 2xx แต่ parse พัง) เพราะได้ HTML กลับมา */
export function isInterstitialError(err: unknown): boolean {
  if (!(err instanceof HttpErrorResponse)) return false;
  if (!(err.status >= 200 && err.status < 300)) return false;
  if (isHtmlContentType(ctOf(err.headers))) return true;
  const e = err.error as { text?: unknown } | string | null;
  return looksLikeHtml(typeof e === 'string' ? e : e?.text);
}
