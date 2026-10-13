import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

const TEXT_TYPES = new Set(['text', 'email', 'password', 'search', 'tel', 'url', 'number', 'date', 'time']);

/** ช่องที่เรียกคีย์บอร์ด (ไม่ใช่ checkbox/radio/ปุ่ม) */
export function isTextField(el: EventTarget | null): boolean {
  const e = el as HTMLElement | null;
  if (!e?.tagName) return false;
  if (e.tagName === 'TEXTAREA' || e.tagName === 'SELECT') return true;
  if (e.tagName === 'INPUT') return TEXT_TYPES.has(((e as HTMLInputElement).type || 'text').toLowerCase());
  return e.isContentEditable === true;
}

/**
 * ใส่ class `kb-open` ที่ <html> ขณะโฟกัสช่องกรอก — meta viewport ใช้ interactive-widget=resizes-content (Android)
 * ทำให้ layout หดตามคีย์บอร์ด แถบเมนูล่างจึงลอยขึ้นมาอยู่บนคีย์บอร์ด → CSS ซ่อนแถบนั้นเมื่อมี kb-open (ดู _components.scss)
 * focusout ที่ย้ายไปช่องกรอกอื่นไม่ถอด class (กันกะพริบ)
 * iOS ไม่ปรับ layout viewport เอง: หลังคีย์บอร์ดเปิด เลื่อนส่วนที่มี data-kb-anchor (ช่อง + ปุ่มยืนยัน) ให้อยู่ในจอด้วย scrollIntoView
 */
@Injectable({ providedIn: 'root' })
export class KeyboardService {
  private readonly doc = inject(DOCUMENT);

  watch(): void {
    const root = this.doc.documentElement;
    this.doc.addEventListener('focusin', (e) => {
      if (!isTextField(e.target)) return;
      root.classList.add('kb-open');
      const anchor = (e.target as HTMLElement).closest?.('[data-kb-anchor]') as HTMLElement | null;
      if (anchor) setTimeout(() => anchor.scrollIntoView?.({ block: 'end', behavior: 'smooth' }), 300);
    });
    this.doc.addEventListener('focusout', (e) => {
      if (isTextField((e as FocusEvent).relatedTarget)) return;
      root.classList.remove('kb-open');
    });
  }
}
