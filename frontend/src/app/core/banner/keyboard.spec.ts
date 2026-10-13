import { TestBed } from '@angular/core/testing';
import { KEYBOARD_SETTLE_MS, KeyboardService, isTextField } from './keyboard.service';

function field(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host.firstElementChild as HTMLElement;
}
const settle = () => vi.advanceTimersByTime(KEYBOARD_SETTLE_MS + 5);
const kb = () => document.documentElement.classList.contains('kb-open');
const setWidth = (w: number) => Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });

describe('isTextField : นับเฉพาะช่องพิมพ์ข้อความ', () => {
  it('ช่องข้อความ/อีเมล/รหัสผ่าน/ตัวเลข/textarea = ใช่', () => {
    for (const h of ['<input type="text">', '<input>', '<input type="email">', '<input type="password">', '<input type="number">', '<input type="search">', '<input type="tel">', '<textarea></textarea>']) {
      expect(isTextField(field(h)), h).toBe(true);
    }
  });
  it('select / checkbox / radio / ปุ่ม / ช่องวันที่-เวลา / range / ลิงก์ = ไม่ใช่', () => {
    for (const h of ['<select></select>', '<input type="checkbox">', '<input type="radio">', '<input type="button">', '<input type="date">', '<input type="time">', '<input type="range">', '<button></button>', '<a href="#">x</a>']) {
      expect(isTextField(field(h)), h).toBe(false);
    }
    expect(isTextField(null)).toBe(false);
  });
});

describe('KeyboardService : kb-open ตามช่องที่โฟกัสจริง', () => {
  let svc: KeyboardService;
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    document.documentElement.classList.remove('kb-open');
    setWidth(390);
    svc = TestBed.inject(KeyboardService);
    svc.watch();
  });
  afterEach(() => { vi.useRealTimers(); setWidth(1024); document.documentElement.classList.remove('kb-open'); });

  it('โฟกัสช่องข้อความ → kb-open หลังหน่วง 100ms (ยังไม่ติดทันที) ; ออกจากช่อง → ถอด', () => {
    const a = field('<input id="a" type="email">') as HTMLInputElement;
    a.focus();
    expect(kb()).toBe(false);
    vi.advanceTimersByTime(KEYBOARD_SETTLE_MS - 10);
    expect(kb()).toBe(false);
    settle();
    expect(kb()).toBe(true);
    a.blur();
    settle();
    expect(kb()).toBe(false);
  });

  it('ย้ายจากช่องหนึ่งไปอีกช่อง = ไม่กะพริบ (class ไม่ถูกถอดระหว่างทาง)', () => {
    const a = field('<input type="text">') as HTMLInputElement;
    const b = field('<input type="password">') as HTMLInputElement;
    a.focus(); settle();
    expect(kb()).toBe(true);
    b.focus();                       // focusout ของ a + focusin ของ b
    vi.advanceTimersByTime(KEYBOARD_SETTLE_MS - 10);
    expect(kb()).toBe(true);
    settle();
    expect(kb()).toBe(true);
  });

  it('โฟกัสไปปุ่ม/select = ถอด class (เช็ก activeElement หลังหน่วง ไม่ใช่ relatedTarget)', () => {
    const a = field('<input type="text">') as HTMLInputElement;
    const btn = field('<button>บันทึก</button>') as HTMLButtonElement;
    const sel = field('<select><option>x</option></select>') as HTMLSelectElement;
    a.focus(); settle();
    btn.focus(); settle();
    expect(kb()).toBe(false);
    a.focus(); settle();
    sel.focus(); settle();
    expect(kb()).toBe(false);
  });

  it('select ล้วน/ช่องวันที่ ไม่เปิด kb-open', () => {
    field('<select id="s"><option>x</option></select>');
    (document.getElementById('s') as HTMLElement).focus(); settle();
    expect(kb()).toBe(false);
    const d = field('<input type="date">') as HTMLInputElement;
    d.focus(); settle();
    expect(kb()).toBe(false);
  });

  it('จอ ≥ 1024px ไม่ใส่ class เลย (ไม่มีคีย์บอร์ดบนหน้าจอ/ไม่มีแถบเมนูล่าง)', () => {
    setWidth(1366);
    const a = field('<input type="text">') as HTMLInputElement;
    a.focus(); settle();
    expect(kb()).toBe(false);
  });

  it('ขยายจอเกิน 1024 ขณะโฟกัสอยู่ → ถอด class', () => {
    const a = field('<input type="text">') as HTMLInputElement;
    a.focus(); settle();
    expect(kb()).toBe(true);
    setWidth(1200);
    window.dispatchEvent(new Event('resize')); settle();
    expect(kb()).toBe(false);
  });
});
