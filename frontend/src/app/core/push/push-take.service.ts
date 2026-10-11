import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { errorText } from '../api/api-error';
import { PushApi } from '../api/push.api';

/**
 * แยก token ของปุ่ม "กินแล้ว" ออกจาก URL — รูปแบบจริงคือ fragment `#take=<token>` (ไม่ถูกส่งไปเซิร์ฟเวอร์ จึงไม่ติด access log ของ nginx / ngrok inspector)
 * ยังรับรูปแบบเก่า `?take=<token>` (จาก notification ที่ส่งไปก่อนแก้) ด้วย ; คืน search/hash ที่ลบ take ออกแล้วสำหรับเขียนทับ URL
 */
export function extractTakeToken(search: string, hash = ''): { token: string | null; search: string; hash: string; found: boolean } {
  let token: string | null = null;
  let found = false;
  let outSearch = search;
  let outHash = hash;
  const q = new URLSearchParams(search);
  if (q.has('take')) { found = true; token = q.get('take') || null; q.delete('take'); const r = q.toString(); outSearch = r ? '?' + r : ''; }
  const h = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  if (h.has('take')) { found = true; token = h.get('take') || token; h.delete('take'); const r = h.toString(); outHash = r ? '#' + r : ''; }
  return { token, search: outSearch, hash: outHash, found };
}

@Injectable({ providedIn: 'root' })
export class PushTakeService {
  private api = inject(PushApi);
  private snack = inject(MatSnackBar);

  /** ยิงเมื่อบันทึกเสร็จ (สำเร็จหรือไม่ก็ตาม) — หน้าวันนี้ฟังเพื่อโหลดข้อมูลใหม่ */
  readonly done = new Subject<void>();

  /** เรียกตอน App สร้าง + ทุกครั้งที่ fragment เปลี่ยน (ngsw navigate ไปหน้าเดิมที่เปิดอยู่ = เปลี่ยนแค่ fragment ไม่โหลดหน้าใหม่) */
  watch(win: Window = window): void {
    this.consumeFromUrl(win.location, win.history);
    win.addEventListener('hashchange', () => this.consumeFromUrl(win.location, win.history));
  }

  consumeFromUrl(loc: Pick<Location, 'search' | 'pathname' | 'hash'> = window.location, hist: Pick<History, 'replaceState'> = window.history): void {
    const r = extractTakeToken(loc.search, loc.hash);
    if (!r.found) return;
    const token = r.token;
    hist.replaceState(hist === window.history ? window.history.state : null, '', loc.pathname + r.search + r.hash);
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
