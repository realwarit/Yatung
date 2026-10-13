import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/** ช่องที่เรียกคีย์บอร์ดตัวอักษร (input ชนิดข้อความ, textarea, contenteditable) — ไม่นับ select/checkbox/radio/ปุ่ม/ช่องวันที่-เวลา (ใช้ตัวเลือกของระบบ) */
const TEXT_TYPES = new Set(['text', 'email', 'password', 'search', 'tel', 'url', 'number']);

export function isTextField(el: EventTarget | null): boolean {
  const e = el as HTMLElement | null;
  if (!e?.tagName) return false;
  if (e.tagName === 'TEXTAREA') return true;
  if (e.tagName === 'INPUT') return TEXT_TYPES.has(((e as HTMLInputElement).type || 'text').toLowerCase());
  return e.isContentEditable === true;
}

/** จอที่มีคีย์บอร์ดบนหน้าจอ (มือถือ/แท็บเล็ตแนวตั้ง) — ตรงกับจุดตัดของ shell (≥ 1024px = sidebar, ไม่มีแถบเมนูล่างให้ซ่อน) */
export const KEYBOARD_MAX_WIDTH = 1024;
/** หน่วงก่อนตัดสิน (ms) : focusout → focusin ของช่องถัดไปมาไม่พร้อมกัน ; ถ้าตัดสินทันทีจะกะพริบ (แถบเมนูโผล่แล้วหายตอนย้ายช่อง) */
export const KEYBOARD_SETTLE_MS = 100;

/**
 * ใส่ class `kb-open` ที่ <html> ขณะ "ช่องพิมพ์ข้อความ" มีโฟกัสบนจอ < 1024px —
 * meta viewport ใช้ interactive-widget=resizes-content (Android) ทำให้ layout หดตามคีย์บอร์ด แถบเมนูล่างจึงลอยขึ้นมาอยู่บนคีย์บอร์ด → CSS ซ่อน nav.bottom เมื่อมี kb-open (ดู _components.scss)
 * - ตัดสินหลังหน่วง 100ms จาก document.activeElement จริง (ไม่เชื่อ relatedTarget) → ย้ายระหว่างช่อง/โฟกัสไปปุ่มก็ถูกต้อง ไม่กะพริบ
 * - ซ่อนเฉพาะแถบเมนูล่าง ; ปุ่มติดล่างของหน้า (sticky action bar: บันทึกยา, ตรวจผลสแกน) ยังแสดง — ปุ่มบันทึกต้องเห็นเหนือคีย์บอร์ดเสมอ
 * - iOS ไม่ปรับ layout viewport เอง: หลังคีย์บอร์ดเปิด เลื่อนส่วนที่มี data-kb-anchor (ช่อง + ปุ่มยืนยัน) ให้อยู่ในจอด้วย scrollIntoView
 */
@Injectable({ providedIn: 'root' })
export class KeyboardService {
  private readonly doc = inject(DOCUMENT);
  private timer: ReturnType<typeof setTimeout> | undefined;

  watch(): void {
    this.doc.addEventListener('focusin', (e) => {
      this.schedule();
      if (!this.narrow() || !isTextField(e.target)) return;
      const anchor = (e.target as HTMLElement).closest?.('[data-kb-anchor]') as HTMLElement | null;
      if (anchor) setTimeout(() => { if (isTextField(this.doc.activeElement)) anchor.scrollIntoView?.({ block: 'end', behavior: 'smooth' }); }, 300);
    });
    this.doc.addEventListener('focusout', () => this.schedule());
    this.doc.defaultView?.addEventListener('resize', () => this.schedule());
  }

  /** ตัดสินสถานะตอนนี้ทันที (เทสเรียกตรง ๆ ได้) */
  sync(): void {
    this.doc.documentElement.classList.toggle('kb-open', this.narrow() && isTextField(this.doc.activeElement));
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync(), KEYBOARD_SETTLE_MS);
  }

  private narrow(): boolean { return (this.doc.defaultView?.innerWidth ?? KEYBOARD_MAX_WIDTH) < KEYBOARD_MAX_WIDTH; }
}
