import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timeout } from 'rxjs';
import { ScanResponse } from '../../core/api/medicine-parse.model';

/**
 * POST /api/scan
 *   { image: "<base64 jpeg>" }  → Gemini อ่านรูป + ตีความในครั้งเดียว → validate
 *   { text:  "<ข้อความที่พิมพ์เอง>" } → ส่งข้อความให้ Gemini ตีความ
 * GET /api/prescriptions/:id → โหลดผลสแกนซ้ำ (หน้า Review ตอน refresh)
 * JWT ถูกแนบโดย auth.interceptor อยู่แล้ว
 */
@Injectable({ providedIn: 'root' })
export class ScanService {
  private http = inject(HttpClient);
  /** นานกว่า backend (เวลารวมเรียก Gemini ไม่เกิน 40 วินาที รวมลองซ้ำ) */
  private readonly TIMEOUT_MS = 50_000;

  scanImage(base64: string): Observable<ScanResponse> {
    return this.http
      .post<ScanResponse>('/api/scan', { image: base64 })
      .pipe(timeout(this.TIMEOUT_MS));
  }

  getPrescription(id: number | string): Observable<ScanResponse> {
    return this.http.get<ScanResponse>(`/api/prescriptions/${id}`);
  }

  scanText(text: string): Observable<ScanResponse> {
    return this.http
      .post<ScanResponse>('/api/scan', { text: text.trim() })
      .pipe(timeout(this.TIMEOUT_MS));
  }
}
