import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MedicationInput } from './models';
import { PrescriptionResponse, PrescriptionStatus, Slot } from './medicine-parse.model';

/** รายการที่ผู้ใช้ตรวจแล้ว: สร้างยาใหม่ (ฟอร์มเดียวกับ POST /api/medications) หรือเติมจำนวนให้ยาเดิม */
export type ConfirmItem =
  | { action: 'create'; medication: MedicationInput }
  | { action: 'refill'; medication_id: number; qty: number };

export interface ConfirmResult {
  created: { medication_id: number; name: string; skipped_slots_today: Slot[] }[];
  refilled: { medication_id: number; name: string; remaining_qty: number | null }[];
}

/** ผลสแกนที่รอตรวจ → ยืนยัน/ทิ้ง (JWT แนบโดย auth.interceptor) */
@Injectable({ providedIn: 'root' })
export class PrescriptionApi {
  private http = inject(HttpClient);

  get(id: number | string): Observable<PrescriptionResponse> {
    return this.http.get<PrescriptionResponse>(`/api/prescriptions/${id}`);
  }

  /** รูปซอง (blob) — <img> แนบ JWT ไม่ได้ จึงดึงผ่าน HttpClient แล้วทำ object URL (ผู้เรียกต้อง revoke) ; ไม่มีรูป/ถูกลบแล้ว = 404 */
  image(id: number | string): Observable<Blob> {
    return this.http.get(`/api/prescriptions/${id}/image`, { responseType: 'blob' });
  }

  confirm(id: number | string, items: ConfirmItem[]): Observable<ConfirmResult> {
    return this.http.post<ConfirmResult>(`/api/prescriptions/${id}/confirm`, { items });
  }

  discard(id: number | string): Observable<{ prescription_id: number; status: PrescriptionStatus }> {
    return this.http.post<{ prescription_id: number; status: PrescriptionStatus }>(`/api/prescriptions/${id}/discard`, {});
  }
}
