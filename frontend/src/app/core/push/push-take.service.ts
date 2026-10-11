import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { errorText } from '../api/api-error';
import { PushApi } from '../api/push.api';

/** แยก ?take=<token> ออกจาก query string ; cleaned = query ที่เหลือ (ไม่มี take) สำหรับเขียนทับ URL */
export function extractTakeToken(search: string): { token: string | null; cleaned: string } {
  const p = new URLSearchParams(search);
  const token = p.get('take');
  if (token === null) return { token: null, cleaned: search };
  p.delete('take');
  const rest = p.toString();
  return { token: token || null, cleaned: rest ? '?' + rest : '' };
}

/**
 * ปุ่ม "✓ กินแล้ว" บนการแจ้งเตือน (Web Push) เปิดแอปที่ /today?take=<token> — ngsw ส่ง request เองได้แค่ GET จึงให้แอปเรียก
 * POST /api/push/take แทน : ไม่ต้องล็อกอิน (token คือสิทธิ์ ผูกผู้ใช้ + dose, อายุ 12 ชม.) → ลบ ?take= ออกจาก URL ทันที (รีเฟรชแล้วไม่ยิงซ้ำ) → แสดงผลสั้นๆ
 * เรียกตั้งแต่ App สร้าง จึงทำงานก่อน guard พาไปหน้า login
 */
@Injectable({ providedIn: 'root' })
export class PushTakeService {
  private api = inject(PushApi);
  private snack = inject(MatSnackBar);

  /** ยิงเมื่อบันทึกเสร็จ (สำเร็จหรือไม่ก็ตาม) — หน้าวันนี้ฟังเพื่อโหลดข้อมูลใหม่ */
  readonly done = new Subject<void>();

  consumeFromUrl(loc: Pick<Location, 'search' | 'pathname' | 'hash'> = window.location, hist: Pick<History, 'replaceState'> = window.history): void {
    const { token, cleaned } = extractTakeToken(loc.search);
    if (token === null && cleaned === loc.search) return;
    hist.replaceState(hist === window.history ? window.history.state : null, '', loc.pathname + cleaned + loc.hash);
    if (!token) return;
    this.api.take(token).subscribe({
      next: (r) => {
        this.snack.open(r.taken > 0 ? `บันทึกแล้วค่ะ ✓ กินยา ${r.taken} รายการ` : 'บันทึกไว้แล้วค่ะ ✓', 'ปิด', { duration: 6000 });
        this.done.next();
      },
      error: (e) => { this.snack.open(errorText(e), 'ปิด', { duration: 10000 }); this.done.next(); },
    });
  }
}
