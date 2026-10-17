import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { WelcomePage } from './welcome.page';
import { WelcomeCtaComponent } from './welcome-cta.component';

describe('WelcomePage', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('กด "เริ่มต้นใช้งาน" → /login พร้อม state.from = welcome (ไม่มี returnUrl)', () => {
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    TestBed.createComponent(WelcomePage).componentInstance.start();
    expect(nav).toHaveBeenCalledWith(['/login'], { state: { from: 'welcome' } });
  });

  it('ปุ่มเป็น <button> จริง กดได้ทันที (ไม่ถูก disabled ระหว่างฉากเปิด) และ h1 อ่านเป็น "ยาตรง"', () => {
    const f = TestBed.createComponent(WelcomePage);
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    const btn = el.querySelector('button.go') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toContain('เริ่มต้นใช้งาน');
    expect(el.querySelector('h1')?.getAttribute('aria-label')).toBe('ยาตรง');
    expect(Array.from(el.querySelectorAll('.ch')).every((c) => c.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('คลิกปุ่มส่งเหตุการณ์ start ของ cta', () => {
    const f = TestBed.createComponent(WelcomeCtaComponent);
    f.detectChanges();
    let n = 0;
    f.componentInstance.start.subscribe(() => n++);
    (f.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(n).toBe(1);
  });
});
