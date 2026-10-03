import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timeout } from 'rxjs';
import { ScanResponse } from '../../core/api/medicine-parse.model';

/**
 * POST /api/scan
 *   { image: "<base64 jpeg>" }  → OCR → LLM → validate
 *   { text:  "<ข้อความที่พิมพ์เอง>" } → ข้าม OCR ไป LLM เลย
 * JWT ถูกแนบโดย auth.interceptor อยู่แล้ว
 */
@Injectable({ providedIn: 'root' })
export class ScanService {
  private http = inject(HttpClient);
  private readonly TIMEOUT_MS = 45_000;

  scanImage(base64: string): Observable<ScanResponse> {
    return this.http
      .post<ScanResponse>('/api/scan', { image: base64 })
      .pipe(timeout(this.TIMEOUT_MS));
  }

  scanText(text: string): Observable<ScanResponse> {
    return this.http
      .post<ScanResponse>('/api/scan', { text: text.trim() })
      .pipe(timeout(this.TIMEOUT_MS));
  }
}
