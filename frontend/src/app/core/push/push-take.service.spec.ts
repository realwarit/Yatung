import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { PushApi } from '../api/push.api';
import { PushTakeService, extractTakeToken } from './push-take.service';

describe('extractTakeToken', () => {
  it('fragment #take= (รูปแบบจริง) → ได้ token และ hash ว่าง', () =>
    expect(extractTakeToken('', '#take=abc.def')).toEqual({ token: 'abc.def', search: '', hash: '', found: true }));
  it('fragment อื่นๆ ที่ไม่มี take → ไม่เปลี่ยน', () =>
    expect(extractTakeToken('?a=1', '#x')).toEqual({ token: null, search: '?a=1', hash: '#x', found: false }));
  it('ไม่มี query/hash เลย', () => expect(extractTakeToken('', '')).toEqual({ token: null, search: '', hash: '', found: false }));
  it('fragment ปนพารามิเตอร์อื่น → เก็บที่เหลือไว้', () =>
    expect(extractTakeToken('', '#x=1&take=T-1_a.b&y=2')).toEqual({ token: 'T-1_a.b', search: '', hash: '#x=1&y=2', found: true }));
  it('รูปแบบเก่า ?take= ยังรับ และลบออก', () =>
    expect(extractTakeToken('?x=1&take=T-1_a.b&y=2', '')).toEqual({ token: 'T-1_a.b', search: '?x=1&y=2', hash: '', found: true }));
  it('take ว่าง → ลบทิ้ง ไม่มี token', () =>
    expect(extractTakeToken('', '#take=')).toEqual({ token: null, search: '', hash: '', found: true }));
});

describe('PushTakeService.consumeFromUrl', () => {
  function setup(api: Partial<PushApi>) {
    const snack = { open: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: PushApi, useValue: api }, { provide: MatSnackBar, useValue: snack }] });
    return { svc: TestBed.inject(PushTakeService), snack };
  }
  const hist = () => ({ replaceState: vi.fn() });

  it('#take= → ลบออกจาก URL ก่อนยิง API (ลำดับ) แล้วแจ้งผล + บอกให้หน้าวันนี้โหลดใหม่', () => {
    const h = hist();
    const take = vi.fn(() => { expect(h.replaceState).toHaveBeenCalledWith(null, '', '/today'); return of({ taken: 2, already: 0, at: '08:01' }); });
    const { svc, snack } = setup({ take });
    let done = 0; svc.done.subscribe(() => done++);
    svc.consumeFromUrl({ search: '', pathname: '/today', hash: '#take=TOK' }, h);
    expect(take).toHaveBeenCalledWith('TOK');
    expect(snack.open.mock.calls[0][0]).toBe('บันทึกแล้วค่ะ ✓ กินยา 2 รายการ');
    expect(done).toBe(1);
  });
  it('ลิงก์เก่า ?take= ยังรับ และลบออกจาก URL ทันทีเหมือนกัน', () => {
    const h = hist(); const take = vi.fn(() => of({ taken: 1, already: 0, at: null }));
    const { svc } = setup({ take });
    svc.consumeFromUrl({ search: '?a=1&take=T', pathname: '/today', hash: '#x' }, h);
    expect(h.replaceState).toHaveBeenCalledWith(null, '', '/today?a=1#x');
    expect(take).toHaveBeenCalledWith('T');
  });
  it('กดซ้ำ (taken=0) → "บันทึกไว้แล้วค่ะ"', () => {
    const { svc, snack } = setup({ take: () => of({ taken: 0, already: 2, at: '08:01' }) });
    svc.consumeFromUrl({ search: '', pathname: '/today', hash: '#take=TOK' }, hist());
    expect(snack.open.mock.calls[0][0]).toBe('บันทึกไว้แล้วค่ะ ✓');
  });
  it('token ใช้ไม่ได้ (401) → แสดงข้อความไทยจาก API', () => {
    const err = new HttpErrorResponse({ status: 401, error: { error: 'INVALID_TOKEN', details: 'ลิงก์นี้หมดอายุแล้ว' } });
    const { svc, snack } = setup({ take: () => throwError(() => err) });
    svc.consumeFromUrl({ search: '', pathname: '/today', hash: '#take=TOK' }, hist());
    expect(snack.open.mock.calls[0][0]).toBe('ลิงก์นี้หมดอายุแล้ว');
  });
  it('ไม่มี take → ไม่แตะ URL ไม่ยิง API', () => {
    const take = vi.fn();
    const { svc } = setup({ take });
    const h = hist();
    svc.consumeFromUrl({ search: '?a=1', pathname: '/today', hash: '#x' }, h);
    expect(h.replaceState).not.toHaveBeenCalled();
    expect(take).not.toHaveBeenCalled();
  });
  it('take ว่าง → ลบจาก URL แต่ไม่ยิง API', () => {
    const take = vi.fn(); const h = hist();
    const { svc } = setup({ take });
    svc.consumeFromUrl({ search: '', pathname: '/today', hash: '#take=' }, h);
    expect(h.replaceState).toHaveBeenCalledWith(null, '', '/today');
    expect(take).not.toHaveBeenCalled();
  });
  it('watch(): เปลี่ยนแค่ fragment ตอนแอปเปิดอยู่ (ngsw navigate) ก็รับ token', () => {
    const take = vi.fn(() => of({ taken: 1, already: 0, at: null }));
    const { svc } = setup({ take });
    const listeners: Array<() => void> = [];
    const win = { location: { search: '', pathname: '/today', hash: '' }, history: { replaceState: vi.fn() }, addEventListener: (_: string, fn: () => void) => listeners.push(fn) };
    svc.watch(win as unknown as Window);
    expect(take).not.toHaveBeenCalled();
    win.location.hash = '#take=LATE';
    listeners.forEach((fn) => fn());
    expect(take).toHaveBeenCalledWith('LATE');
  });
});
