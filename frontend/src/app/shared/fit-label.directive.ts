import { AfterViewInit, Directive, ElementRef, OnDestroy, effect, inject, input } from '@angular/core';
import { FIT_MIN_PX, FitState, solveFit } from './fit-label';

type FontsDoc = Document & { fonts?: FontFaceSet };

/**
 * ปุ่มบรรทัดเดียวที่ป้ายต้องพอดีเสมอ ไม่ว่าจอแคบ ขนาด ก/ก+/ก++ หรือการขยายตัวอักษรของระบบ (8D-FIX 4-5)
 * วัดจริง (ไม่ใช้ breakpoint ตายตัว) แล้วไล่ขั้น : ป้ายเต็ม → ป้ายสั้น → ป้ายสั้นไม่มีไอคอน → ลด font-size ทีละ 1px (ไม่ต่ำกว่า 16px)
 * วัดใหม่เมื่อ : ความกว้างพ่อ/ปุ่มเปลี่ยน (ResizeObserver) · ขนาด ก เปลี่ยน (style ของ <html>) · ฟอนต์โหลดเสร็จ · ป้ายเปลี่ยน
 *
 * โครง template : <button fitLabel="ป้ายเต็ม" fitShort="ป้ายสั้น"> <icon class="fit-icon"/> <span class="fl-full">ป้ายเต็ม</span><span class="fl-short" aria-hidden="true">ป้ายสั้น</span> </button>
 * (ไม่มี fitShort = ไม่ต้องมี .fl-short) · aria-label ตั้งเป็นป้ายเต็มให้เสมอ · CSS ของคลาส fit-short / fit-noicon อยู่ใน styles/_components.scss
 */
@Directive({
  selector: '[fitLabel]',
  host: { '[attr.aria-label]': 'fitLabel() || null' },
})
export class FitLabelDirective implements AfterViewInit, OnDestroy {
  /** ป้ายเต็ม (ใช้เป็น aria-label) */
  readonly fitLabel = input('');
  /** ป้ายสั้น ('' = ไม่มี) */
  readonly fitShort = input('');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private ro?: ResizeObserver;
  private mo?: MutationObserver;
  private raf = 0;
  private sig = '';
  private ready = false;
  private readonly onFonts = () => this.schedule(true);

  constructor() {
    effect(() => { this.fitLabel(); this.fitShort(); if (this.ready) this.schedule(true); });
  }

  ngAfterViewInit(): void {
    this.ready = true;
    const st = this.host.style;
    st.whiteSpace = 'nowrap'; st.maxWidth = '100%'; st.minWidth = '0'; st.boxSizing = 'border-box';   // กันล้นที่ต้นเหตุ : ปุ่มไม่กว้างเกินพ่อ
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.schedule(false));
      this.ro.observe(this.host);
      if (this.host.parentElement) this.ro.observe(this.host.parentElement);
    }
    if (typeof MutationObserver !== 'undefined') {
      this.mo = new MutationObserver(() => this.schedule(false));
      this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    const fonts = (document as FontsDoc).fonts;
    void fonts?.ready.then(() => this.schedule(true));
    fonts?.addEventListener?.('loadingdone', this.onFonts);
    this.schedule(true);
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
    this.mo?.disconnect();
    (document as FontsDoc).fonts?.removeEventListener?.('loadingdone', this.onFonts);
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  private schedule(force: boolean): void {
    if (force) this.sig = '';
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.run(); });
  }

  private apply(s: FitState, hasShort: boolean): void {
    const h = this.host;
    h.dataset['fit'] = String(s.step);
    h.classList.toggle('fit-short', hasShort && s.step >= 1);
    h.classList.toggle('fit-noicon', s.step >= 2);
    if (s.px) h.style.setProperty('font-size', `${s.px}px`, 'important'); else h.style.removeProperty('font-size');
  }

  /** ลายนิ้วมือของสิ่งที่ทำให้ผลวัดเปลี่ยน — ไม่เปลี่ยน = ไม่ต้องวัดซ้ำ (กัน ResizeObserver วนจากการลองขั้น) */
  private signature(): string {
    const p = this.host.parentElement;
    return [Math.round(p?.getBoundingClientRect().width ?? 0), getComputedStyle(document.documentElement).fontSize, this.fitLabel(), this.fitShort()].join('|');
  }

  private run(): void {
    const h = this.host;
    if (!h.isConnected || h.getBoundingClientRect().width === 0) return;      // ซ่อนอยู่ (display:none) — วัดไม่ได้
    const sig = this.signature();
    if (sig === this.sig && h.dataset['fit'] !== undefined) return;
    const hasShort = !!this.fitShort() && !!h.querySelector('.fl-short');
    this.apply({ step: 0, px: null }, hasShort);
    const basePx = parseFloat(getComputedStyle(h).fontSize) || 16;
    const best = solveFit({ hasShort, basePx, minPx: FIT_MIN_PX, fits: (s) => { this.apply(s, hasShort); return fitsOneLine(h); } });
    this.apply(best, hasShort);
    this.sig = sig;
  }
}

/** ป้ายบรรทัดเดียวและไม่ล้น : ข้อความที่มองเห็นอยู่ใน content box ของตัวปุ่ม และปุ่มไม่กว้างเกินพ่อ */
export function fitsOneLine(host: HTMLElement): boolean {
  const TOL = 0.5;
  const native = host.shadowRoot?.querySelector<HTMLElement>('.button-native') ?? host;
  const nb = native.getBoundingClientRect();
  const cs = getComputedStyle(native);
  const left = nb.left + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0);
  const right = nb.right - (parseFloat(cs.borderRightWidth) || 0) - (parseFloat(cs.paddingRight) || 0);
  const parent = host.parentElement;
  if (parent) {
    const ps = getComputedStyle(parent);
    const pr = parent.getBoundingClientRect().right - (parseFloat(ps.borderRightWidth) || 0) - (parseFloat(ps.paddingRight) || 0);
    if (host.getBoundingClientRect().right > pr + 1 && ps.display !== 'contents') return false;   // ปุ่มกว้างเกินพ่อ
  }
  const tops = new Set<number>();
  const rg = document.createRange();
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!(t.textContent ?? '').trim()) continue;
    const el = t.parentElement;
    if (!el || el.closest('.sr-only')) continue;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || el.getBoundingClientRect().width <= 2) continue;
    rg.selectNodeContents(t);
    for (const q of Array.from(rg.getClientRects())) {
      if (q.width <= 2) continue;
      tops.add(Math.round(q.top / 6));
      if (q.left < left - TOL || q.right > right + TOL) return false;
    }
  }
  if (tops.size > 1) return false;
  return native.scrollWidth <= native.clientWidth + TOL;
}
