import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, effect, inject, input } from '@angular/core';
import { FontSizeToggleComponent } from '../../shared/font-size-toggle.component';
import { FontScaleService } from '../../shared/font-scale.service';
import { IconComponent } from '../../shared/icon.component';
import { LogoComponent } from '../../shared/logo.component';
import { MascotComponent, MascotMood } from '../../shared/components/mascot/mascot.component';
import { SpeechBubbleComponent } from '../../shared/components/speech-bubble/speech-bubble.component';
import { WaveHandComponent } from '../../shared/components/wave-hand/wave-hand.component';
import { AuthStageComponent } from './auth-stage.component';

/** ขนาดน้องยาตรงบนมือถือ ลองจากใหญ่ไปเล็ก เลือกขนาดแรกที่ทั้งหน้าพอดีจอ (ความกว้าง px กำหนดใน scss ตาม data-size) */
export const AUTH_SIZES = ['l', 'm', 's'] as const;

/**
 * โครงหน้า Login/Register — น้องยาตรงเป็นตัวเอก
 * จอกว้าง ≥ 1024px: เวทีน้องยาตรงซ้าย + การ์ดฟอร์มขวา
 * มือถือ: น้องยาตรงโผล่หน้าจากหลังการ์ด มือเกาะขอบบน + กล่องคำพูด 1 บรรทัดขวาบน ;
 *   ขนาดน้อง (L 130 → M 96 → S 72 ซ่อนบรรทัดรอง) เลือกจากการวัดจริงว่าทั้งหน้าพอดีจอหรือไม่ (`fit()` ทำตรงบน DOM ไม่ผ่าน signal
 *   จึงไม่กะพริบ) ; วัดซ้ำเมื่อขนาดจอ/แถบด้านบน/ขนาดตัวอักษร/ฟอนต์โหลดเสร็จเปลี่ยน — ไม่วัดตามเนื้อหา (error ขึ้นแล้วน้องไม่หดกลางคัน)
 * หน้าที่ครอบเป็นคนกำหนด mood/ข้อความจาก state ของฟอร์ม
 */
@Component({
  selector: 'app-auth-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AuthStageComponent, FontSizeToggleComponent, IconComponent, LogoComponent, MascotComponent, SpeechBubbleComponent, WaveHandComponent],
  templateUrl: './auth-shell.component.html',
  styleUrl: './auth-shell.component.scss',
})
export class AuthShellComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly fontScale = inject(FontScaleService);

  /** หัวข้อหน้า (h1 ในการ์ด) */
  readonly title = input.required<string>();
  /** บรรทัดรองใต้หัวข้อ (ซ่อนเมื่อน้องยาตรงเป็นขนาด S) */
  readonly lead = input.required<string>();
  /** true = มีมือโบกต่อท้ายหัวข้อ */
  readonly wave = input(false);
  readonly mood = input<MascotMood>('happy');
  /** ข้อความที่เวทีจอกว้างพูด (ยาวได้) */
  readonly message = input.required<string>();
  /** ข้อความกล่องคำพูดบนมือถือ (1 บรรทัด) */
  readonly bubble = input.required<string>();
  /** ใช้แทน bubble เมื่อ bubble ไม่พอดี 1 บรรทัด (เช่น ก++) */
  readonly bubbleShort = input('สวัสดีค่ะ');
  /** mood shy: แง้มนิ้วแอบมอง (ตอนกด "แสดงรหัส") */
  readonly peek = input(false);
  /** false = ฟอร์มกำลัง error/ส่งข้อมูล → กดมาสคอตไม่เปลี่ยนข้อความ */
  readonly chatty = input(true);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const ro = new ResizeObserver(() => this.fit());
      ro.observe(this.host.nativeElement);
      destroyRef.onDestroy(() => ro.disconnect());
      void document.fonts?.ready.then(() => this.fit());
      this.fit();
    });
    // ขนาดตัวอักษรเปลี่ยน (ก / ก+ / ก++) → เนื้อหาเปลี่ยนความสูงโดยที่จอไม่เปลี่ยน
    effect(() => {
      this.fontScale.scale();
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => this.fit());
    });
  }

  /** ขอบล่างของการ์ดฟอร์มอยู่ในจอ (วัดจากขอบบนของ host ที่อยู่ใต้ banner) */
  private cardFits(): boolean {
    const host = this.host.nativeElement;
    const card = host.querySelector<HTMLElement>('.card');
    if (!card) return true;
    return card.getBoundingClientRect().bottom - host.getBoundingClientRect().top <= host.clientHeight - 4;
  }

  /** เลือกขนาดน้องยาตรง / ซ่อนคำในโลโก้ / เลือกข้อความกล่องคำพูด จากการวัดจริง (มือถือเท่านั้น) */
  private fit(): void {
    const host = this.host.nativeElement;
    const content = host.querySelector<HTMLElement>('.content');
    const top = host.querySelector<HTMLElement>('.top');
    const logo = host.querySelector<HTMLElement>('app-logo');
    if (!content || !top || !logo) return;
    logo.classList.remove('word-hide');
    if (matchMedia('(min-width: 1024px)').matches) return;
    // คีย์บอร์ดเปิดอยู่ = จอเตี้ยชั่วคราว ไม่ปรับขนาดกลางคัน
    if (document.documentElement.classList.contains('kb-open')) return;

    // 1) โลโก้: แถวบนไม่พอ → เหลือไอคอน (ยังมี aria-label "ยาตรง")
    if (top.scrollWidth > top.clientWidth + 1) logo.classList.add('word-hide');

    // 2) ขนาดน้องยาตรง: ใหญ่สุดที่การ์ดฟอร์มทั้งใบ (รวมลิงก์สลับหน้า) อยู่ในจอแรก ; ไม่มีขนาดไหนพอ = เล็กสุด
    //    (คำโปรย/ข้อความกำกับใต้การ์ดไม่นับ — ถ้าเนื้อหาเลยจอเล็กน้อยก็เลื่อนได้)
    content.dataset['short'] = '0';
    let chosen: string = AUTH_SIZES[AUTH_SIZES.length - 1];
    for (const s of AUTH_SIZES) {
      content.dataset['size'] = s;
      if (this.cardFits()) { chosen = s; break; }
    }
    content.dataset['size'] = chosen;

    // 3) กล่องคำพูดต้องพอดี 1 บรรทัด ไม่พอ = ข้อความสั้น
    const t = content.querySelector<HTMLElement>('.b-long .t');
    if (t) {
      t.style.whiteSpace = 'nowrap';
      if (t.scrollWidth > t.clientWidth + 1) content.dataset['short'] = '1';
      t.style.whiteSpace = '';
    }
  }
}
