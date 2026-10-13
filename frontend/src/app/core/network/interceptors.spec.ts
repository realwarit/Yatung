import { HttpClient, HttpErrorResponse, HttpHeaders, HttpRequest, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { ConnectionService } from './connection.service';
import { htmlGuardInterceptor } from './html-guard.interceptor';
import { ngrokInterceptor } from './ngrok.interceptor';

const HTML = '<!DOCTYPE html><html><body>ngrok</body></html>';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withInterceptors([ngrokInterceptor, htmlGuardInterceptor])), provideHttpClientTesting()],
  });
  return { http: TestBed.inject(HttpClient), ctl: TestBed.inject(HttpTestingController), conn: TestBed.inject(ConnectionService) };
}

describe('ngrokInterceptor', () => {
  it('ใส่ ngrok-skip-browser-warning ให้ request ไป /api', () => {
    const { http, ctl } = setup();
    http.get('/api/config').subscribe();
    const r = ctl.expectOne('/api/config');
    expect(r.request.headers.get('ngrok-skip-browser-warning')).toBe('1');
    r.flush({});
  });
  it('ไม่ใส่ให้ URL ที่ไม่ใช่ /api (เช่น ngsw.json, ภายนอก)', () => {
    const { http, ctl } = setup();
    http.get('/ngsw.json').subscribe();
    http.get('https://example.com/x').subscribe();
    expect(ctl.expectOne('/ngsw.json').request.headers.has('ngrok-skip-browser-warning')).toBe(false);
    expect(ctl.expectOne('https://example.com/x').request.headers.has('ngrok-skip-browser-warning')).toBe(false);
  });
  it('ไม่เขียนทับ header ที่ตั้งมาแล้ว', () => {
    const { http, ctl } = setup();
    http.get('/api/me', { headers: { 'ngrok-skip-browser-warning': 'custom' } }).subscribe();
    const r = ctl.expectOne('/api/me');
    expect(r.request.headers.get('ngrok-skip-browser-warning')).toBe('custom');
    r.flush({});
  });
});

describe('htmlGuardInterceptor', () => {
  it('API ตอบ 200 เป็น HTML → expired (response ถึงผู้เรียกตามเดิม ไม่ถูกแก้)', () => {
    const { http, ctl, conn } = setup();
    http.get('/api/doses/today').subscribe({ error: () => undefined });
    ctl.expectOne('/api/doses/today').flush(HTML, { status: 200, statusText: 'OK', headers: { 'content-type': 'text/html' } });
    expect(conn.expired()).toBe(true);
  });
  it('HttpClient parse JSON ไม่ได้ (error 2xx ของจริง) → expired และ error ส่งต่อเหมือนเดิม', () => {
    const { conn } = setup();
    const parseFail = new HttpErrorResponse({ status: 200, statusText: 'OK', headers: new HttpHeaders({ 'content-type': 'text/html' }), error: { error: new SyntaxError('x'), text: HTML } });
    const req = new HttpRequest('GET', '/api/doses/today');
    let got: unknown = null;
    TestBed.runInInjectionContext(() => htmlGuardInterceptor(req, () => throwError(() => parseFail))).subscribe({ error: (e) => (got = e) });
    expect(got).toBe(parseFail);
    expect(conn.expired()).toBe(true);
  });
  it('responseType blob ที่ได้ HTML 200 ก็ตรวจพบ', () => {
    const { http, ctl, conn } = setup();
    http.get('/api/prescriptions/1/image', { responseType: 'blob' }).subscribe();
    ctl.expectOne('/api/prescriptions/1/image').flush(new Blob([HTML]), { status: 200, statusText: 'OK', headers: { 'content-type': 'text/html' } });
    expect(conn.expired()).toBe(true);
  });
  it('API ตอบ JSON ปกติ → ไม่ expired และล้างสถานะเดิมที่ค้างจาก API', () => {
    const { http, ctl, conn } = setup();
    conn.markApiHtml();
    http.get('/api/config').subscribe();
    ctl.expectOne('/api/config').flush({ demoMode: true });
    expect(conn.expired()).toBe(false);
  });
  it('502 ของ nginx (HTML) ไม่ใช่หน้าเตือน', () => {
    const { http, ctl, conn } = setup();
    http.get('/api/me').subscribe({ error: () => undefined });
    ctl.expectOne('/api/me').flush('<html>502</html>', { status: 502, statusText: 'Bad Gateway', headers: { 'content-type': 'text/html' } });
    expect(conn.expired()).toBe(false);
  });
  it('401 JSON ปกติ ไม่ใช่หน้าเตือน', () => {
    const { http, ctl, conn } = setup();
    http.get('/api/me').subscribe({ error: () => undefined });
    ctl.expectOne('/api/me').flush({ error: 'UNAUTHORIZED' }, { status: 401, statusText: 'Unauthorized' });
    expect(conn.expired()).toBe(false);
  });
});
