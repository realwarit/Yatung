import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { errorText } from './api-error';
import { endpointOf, errorRef, splitRef } from './error-ref';

const http = (status: number, error: unknown = null, headers?: HttpHeaders) => new HttpErrorResponse({ status, error, headers });

describe('รหัสอ้างอิง error', () => {
  it('จับคู่ชนิด error → รหัส', () => {
    expect(errorRef(http(304))).toBe('E-304');
    expect(errorRef(http(401))).toBe('E-401');
    expect(errorRef(http(500))).toBe('E-500');
    expect(errorRef(http(502))).toBe('E-502');
    expect(errorRef(http(0))).toBe('E-NET');
    expect(errorRef(http(200, '<!doctype html><html>', new HttpHeaders({ 'content-type': 'text/html' })))).toBe('E-HTML');
    expect(errorRef(new TypeError('x'))).toBe('E-JS');
  });
  it('errorText ต่อท้ายรหัสเฉพาะ error ที่ไม่คาดคิด (304 ที่ HttpClient มองเป็น error → E-304)', () => {
    expect(errorText(http(304))).toBe('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง (E-304)');
    expect(errorText(http(0))).toMatch(/\(E-NET\)$/);
    expect(errorText(http(500, { error: 'X', details: 'ระบบขัดข้อง' }))).toBe('ระบบขัดข้อง (E-500)');
    expect(errorText(http(400, { error: 'VALIDATION', details: 'ชื่อยาต้องไม่ว่าง' }))).toBe('ชื่อยาต้องไม่ว่าง');
    expect(errorText(http(409, { error: 'ALREADY_TAKEN', details: 'กินแล้ว' }))).toBe('กินแล้ว');
  });
  it('splitRef แยกรหัสท้ายข้อความ', () => {
    expect(splitRef('ระบบขัดข้อง (E-500)')).toEqual({ text: 'ระบบขัดข้อง', ref: 'E-500' });
    expect(splitRef('ข้อความปกติ (ไม่ใช่รหัส)')).toEqual({ text: 'ข้อความปกติ (ไม่ใช่รหัส)', ref: null });
  });
  it('endpointOf ตัด query/fragment และแทนเลข/โทเคน', () => {
    expect(endpointOf('/api/doses/1847/take?x=1')).toBe('/api/doses/:n/take');
    expect(endpointOf('/today#take=abcdef')).toBe('/today');
    expect(endpointOf('https://h.example/api/me?token=secret')).toBe('/api/me');
    expect(endpointOf('/api/push/take/' + 'a'.repeat(40))).toBe('/api/push/take/:x');
  });
});
