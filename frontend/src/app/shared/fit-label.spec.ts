import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FIT_MIN_PX, FitState, fitCandidates, fitSeverity, solveFit, worstFit } from './fit-label';
import { FitLabelDirective } from './fit-label.directive';

/** fits จำลอง : ป้ายต้องการความกว้าง need[ขั้น] (px) ; ขั้น 3 กว้างตามสัดส่วน font-size */
const fitsWith = (avail: number, need: { full: number; short?: number; noicon: number; basePx: number }) => (s: FitState): boolean => {
  const w = s.step === 0 ? need.full : s.step === 1 ? (need.short ?? need.full) : (need.short ?? need.full) - (need.short ? 24 : 24);
  const scaled = s.step === 3 && s.px ? ((need.short ?? need.full) - 24) * (s.px / need.basePx) : w;
  return scaled <= avail;
};

describe('fitLabel: ไล่ขั้น 0→3', () => {
  const need = { full: 300, short: 140, noicon: 116, basePx: 20 };

  it('ขั้น 0: พื้นที่พอ = ป้ายเต็ม', () => {
    expect(solveFit({ hasShort: true, basePx: 20, fits: fitsWith(320, need) })).toEqual({ step: 0, px: null });
  });
  it('ขั้น 1: ป้ายเต็มไม่พอ ป้ายสั้นพอ', () => {
    expect(solveFit({ hasShort: true, basePx: 20, fits: fitsWith(200, need) })).toEqual({ step: 1, px: null });
  });
  it('ขั้น 2: ป้ายสั้นยังไม่พอ ต้องซ่อนไอคอน', () => {
    expect(solveFit({ hasShort: true, basePx: 20, fits: fitsWith(120, need) })).toEqual({ step: 2, px: null });
  });
  it('ขั้น 3: ลด font-size ทีละ 1px จนพอดี', () => {
    const r = solveFit({ hasShort: true, basePx: 20, fits: fitsWith(100, need) });
    expect(r.step).toBe(3);
    expect(r.px).toBe(17);                           // 116 × (px/20) ≤ 100 → px ≤ 17.2 → ลองจาก 19 ลงมา ได้ 17
    expect(r.px).toBeGreaterThanOrEqual(FIT_MIN_PX);
  });
  it('ไม่พอทุกขั้น = ขั้น 3 ที่ 16px (ไม่ต่ำกว่า 16px)', () => {
    const r = solveFit({ hasShort: true, basePx: 20, fits: () => false });
    expect(r).toEqual({ step: 3, px: 16 });
  });
  it('ไม่มีป้ายสั้น: ข้ามขั้น 1 (ขั้น 2 ใช้ป้ายเต็มไม่มีไอคอน)', () => {
    const tried: number[] = [];
    solveFit({ hasShort: false, basePx: 18, fits: (s) => { tried.push(s.step); return false; } });
    expect(tried[0]).toBe(0);
    expect(tried[1]).toBe(2);
    expect(tried).not.toContain(1);
  });
  it('ขนาดเริ่มต้นเท่ากับ/ต่ำกว่า 16px = ไม่มีขั้นลดขนาด', () => {
    expect(fitCandidates(true, 16).filter((c) => c.step === 3)).toEqual([]);
    expect(solveFit({ hasShort: true, basePx: 16, fits: () => false })).toEqual({ step: 2, px: null });
  });
  it('ลำดับลอง : 0, 1, 2, แล้วลดทีละ 1px', () => {
    expect(fitCandidates(true, 19).map((c) => `${c.step}:${c.px}`)).toEqual(['0:null', '1:null', '2:null', '3:18', '3:17', '3:16']);
  });
});

@Component({
  imports: [FitLabelDirective],
  template: `<button fitLabel="ให้น้องยาตรงอ่านซองยา" fitShort="อ่านซองยา"><span class="fl-full">ให้น้องยาตรงอ่านซองยา</span><span class="fl-short" aria-hidden="true">อ่านซองยา</span></button>`,
})
class Host {}

describe('fitLabel directive', () => {
  it('aria-label เป็นป้ายเต็มเสมอ (ป้ายสั้น aria-hidden)', async () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    await f.whenStable();
    const b = f.nativeElement.querySelector('button') as HTMLElement;
    expect(b.getAttribute('aria-label')).toBe('ให้น้องยาตรงอ่านซองยา');
    expect(b.querySelector('.fl-short')?.getAttribute('aria-hidden')).toBe('true');
    expect(b.style.whiteSpace).toBe('nowrap');
  });
});

describe('fitLabel: กลุ่มใช้ขั้นเดียวกัน (D3 0.1)', () => {
  it('ยึดปุ่มที่ต้องย่อมากที่สุด', () => {
    const a: FitState = { step: 0, px: null }, b: FitState = { step: 1, px: null }, c: FitState = { step: 3, px: 18 }, d: FitState = { step: 3, px: 16 };
    expect(worstFit([a, b])).toEqual(b);
    expect(worstFit([b, c, a])).toEqual(c);
    expect(worstFit([c, d])).toEqual(d);                // font เล็กกว่า = ย่อมากกว่า
  });
  it('ไม่มีสมาชิก/ยังไม่วัด = null', () => {
    expect(worstFit([])).toBeNull();
    expect(worstFit([null, undefined])).toBeNull();
  });
  it('ความย่อเรียงตามขั้นแล้วตาม font-size', () => {
    expect(fitSeverity({ step: 2, px: null })).toBeGreaterThan(fitSeverity({ step: 1, px: null }));
    expect(fitSeverity({ step: 3, px: 15 })).toBeGreaterThan(fitSeverity({ step: 3, px: 17 }));
  });
  it('nav: พื้นลด font ที่ 14px (ไม่ใช่ 16)', () => {
    const last = fitCandidates(false, 17, 14).at(-1);
    expect(last).toEqual({ step: 3, px: 14 });
  });
});
