import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SpeechBubbleComponent } from './speech-bubble.component';

@Component({
  imports: [SpeechBubbleComponent],
  template: `<app-speech-bubble [text]="text()" [typing]="typing()" />`,
})
class Host {
  text = signal('สวัสดีค่ะ');
  typing = signal(true);
}

function stubReducedMotion(on: boolean): void {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
}

function mount() {
  const f = TestBed.createComponent(Host);
  f.detectChanges();
  return f;
}
const q = (f: { nativeElement: HTMLElement }, sel: string) => f.nativeElement.querySelector(sel) as HTMLElement | null;

describe('SpeechBubbleComponent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('typing=false → แสดงข้อความทันที ไม่มีชั้นพิมพ์', () => {
    stubReducedMotion(false);
    const f = TestBed.createComponent(Host);
    f.componentInstance.typing.set(false);
    f.detectChanges();
    expect(q(f, '.t')?.textContent).toBe('สวัสดีค่ะ');
    expect(q(f, '.typed')).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(q(f, '.dot')).toBeNull();
  });

  it('typing=true + prefers-reduced-motion → แสดงข้อความเต็มทันที ไม่มีจุด "..." และไม่ตั้งตัวจับเวลา', () => {
    stubReducedMotion(true);
    const f = mount();
    expect(q(f, '.typed')?.textContent?.trim()).toBe('สวัสดีค่ะ');
    expect(q(f, '.dot')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('typing=true ปกติ → จุด "..." ก่อน แล้วพิมพ์ทีละตัวจนครบ ; ข้อความเต็มอยู่ใน DOM ตลอด (ตัวอ่านหน้าจอ)', () => {
    stubReducedMotion(false);
    const f = mount();
    expect(q(f, '.full')?.textContent).toBe('สวัสดีค่ะ');
    expect(q(f, '.dot')).not.toBeNull();
    vi.advanceTimersByTime(600 + 28 * 3);
    f.detectChanges();
    expect(q(f, '.dot')).toBeNull();
    const partial = q(f, '.typed')?.textContent?.trim() ?? '';
    expect(partial.length).toBeGreaterThan(0);
    expect('สวัสดีค่ะ'.startsWith(partial)).toBe(true);
    expect(partial).not.toBe('สวัสดีค่ะ');
    vi.advanceTimersByTime(28 * 20);
    f.detectChanges();
    expect(q(f, '.typed')?.textContent?.trim()).toBe('สวัสดีค่ะ');
    expect(q(f, '.full')?.textContent).toBe('สวัสดีค่ะ');
  });

  it('เปลี่ยนข้อความระหว่างพิมพ์ → เริ่มใหม่ ไม่ปนข้อความเก่า', () => {
    stubReducedMotion(false);
    const f = mount();
    vi.advanceTimersByTime(600 + 28 * 2);
    f.componentInstance.text.set('รอสักครู่นะคะ');
    f.detectChanges();
    expect(q(f, '.dot')).not.toBeNull();
    vi.advanceTimersByTime(600 + 28 * 30);
    f.detectChanges();
    expect(q(f, '.typed')?.textContent?.trim()).toBe('รอสักครู่นะคะ');
  });
});
