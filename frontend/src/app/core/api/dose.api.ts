import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DoseActionResult, TodayResponse } from './models';

@Injectable({ providedIn: 'root' })
export class DoseApi {
  private http = inject(HttpClient);

  today(): Observable<TodayResponse> { return this.http.get<TodayResponse>('/api/doses/today'); }
  take(id: number): Observable<DoseActionResult> { return this.http.post<DoseActionResult>(`/api/doses/${id}/take`, {}); }
  undo(id: number): Observable<DoseActionResult> { return this.http.post<DoseActionResult>(`/api/doses/${id}/undo`, {}); }
}
