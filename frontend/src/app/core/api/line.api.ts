import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// รูปแบบ response ของ node-red/data/lib/line-service.js และ caregiver-service.js
export interface LinkCode {
  code: string;
  expires_at: string;            // YYYY-MM-DD HH:mm:ss (เวลาไทย)
  expires_in: number;            // วินาทีที่เหลือ ณ ตอนตอบ
  /** ลิงก์เปิด LINE พร้อมพิมพ์รหัสรอไว้ให้ (null = ไม่ได้ตั้ง LINE_OA_BASIC_ID) */
  oa_message_url: string | null;
}

export interface LineStatus { linked: boolean; display_name: string | null }

/** ประวัติการแจ้งญาติ 1 กลุ่ม (ผู้ดูแล, มื้อ) : confirmed = ญาติกดยืนยันว่ากินแล้ว · acknowledged = รับทราบ · none = ไม่มีการตอบ · failed = ส่งไม่สำเร็จ */
export interface EscalationRecent {
  sent_at: string;               // YYYY-MM-DD HH:mm:ss
  scheduled_at: string;
  slot: 'morning' | 'noon' | 'evening' | 'bedtime';
  time: string;                  // HH:mm ของมื้อ
  doses: number;
  outcome: 'confirmed' | 'acknowledged' | 'none' | 'failed';
}

export interface Caregiver {
  id: number;
  name: string;
  relation: string | null;
  escalate_after_min: number;
  line_linked: boolean;
  line_display_name: string | null;
  recent_escalations?: EscalationRecent[];
}

export interface CaregiverInput { name: string; relation: string | null; escalate_after_min: number }

@Injectable({ providedIn: 'root' })
export class LineApi {
  private http = inject(HttpClient);

  linkCode(): Observable<LinkCode> { return this.http.post<LinkCode>('/api/line/link-code', {}); }
  status(): Observable<LineStatus> { return this.http.get<LineStatus>('/api/line/status'); }
  unlink(): Observable<{ linked: false }> { return this.http.delete<{ linked: false }>('/api/line/link'); }

  caregivers(): Observable<{ caregivers: Caregiver[] }> { return this.http.get<{ caregivers: Caregiver[] }>('/api/caregivers'); }
  addCaregiver(b: CaregiverInput): Observable<Caregiver> { return this.http.post<Caregiver>('/api/caregivers', b); }
  updateCaregiver(id: number, b: Partial<CaregiverInput>): Observable<Caregiver> { return this.http.patch<Caregiver>(`/api/caregivers/${id}`, b); }
  deleteCaregiver(id: number): Observable<{ deleted: true }> { return this.http.delete<{ deleted: true }>(`/api/caregivers/${id}`); }
  caregiverLinkCode(id: number): Observable<LinkCode> { return this.http.post<LinkCode>(`/api/caregivers/${id}/link-code`, {}); }
}

export interface AppConfig { demoMode: boolean }
export interface RemindNowResult { sent: number; doses: number; slot: 'morning' | 'noon' | 'evening' | 'bedtime'; time: string; resent: boolean; state: 'soon' | 'due' | 'overdue'; late_min: number; message: string }

export interface EscalateNowResult { sent: number; caregivers: number; doses: number; slot: 'morning' | 'noon' | 'evening' | 'bedtime'; time: string; resent: boolean; message: string }

@Injectable({ providedIn: 'root' })
export class DemoApi {
  private http = inject(HttpClient);

  /** เปิดสาธารณะ (ไม่ต้อง JWT) ส่งกลับแค่ { demoMode } */
  config(): Observable<AppConfig> { return this.http.get<AppConfig>('/api/config'); }
  /** เฉพาะ DEMO_MODE=true ; 409 = ไม่มีรอบที่รอกิน / ยังไม่เชื่อม LINE */
  remindNow(): Observable<RemindNowResult> { return this.http.post<RemindNowResult>('/api/demo/remind-now', {}); }
  /** แจ้งญาติทันที ; 409 ALREADY_ESCALATED (body.quota_left) = แจ้งไปแล้ว → force:true ส่งซ้ำได้ */
  escalateNow(force = false): Observable<EscalateNowResult> { return this.http.post<EscalateNowResult>('/api/demo/escalate-now', force ? { force: true } : {}); }
}
