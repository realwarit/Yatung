import { withApiBase } from './api-base.interceptor';

describe('withApiBase', () => {
  it('เว็บ (base ว่าง) ไม่เปลี่ยน URL', () => {
    expect(withApiBase('/api/doses/today', '')).toBe('/api/doses/today');
  });
  it('native เติมโดเมนให้เฉพาะ /api/', () => {
    expect(withApiBase('/api/doses/today?x=1', 'https://example.test')).toBe('https://example.test/api/doses/today?x=1');
    expect(withApiBase('/assets/a.png', 'https://example.test')).toBe('/assets/a.png');
    expect(withApiBase('https://line.me/R/x', 'https://example.test')).toBe('https://line.me/R/x');
  });
});

import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { htmlGuardInterceptor } from './html-guard.interceptor';
import { makeApiBaseInterceptor } from './api-base.interceptor';
import { ngrokInterceptor } from './ngrok.interceptor';

describe('apiBase ในสาย interceptor (ตัวสุดท้าย)', () => {
  it('ตัวอื่นเห็น /api/ ก่อน (ใส่ header ngrok) แล้วโดเมนถูกเติมตอนส่งออก', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([ngrokInterceptor, htmlGuardInterceptor, makeApiBaseInterceptor('https://example.test')])), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpClient); const ctl = TestBed.inject(HttpTestingController);
    http.get('/api/config').subscribe();
    const r = ctl.expectOne('https://example.test/api/config');
    expect(r.request.headers.get('ngrok-skip-browser-warning')).toBe('1');
    r.flush({});
  });
});
