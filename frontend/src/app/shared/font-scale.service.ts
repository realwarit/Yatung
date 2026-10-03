import { Injectable, signal } from '@angular/core';

export type FontScale = 100 | 112 | 125;
export const FONT_SCALES: readonly FontScale[] = [100, 112, 125];

const KEY = 'yatung_font_scale';

/** ขนาดตัวอักษรทั้งแอป (ก / ก+ / ก++) — ตั้งค่า --yt-font-scale บน <html> และจำไว้ใน localStorage */
@Injectable({ providedIn: 'root' })
export class FontScaleService {
  readonly scale = signal<FontScale>(this.load());

  constructor() {
    this.apply(this.scale());
  }

  set(scale: FontScale): void {
    this.scale.set(scale);
    this.apply(scale);
    try { localStorage.setItem(KEY, String(scale)); } catch { /* storage ถูกบล็อก ใช้ต่อได้ */ }
  }

  private apply(scale: FontScale): void {
    document.documentElement.style.setProperty('--yt-font-scale', String(scale / 100));
  }

  private load(): FontScale {
    try {
      const v = Number(localStorage.getItem(KEY));
      return (FONT_SCALES as readonly number[]).includes(v) ? (v as FontScale) : 100;
    } catch {
      return 100;
    }
  }
}
