import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DoseActionResult, TakeManyResult, TodayResponse } from './models';

@Injectable({ providedIn: 'root' })
export class DoseApi {
  private http = inject(HttpClient);

  today(): Observable<TodayResponse> { return this.http.get<TodayResponse>('/api/doses/today'); }
  take(id: number): Observable<DoseActionResult> { return this.http.post<DoseActionResult>(`/api/doses/${id}/take`, {}); }
  /** กินครบมื้อนี้ : หลายรอบใน transaction เดียว (id ที่ไม่ใช่ของผู้ใช้ถูกข้าม ; กดซ้ำไม่หักยาซ้ำ) */
  takeMany(ids: number[]): Observable<TakeManyResult> { return this.http.post<TakeManyResult>('/api/doses/take-many', { ids }); }
  undo(id: number): Observable<DoseActionResult> { return this.http.post<DoseActionResult>(`/api/doses/${id}/undo`, {}); }
}
