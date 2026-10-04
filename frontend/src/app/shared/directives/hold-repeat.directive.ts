import { Directive, ElementRef, OnDestroy, inject, output } from '@angular/core';

const FIRST_DELAY_MS = 400;   // กดค้างครบเท่านี้ถึงเริ่มเปลี่ยนต่อเนื่อง
const SLOW_MS = 150;
const FAST_MS = 60;
const FAST_AFTER = 8;         // เปลี่ยนไปแล้วกี่ครั้งถึงเร่งเป็นเร็ว

/**
 * ปุ่ม − / + กดค้างเพื่อเปลี่ยนต่อเนื่อง: กดเมาส์/นิ้วครั้งแรกเปลี่ยนทันที, ค้างเกิน 400ms แล้วเปลี่ยนต่อเนื่อง (เร็วขึ้นเรื่อยๆ)
 * คีย์บอร์ด (Enter/Space → click ที่ detail = 0) เปลี่ยนครั้งละ 1
 */
@Directive({
  selector: '[appHoldRepeat]',
  host: {
    '(pointerdown)': 'start($event)',
    '(click)': 'onClick($event)',
    '(contextmenu)': '$event.preventDefault()',
  },
})
export class HoldRepeatDirective implements OnDestroy {
  /** ยิงทุกครั้งที่ควรเปลี่ยนค่า 1 ก้าว */
  readonly appHoldRepeat = output<void>();

  private el = inject<ElementRef<HTMLElement>>(ElementRef);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private count = 0;
  private readonly stopFn = () => this.stop();

  protected start(e: PointerEvent): void {
    if (e.button !== 0 || (this.el.nativeElement as HTMLButtonElement).disabled) return;
    this.stop();
    this.count = 0;
    this.appHoldRepeat.emit();
    this.timer = setTimeout(() => this.tick(), FIRST_DELAY_MS);
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
      this.el.nativeElement.addEventListener(ev, this.stopFn, { once: true });
    }
    document.addEventListener('pointerup', this.stopFn, { once: true });
  }

  protected onClick(e: MouseEvent): void {
    if (e.detail === 0) this.appHoldRepeat.emit();   // คีย์บอร์ด
  }

  private tick(): void {
    if ((this.el.nativeElement as HTMLButtonElement).disabled) { this.stop(); return; }   // ชนค่าสูงสุด/ต่ำสุดแล้ว
    this.appHoldRepeat.emit();
    this.count++;
    this.timer = setTimeout(() => this.tick(), this.count > FAST_AFTER ? FAST_MS : SLOW_MS);
  }

  private stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  ngOnDestroy(): void { this.stop(); }
}
