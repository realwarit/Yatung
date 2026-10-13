import { readFileSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FONT_KEY, LEGACY_FONT_KEY, resolveScale } from './font-scale';
import { FontScaleService } from './font-scale.service';

/** รันสคริปต์ inline ใน index.html กับ storage จำลอง แล้วคืนค่า --yt-font-scale ที่มันตั้ง (null = ไม่ตั้ง) */
function runInline(store: Record<string, string> | 'blocked'): string | null {
  const html = readFileSync('src/index.html', 'utf8');
  const code = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));
  let set: string | null = null;
  const localStorage = store === 'blocked'
    ? { getItem: () => { throw new Error('blocked'); } }
    : { getItem: (k: string) => (k in store ? store[k] : null) };
  const document = { documentElement: { style: { setProperty: (_k: string, v: string) => { set = v; } } } };
  new Function('localStorage', 'document', code)(localStorage, document);
  return set;
}

// ตารางย้ายค่า: เดิม → ขนาดใหม่ (px เท่าเดิมที่ใกล้สุด)
const CASES: { name: string; store: Record<string, string>; scale: number; factor: string | null }[] = [
  { name: 'เดิม 100 (18px) → ก+ (18px)', store: { [LEGACY_FONT_KEY]: '100' }, scale: 112, factor: '1.125' },
  { name: 'เดิม 112 (20.2px) → ก++ (20px)', store: { [LEGACY_FONT_KEY]: '112' }, scale: 125, factor: '1.25' },
  { name: 'เดิม 125 (22.5px) → ก++ (20px)', store: { [LEGACY_FONT_KEY]: '125' }, scale: 125, factor: '1.25' },
  { name: 'ไม่มี key เลย → ก (16px)', store: {}, scale: 100, factor: null },
  { name: 'key ใหม่ชนะ key เดิม', store: { [FONT_KEY]: '100', [LEGACY_FONT_KEY]: '125' }, scale: 100, factor: '1' },
  { name: 'ค่าเสีย → ก', store: { [FONT_KEY]: 'abc', [LEGACY_FONT_KEY]: '999' }, scale: 100, factor: null },
];

describe('font scale migration', () => {
  for (const c of CASES) {
    it(`resolveScale: ${c.name}`, () => {
      expect(resolveScale(c.store[FONT_KEY] ?? null, c.store[LEGACY_FONT_KEY] ?? null).scale).toBe(c.scale);
    });
    it(`inline script ให้ผลตรงกับ resolveScale: ${c.name}`, () => {
      expect(runInline(c.store)).toBe(c.factor === '1' ? '1' : c.factor);
    });
  }
  it('storage ถูกบล็อก: resolveScale ไม่ถูกเรียก/สคริปต์ไม่ throw/ใช้ ก', () => {
    expect(() => runInline('blocked')).not.toThrow();
    expect(runInline('blocked')).toBeNull();
  });
  it('chosen = true เมื่อมี key ใดก็ได้ที่ใช้ได้, false เมื่อไม่มี', () => {
    expect(resolveScale(null, null).chosen).toBe(false);
    expect(resolveScale(null, '100').chosen).toBe(true);
    expect(resolveScale('112', null).chosen).toBe(true);
    expect(resolveScale('x', 'y').chosen).toBe(false);
  });
});

describe('FontScaleService', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.style.removeProperty('--yt-font-scale'); TestBed.resetTestingModule(); });
  afterEach(() => vi.restoreAllMocks());

  it('ย้ายค่าเดิมครั้งเดียว: เขียน key ใหม่ ไม่ลบ key เดิม และตั้ง root ตามขนาดใหม่', () => {
    localStorage.setItem(LEGACY_FONT_KEY, '100');
    const s = TestBed.inject(FontScaleService);
    expect(s.scale()).toBe(112);
    expect(s.chosen()).toBe(true);
    expect(localStorage.getItem(FONT_KEY)).toBe('112');
    expect(localStorage.getItem(LEGACY_FONT_KEY)).toBe('100');
    expect(document.documentElement.style.getPropertyValue('--yt-font-scale')).toBe('1.125');
  });
  it('ไม่มี key: ก, chosen=false, ไม่เขียน storage', () => {
    const s = TestBed.inject(FontScaleService);
    expect(s.scale()).toBe(100);
    expect(s.chosen()).toBe(false);
    expect(localStorage.getItem(FONT_KEY)).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--yt-font-scale')).toBe('1');
  });
  it('set() เขียน key ใหม่ + chosen=true', () => {
    const s = TestBed.inject(FontScaleService);
    s.set(125);
    expect(localStorage.getItem(FONT_KEY)).toBe('125');
    expect(s.chosen()).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--yt-font-scale')).toBe('1.25');
  });
  it('storage ถูกบล็อก: ไม่ throw ใช้ ก และ set() ยังเปลี่ยนขนาดได้', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const s = TestBed.inject(FontScaleService);
    expect(s.scale()).toBe(100);
    expect(() => s.set(112)).not.toThrow();
    expect(s.scale()).toBe(112);
  });
});
