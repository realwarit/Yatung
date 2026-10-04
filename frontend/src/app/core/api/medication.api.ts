import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Medication, MedicationInput } from './models';

@Injectable({ providedIn: 'root' })
export class MedicationApi {
  private http = inject(HttpClient);

  /** active ไม่ระบุ = ทั้งหมด */
  list(active?: boolean): Observable<Medication[]> {
    let params = new HttpParams();
    if (active !== undefined) params = params.set('active', active ? '1' : '0');
    return this.http.get<Medication[]>('/api/medications', { params });
  }
  get(id: number): Observable<Medication> { return this.http.get<Medication>(`/api/medications/${id}`); }
  create(body: MedicationInput): Observable<Medication> { return this.http.post<Medication>('/api/medications', body); }
  update(id: number, body: MedicationInput): Observable<Medication> { return this.http.put<Medication>(`/api/medications/${id}`, body); }
  stop(id: number): Observable<Medication> { return this.http.patch<Medication>(`/api/medications/${id}/stop`, {}); }
  refill(id: number, qty: number): Observable<Medication> { return this.http.post<Medication>(`/api/medications/${id}/refill`, { qty }); }
}
