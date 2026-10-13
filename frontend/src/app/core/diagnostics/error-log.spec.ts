import { ERROR_LOG_KEY, ERROR_LOG_MAX, appendEntry, bangkokStamp, clearErrorLog, makeEntry, parseLog, readErrorLog, recordError } from './error-log';

const e = (n: number) => makeEntry({ now: Date.UTC(2026, 9, 13, 3, 0, n), url: '/today?take=SECRET#take=SECRET', code: 'E-304', endpoint: '/api/doses/12/take?token=SECRET', status: 304 });

describe('บันทึก error ในเครื่อง', () => {
  beforeEach(() => clearErrorLog());

  it('เวลาเป็นเวลาไทย', () => expect(bangkokStamp(Date.UTC(2026, 9, 13, 3, 4, 5))).toBe('2026-10-13 10:04:05'));
  it('เก็บแค่เวลา route รหัส endpoint status — ไม่มี query/fragment/โทเคน', () => {
    const x = e(1);
    expect(Object.keys(x).sort()).toEqual(['code', 'endpoint', 'route', 'status', 't']);
    expect(JSON.stringify(x)).not.toContain('SECRET');
    expect(x.route).toBe('/today');
    expect(x.endpoint).toBe('/api/doses/:n/take');
  });
  it('เก็บ 20 รายการล่าสุดเท่านั้น', () => {
    let list = parseLog(null);
    for (let i = 0; i < 30; i++) list = appendEntry(list, e(i));
    expect(list.length).toBe(ERROR_LOG_MAX);
    expect(list[list.length - 1].t.endsWith(':29')).toBe(true);
  });
  it('เขียน/อ่าน/ล้างผ่าน localStorage ; ข้อมูลเสียอ่านเป็นรายการว่าง', () => {
    recordError(e(1)); recordError(e(2));
    expect(readErrorLog().length).toBe(2);
    clearErrorLog();
    expect(readErrorLog()).toEqual([]);
    localStorage.setItem(ERROR_LOG_KEY, '{ไม่ใช่ json');
    expect(readErrorLog()).toEqual([]);
    clearErrorLog();
  });
});
