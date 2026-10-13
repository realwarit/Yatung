import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { errorText } from '../api/api-error';
import { isHtmlContentType, isHtmlSuccess, isInterstitialError, looksLikeHtml } from './html-response';

const HTML = '<!DOCTYPE html><html><head><title>ngrok</title></head></html>';
const h = (ct?: string) => new HttpHeaders(ct ? { 'content-type': ct } : {});

describe('isHtmlContentType / looksLikeHtml', () => {
  it('text/html (มี charset) = HTML', () => expect(isHtmlContentType('text/html; charset=utf-8')).toBe(true));
  it('application/json ไม่ใช่', () => expect(isHtmlContentType('application/json; charset=utf-8')).toBe(false));
  it('null/ว่าง ไม่ใช่', () => {
    expect(isHtmlContentType(null)).toBe(false);
    expect(isHtmlContentType('')).toBe(false);
  });
  it('ข้อความขึ้นต้น doctype html หรือ html', () => {
    expect(looksLikeHtml(HTML)).toBe(true);
    expect(looksLikeHtml('  \n<html lang="en">')).toBe(true);
  });
  it('JSON / ข้อความทั่วไป / ไม่ใช่สตริง ไม่ใช่ HTML', () => {
    expect(looksLikeHtml('{"demoMode":true}')).toBe(false);
    expect(looksLikeHtml('<div>')).toBe(false);
    expect(looksLikeHtml(undefined)).toBe(false);
  });
});

describe('isHtmlSuccess (response ที่สำเร็จแต่เป็น HTML)', () => {
  it('200 + text/html = หน้าเตือน', () => expect(isHtmlSuccess(200, h('text/html'))).toBe(true));
  it('200 + json ปกติ', () => expect(isHtmlSuccess(200, h('application/json'))).toBe(false));
  it('502 ของ nginx เป็น HTML แต่ไม่ใช่ 2xx จึงไม่นับ', () => expect(isHtmlSuccess(502, h('text/html'))).toBe(false));
  it('ไม่มี header', () => expect(isHtmlSuccess(200, null)).toBe(false));
});

describe('isInterstitialError (HttpClient อ่าน JSON ไม่ได้)', () => {
  const parseFail = (body: string, ct?: string) =>
    new HttpErrorResponse({ status: 200, statusText: 'OK', headers: h(ct), error: { error: new SyntaxError('x'), text: body }, url: '/api/doses/today' });

  it('200 + text/html', () => expect(isInterstitialError(parseFail(HTML, 'text/html'))).toBe(true));
  it('200 ไม่มี content-type แต่ body ขึ้นต้นเป็น HTML', () => expect(isInterstitialError(parseFail(HTML))).toBe(true));
  it('200 JSON เสียจริงๆ (ไม่ใช่ HTML) ไม่นับ', () => expect(isInterstitialError(parseFail('{"a":', 'application/json'))).toBe(false));
  it('404/500/502 ที่เป็น HTML ไม่นับ', () => {
    for (const status of [404, 500, 502]) {
      expect(isInterstitialError(new HttpErrorResponse({ status, headers: h('text/html'), error: HTML }))).toBe(false);
    }
  });
  it('status 0 (ออฟไลน์) ไม่นับ', () => expect(isInterstitialError(new HttpErrorResponse({ status: 0 }))).toBe(false));
  it('ไม่ใช่ HttpErrorResponse', () => expect(isInterstitialError(new Error('x'))).toBe(false));
});

describe('errorText', () => {
  it('ได้ HTML แทน JSON → บอกให้เชื่อมต่อใหม่ ไม่ใช่ "เกิดข้อผิดพลาด" เฉยๆ', () => {
    const e = new HttpErrorResponse({ status: 200, headers: h('text/html'), error: { text: HTML } });
    expect(errorText(e)).toContain('การเชื่อมต่อหมดอายุ');
    expect(errorText(e)).not.toBe('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
  });
  it('error อื่นไม่เปลี่ยน', () => expect(errorText(new Error('x'))).toBe('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง (E-JS)'));
});
