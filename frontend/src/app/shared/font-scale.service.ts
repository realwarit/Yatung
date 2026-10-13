import { Injectable, signal } from '@angular/core';
import { FONT_KEY, FONT_SCALES, FontScale, LEGACY_FONT_KEY, SCALE_FACTOR, resolveScale } from './font-scale';

export { FONT_SCALES };
export type { FontScale };

/** ขนาดตัวอักษรทั้งแอป (ก / ก+ / ก++) — ตั้ง --yt-font-scale บน <html> (root 16px × ตัวคูณ) และจำไว้ใน localStorage */
@Injectable({ providedIn: 'root' })
export class FontScaleService {
  private readonly init = this.load();
  readonly scale = signal<FontScale>(this.init.scale);
  /** ผู้ใช้เคยเลือกขนาดเอง (เดิมหรือใหม่) */
  readonly chosen = signal(this.init.chosen);

  constructor() {
    this.apply(this.scale());
  }

  set(scale: FontScale): void {
    this.scale.set(scale);
    this.chosen.set(true);
    this.apply(scale);
    this.write(scale);
  }

  private apply(scale: FontScale): void {
    document.documentElement.style.setProperty('--yt-font-scale', String(SCALE_FACTOR[scale]));
  }

  private write(scale: FontScale): void {
    try { localStorage.setItem(FONT_KEY, String(scale)); } catch { /* storage ถูกบล็อก ใช้ต่อได้ */ }
  }

  private load() {
    let r = resolveScale(null, null);
    try { r = resolveScale(localStorage.getItem(FONT_KEY), localStorage.getItem(LEGACY_FONT_KEY)); } catch { /* ใช้ค่าเริ่มต้น */ }
    if (r.migrated) this.write(r.scale);
    return r;
  }
}
