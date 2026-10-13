import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { SnapData, SnapKind, readSnap, writeSnap } from './snapshot';

/** อ่าน/เขียน snapshot ของผู้ใช้ที่ล็อกอินอยู่ (ไม่ล็อกอิน = ไม่ทำอะไร) ; lastSavedAt = เวลาข้อมูลล่าสุดที่มี (ใช้ในแถบออฟไลน์) */
@Injectable({ providedIn: 'root' })
export class SnapshotService {
  private readonly auth = inject(AuthService);
  readonly lastSavedAt = signal<number | null>(null);

  save<K extends SnapKind>(kind: K, data: SnapData[K], now = Date.now()): void {
    const id = this.auth.currentUser()?.id;
    if (id == null) return;
    writeSnap(id, kind, data, now);
    this.lastSavedAt.set(now);
  }

  load<K extends SnapKind>(kind: K): { savedAt: number; data: SnapData[K] } | null {
    const id = this.auth.currentUser()?.id;
    if (id == null) return null;
    const s = readSnap(id, kind);
    if (s) this.lastSavedAt.update((t) => (t === null || s.savedAt > t ? s.savedAt : t));
    return s;
  }
}
