import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// รูปแบบ response ของ node-red/data/lib/push-service.js (tab 8-Push)
export interface PushSubscribed { subscribed: boolean; devices?: number }
export interface PushTestResult { sent: number; failed: number; devices: number }
export interface PushTakeResult { taken: number; already: number; at: string | null }
export interface NotifySettings { notify_both: boolean; push_subscribed: boolean }

@Injectable({ providedIn: 'root' })
export class PushApi {
  private http = inject(HttpClient);

  /** สาธารณะ (ไม่ต้อง JWT) ; 503 PUSH_NOT_CONFIGURED = ระบบยังไม่ได้ตั้ง VAPID */
  publicKey(): Observable<{ publicKey: string }> { return this.http.get<{ publicKey: string }>('/api/push/public-key'); }
  /** upsert ตาม endpoint (เครื่องเดิมที่เคยเป็นของบัญชีอื่นจะย้ายมาเป็นของบัญชีนี้) */
  subscribe(sub: PushSubscriptionJSON): Observable<PushSubscribed> { return this.http.post<PushSubscribed>('/api/push/subscribe', sub); }
  /** DELETE ใน Node-RED ไม่มี body parser → ส่ง endpoint เป็น query string */
  unsubscribe(endpoint: string): Observable<PushSubscribed> { return this.http.delete<PushSubscribed>('/api/push/subscribe', { params: { endpoint } }); }
  /** ส่งแจ้งเตือนทดลองไปทุกเครื่องของตัวเอง ; 409 NO_SUBSCRIPTION */
  test(): Observable<PushTestResult> { return this.http.post<PushTestResult>('/api/push/test', {}); }
  /** ปุ่ม "✓ กินแล้ว" บน notification — ไม่ใช้ JWT แต่ต้องมี action token (อายุ 12 ชม.) ; กดซ้ำไม่หักยาซ้ำ */
  take(token: string): Observable<PushTakeResult> { return this.http.post<PushTakeResult>('/api/push/take', { token }); }

  /** อ่านจาก GET /api/me (มี notify_both และ push_subscribed = มีอย่างน้อย 1 เครื่อง) */
  notify(): Observable<NotifySettings> { return this.http.get<NotifySettings>('/api/me'); }
  setNotifyBoth(notify_both: boolean): Observable<{ notify_both: boolean }> { return this.http.put<{ notify_both: boolean }>('/api/settings/notify', { notify_both }); }
}
