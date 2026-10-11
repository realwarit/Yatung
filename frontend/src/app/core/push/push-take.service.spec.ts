import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { PushApi } from '../api/push.api';
import { PushTakeService, extractTakeToken } from './push-take.service';

describe('extractTakeToken', () => {
  it('ไม่มี take → ไม่เปลี่ยน query', () => expect(extractTakeToken('?a=1')).toEqual({ token: null, cleaned: '?a=1' }));
  it('ไม่มี query เลย', () => expect(extractTakeToken('')).toEqual({ token: null, cleaned: '' }));
  it('มีแต่ take → ลบแล้วเหลือว่าง', () => expect(extractTakeToken('?take=abc.def')).toEqual({ token: 'abc.def', cleaned: '' }));
  it('take ปนกับพารามิเตอร์อื่น → เก็บที่เหลือไว้', () => expect(extractTakeToken('?x=1&take=T-1_a.b&y=2')).toEqual({ token: 'T-1_a.b', cleaned: '?x=1&y=2' }));
  it('take ว่าง → ลบทิ้ง ไม่ยิง API', () => expect(extractTakeToken('?take=')).toEqual({ token: null, cleaned: '' }));
});

describe('PushTakeService.consumeFromUrl', () => {
  function setup(api: Partial<PushApi>) {
    const snack = { open: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: PushApi, useValue: api }, { provide: MatSnackBar, useValue: snack }] });
    return { svc: TestBed.inject(PushTakeService), snack };
  }
  const hist = () => ({ replaceState: vi.fn() });

  it('มี token → ลบ ?take= ออกจาก URL ก่อน แล้วยิง POST + แจ้งผล + บอกให้หน้าวันนี้โหลดใหม่', () => {
    const take = vi.fn(() => of({ taken: 2, already: 0, at: '08:01' }));
    const { svc, snack } = setup({ take });
    const h = hist(); let done = 0; svc.done.subscribe(() => done++);
    svc.consumeFromUrl({ search: '?take=TOK', pathname: '/today', hash: '' }, h);
    expect(h.replaceState).toHaveBeenCalledWith(null, '', '/today');
    expect(take).toHaveBeenCalledWith('TOK');
    expect(snack.open.mock.calls[0][0]).toBe('บันทึกแล้วค่ะ ✓ กินยา 2 รายการ');
    expect(done).toBe(1);
  });
  it('กดซ้ำ (taken=0) → "บันทึกไว้แล้วค่ะ"', () => {
    const { svc, snack } = setup({ take: () => of({ taken: 0, already: 2, at: '08:01' }) });
    svc.consumeFromUrl({ search: '?take=TOK', pathname: '/today', hash: '' }, hist());
    expect(snack.open.mock.calls[0][0]).toBe('บันทึกไว้แล้วค่ะ ✓');
  });
  it('token ใช้ไม่ได้ (401) → แสดงข้อความไทยจาก API', () => {
    const err = new HttpErrorResponse({ status: 401, error: { error: 'INVALID_TOKEN', details: 'ลิงก์นี้หมดอายุแล้ว' } });
    const { svc, snack } = setup({ take: () => throwError(() => err) });
    svc.consumeFromUrl({ search: '?take=TOK', pathname: '/today', hash: '' }, hist());
    expect(snack.open.mock.calls[0][0]).toBe('ลิงก์นี้หมดอายุแล้ว');
  });
  it('ไม่มี take → ไม่แตะ URL ไม่ยิง API', () => {
    const take = vi.fn();
    const { svc } = setup({ take });
    const h = hist();
    svc.consumeFromUrl({ search: '?a=1', pathname: '/today', hash: '' }, h);
    expect(h.replaceState).not.toHaveBeenCalled();
    expect(take).not.toHaveBeenCalled();
  });
  it('เก็บ query อื่นและ hash ไว้', () => {
    const { svc } = setup({ take: () => of({ taken: 1, already: 0, at: null }) });
    const h = hist();
    svc.consumeFromUrl({ search: '?a=1&take=T', pathname: '/today', hash: '#x' }, h);
    expect(h.replaceState).toHaveBeenCalledWith(null, '', '/today?a=1#x');
  });
});
