import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { authGuard, guestGuard, rootGuard, welcomeGuard } from './auth.guard';
import { routes } from '../../app.routes';

describe('การนำทางหน้าต้อนรับ (guards)', () => {
  let token: string | null;
  const run = (g: typeof rootGuard, url = '/') =>
    TestBed.runInInjectionContext(() => g({} as never, { url } as never)) as boolean | UrlTree;
  const str = (r: boolean | UrlTree) => (r === true ? 'ok' : TestBed.inject(Router).serializeUrl(r as UrlTree));

  beforeEach(() => {
    token = null;
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: AuthService, useValue: { get token() { return token; }, logout: () => {} } }],
    });
  });

  it('/ ยังไม่ล็อกอิน → /welcome', () => expect(str(run(rootGuard))).toBe('/welcome'));
  it('/ ล็อกอินแล้ว → /today', () => { token = 't'; expect(str(run(rootGuard))).toBe('/today'); });
  it('/welcome ยังไม่ล็อกอิน → แสดงหน้า', () => expect(str(run(welcomeGuard, '/welcome'))).toBe('ok'));
  it('/welcome ล็อกอินแล้ว → /today', () => { token = 't'; expect(str(run(welcomeGuard, '/welcome'))).toBe('/today'); });
  it('deep link ยังไม่ล็อกอิน → /login?returnUrl (ไม่ผ่าน welcome)', () => {
    expect(str(run(authGuard, '/today'))).toBe('/login?returnUrl=%2Ftoday');
    expect(str(run(authGuard, '/settings/line'))).toBe('/login?returnUrl=%2Fsettings%2Fline');
  });
  it('/login ล็อกอินแล้ว → /today', () => { token = 't'; expect(str(run(guestGuard, '/login'))).toBe('/today'); });
  it('route: เฉพาะ path ว่างใช้ rootGuard ; ** ไม่ผ่าน welcome', () => {
    expect(routes.find((r) => r.path === '' && r.pathMatch === 'full')?.canActivate).toContain(rootGuard);
    expect(routes.find((r) => r.path === '**')?.redirectTo).toBe('today');
  });
});
