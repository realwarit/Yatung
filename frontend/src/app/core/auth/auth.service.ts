import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { ApiError, AuthResponse, AuthUser, RegisterRequest } from './auth.models';

const TOKEN_KEY = 'yatung_token';
const USER_KEY = 'yatung_user';

/** อ่านเวลาหมดอายุ (exp, วินาที) จาก JWT — ใช้เช็กฝั่ง client เท่านั้น server เป็นผู้ตัดสินจริง */
function tokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  readonly currentUser = signal<AuthUser | null>(this.loadUser());
  readonly isLoggedIn = computed(() => this.currentUser() !== null && this.token !== null);

  /** token ที่ยังไม่หมดอายุ หรือ null */
  get token(): string | null {
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      return t && !tokenExpired(t) ? t : null;
    } catch {
      return null;
    }
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/login', { email, password }).pipe(tap(r => this.save(r)));
  }

  register(body: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/register', body).pipe(tap(r => this.save(r)));
  }

  logout(redirect = true): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch { /* ใช้งานต่อได้แม้ storage ถูกบล็อก */ }
    this.currentUser.set(null);
    if (redirect) this.router.navigate(['/login']);
  }

  /** แปลง error จาก HttpClient เป็นข้อความไทยสำหรับแสดงผู้ใช้ */
  static errorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
      const body = err.error as Partial<ApiError> | null;
      if (body && typeof body.details === 'string') return body.details;
    }
    return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
  }

  private save(r: AuthResponse): void {
    try {
      localStorage.setItem(TOKEN_KEY, r.token);
      localStorage.setItem(USER_KEY, JSON.stringify(r.user));
    } catch { /* ignore */ }
    this.currentUser.set(r.user);
  }

  private loadUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      const t = localStorage.getItem(TOKEN_KEY);
      return raw && t && !tokenExpired(t) ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  }
}
