import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Slot } from './medicine-parse.model';

/** นับ dose ตามนิยามเดียวทั้งระบบ: due = taken + missed + pending_due ; upcoming ไม่นับ ; rate = null เมื่อ due = 0 */
export interface AdherenceCounts {
  taken: number;
  missed: number;
  pending_due: number;
  due: number;
  rate: number | null;
}

export interface AdherenceDay extends AdherenceCounts {
  date: string;          // YYYY-MM-DD (เวลาไทย)
  label_th: string;      // "จ. 12 ต.ค." (server คำนวณ)
  is_today: boolean;
  upcoming: number;
}

export interface AdherenceMeal { meal: Slot; label_th: string; due: number; taken: number; rate: number | null; }

export interface AdherenceMedication {
  medication_id: number;
  name: string;
  strength: string | null;
  is_active: boolean;
  due: number;
  taken: number;
  rate: number | null;
}

/** ช่องทางที่บันทึกว่ากินแล้ว (นับเฉพาะ taken) ; other = source ที่ไม่รู้จัก ไม่แสดง */
export interface AdherenceSources { app: number; push: number; line: number; caregiver: number; other: number; }

/** GET /api/stats/adherence?days=7 */
export interface AdherenceResponse {
  range: { from: string; to: string; days: number };
  overall: AdherenceCounts;
  days: AdherenceDay[];
  by_meal: AdherenceMeal[];
  by_medication: AdherenceMedication[];
  by_source: AdherenceSources;
  streak_days: number;
  generated_at: string;
}

@Injectable({ providedIn: 'root' })
export class StatsApi {
  private http = inject(HttpClient);

  adherence(days = 7): Observable<AdherenceResponse> {
    return this.http.get<AdherenceResponse>('/api/stats/adherence', { params: new HttpParams().set('days', days) });
  }
}
