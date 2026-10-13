import { TestBed } from '@angular/core/testing';
import { Dose, Medication, TodayResponse } from '../api/models';
import { AdherenceResponse } from '../api/stats.api';
import { AuthService } from '../auth/auth.service';
import { SNAP_PREFIX, clearSnapshots, pickAdherence, pickToday, readSnap, snapKey, writeSnap } from './snapshot';
import { SnapshotService } from './snapshot.service';
import { offlineBarText } from './offline-text';

class MemStore {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const dose = (over: Partial<Dose> = {}): Dose => ({
  id: 1, medication_id: 5, name: 'Amlodipine', tts_name: null, strength: '5 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'after',
  scheduled_at: '2026-10-13 08:00:00', status: 'pending', taken_at: null, source: null, is_overdue: false, ...over,
});
const today = (): TodayResponse => ({ slots: [{ slot: 'morning', time: '08:00', doses: [dose()] }], summary: { total: 1, taken: 0, pending: 1, missed: 0 } });
const med = (over: Partial<Medication> = {}): Medication => ({
  id: 9, name: 'Paracetamol', tts_name: null, strength: '500 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'any', as_needed: true, slots: [],
  indication: 'ปวด', warnings: ['ห้ามดื่มแอลกอฮอล์'], total_qty: 20, remaining_qty: 3, days_left: null, refill_alert_days: 7, is_low: true,
  start_date: '2026-10-01', end_date: null, is_active: true, created_at: '2026-10-01 08:00:00', updated_at: '2026-10-01 08:00:00', ...over,
});

describe('pickToday (whitelist — เก็บเฉพาะฟิลด์ที่หน้าจอใช้)', () => {
  it('ไม่มีฟิลด์แปลกที่ API เพิ่มมา (เช่น ocr_text, image_path, warnings)', () => {
    const t = today();
    (t.slots[0].doses[0] as unknown as Record<string, unknown>)['ocr_text'] = 'ชื่อผู้ป่วย สมชาย';
    (t.slots[0].doses[0] as unknown as Record<string, unknown>)['image_path'] = 'uploads/1/x.jpg';
    const m = med();
    (m as unknown as Record<string, unknown>)['ocr_text'] = 'secret';
    const json = JSON.stringify(pickToday(t, [m], new Map([[9, 'ยาใกล้หมด']])));
    for (const bad of ['ocr_text', 'image_path', 'สมชาย', 'ห้ามดื่มแอลกอฮอล์', 'warnings', 'secret', 'total_qty', 'remaining_qty']) expect(json).not.toContain(bad);
  });
  it('เก็บข้อมูลที่ใช้แสดงครบ', () => {
    const s = pickToday(today(), [med(), med({ id: 10, as_needed: false })], new Map([[9, 'ใกล้หมด']]));
    expect(s.today.slots[0].doses[0].name).toBe('Amlodipine');
    expect(s.activeMeds).toBe(2);
    expect(s.asNeeded.map((m) => m.id)).toEqual([9]);
    expect(s.asNeeded[0].indication).toBe('ปวด');
    expect(s.low).toEqual([[9, 'ใกล้หมด']]);
  });
});

describe('pickAdherence', () => {
  it('คัดลอกครบ และไม่พาฟิลด์แปลกไปด้วย', () => {
    const c = { taken: 5, missed: 1, pending_due: 0, due: 6, rate: 83 };
    const a = {
      range: { from: '2026-10-07', to: '2026-10-13', days: 7 }, overall: c,
      days: [{ ...c, date: '2026-10-13', label_th: 'อ. 13 ต.ค.', is_today: true, upcoming: 0, extra: 'x' }],
      by_meal: [{ meal: 'morning', label_th: 'มื้อเช้า', due: 6, taken: 5, rate: 83 }],
      by_medication: [{ medication_id: 1, name: 'A', strength: null, is_active: true, due: 6, taken: 5, rate: 83, secret: 'x' }],
      by_source: { app: 5, push: 0, line: 0, caregiver: 0, other: 0 }, streak_days: 2, generated_at: '2026-10-13T10:00:00+07:00', leak: 'x',
    } as unknown as AdherenceResponse;
    const p = pickAdherence(a);
    expect(JSON.stringify(p)).not.toContain('"extra"');
    expect(JSON.stringify(p)).not.toContain('secret');
    expect(JSON.stringify(p)).not.toContain('leak');
    expect(p.overall.rate).toBe(83);
    expect(p.days[0].label_th).toBe('อ. 13 ต.ค.');
    expect(p.streak_days).toBe(2);
  });
});

describe('writeSnap / readSnap / clearSnapshots', () => {
  it('key มี user id และชนิด', () => expect(snapKey(7, 'today')).toBe(`${SNAP_PREFIX}7:today`));
  it('เขียนแล้วอ่านได้ พร้อมเวลาที่เก็บ', () => {
    const st = new MemStore();
    const snap = pickToday(today(), [], new Map());
    writeSnap(7, 'today', snap, 1_000, st);
    expect(readSnap(7, 'today', st)).toEqual({ savedAt: 1_000, data: snap });
  });
  it('ผู้ใช้ B ไม่เห็นของผู้ใช้ A (key ต่างกัน)', () => {
    const st = new MemStore();
    writeSnap(1, 'today', pickToday(today(), [], new Map()), 1, st);
    expect(readSnap(2, 'today', st)).toBeNull();
  });
  it('clearSnapshots ลบทุก key ของทุกผู้ใช้ แต่ไม่แตะ key อื่น', () => {
    const st = new MemStore();
    writeSnap(1, 'today', pickToday(today(), [], new Map()), 1, st);
    writeSnap(2, 'adherence', pickAdherence({ range: { from: 'a', to: 'b', days: 7 }, overall: { taken: 0, missed: 0, pending_due: 0, due: 0, rate: null }, days: [], by_meal: [], by_medication: [], by_source: { app: 0, push: 0, line: 0, caregiver: 0, other: 0 }, streak_days: 0, generated_at: '' }), 1, st);
    st.setItem('yatung_font_scale', '125');
    clearSnapshots(st);
    expect(st.length).toBe(1);
    expect(st.getItem('yatung_font_scale')).toBe('125');
  });
  it('ข้อมูลเสีย/เวอร์ชันไม่ตรง = null ไม่ throw', () => {
    const st = new MemStore();
    st.setItem(snapKey(1, 'today'), '{not json');
    expect(readSnap(1, 'today', st)).toBeNull();
    st.setItem(snapKey(1, 'today'), JSON.stringify({ v: 99, savedAt: 1, data: {} }));
    expect(readSnap(1, 'today', st)).toBeNull();
  });
  it('storage ถูกบล็อก (throw) ไม่ทำให้แอปพัง', () => {
    const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); }, key() { throw new Error('x'); }, length: 1 };
    expect(() => writeSnap(1, 'today', pickToday(today(), [], new Map()), 1, bad)).not.toThrow();
    expect(readSnap(1, 'today', bad)).toBeNull();
    expect(() => clearSnapshots(bad)).not.toThrow();
  });
});

describe('SnapshotService + logout (A logout → B login ไม่เห็นของ A)', () => {
  function setup(userId: number | null) {
    localStorage.clear();
    const auth = { currentUser: () => (userId === null ? null : { id: userId, email: 'x', display_name: 'x' }) };
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }] });
    return TestBed.inject(SnapshotService);
  }
  it('ไม่ล็อกอิน = ไม่เก็บ ไม่อ่าน', () => {
    const svc = setup(null);
    svc.save('today', pickToday(today(), [], new Map()));
    expect(svc.load('today')).toBeNull();
    expect(svc.lastSavedAt()).toBeNull();
  });
  it('ผู้ใช้ A เก็บ → ผู้ใช้ B (key ต่าง) อ่านไม่ได้ แม้ไม่ได้ล้างตอน logout', () => {
    const a = setup(1);
    a.save('today', pickToday(today(), [], new Map()), 5_000);
    expect(a.lastSavedAt()).toBe(5_000);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { currentUser: () => ({ id: 2, email: 'b', display_name: 'b' }) } }] });
    expect(TestBed.inject(SnapshotService).load('today')).toBeNull();
  });
  it('AuthService.logout ล้าง snapshot ทั้งหมด', () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [{ provide: 'x', useValue: 1 }] });
    writeSnap(1, 'today', pickToday(today(), [], new Map()), 1);
    expect(localStorage.length).toBe(1);
    const auth = TestBed.runInInjectionContext(() => {
      const a = Object.create(AuthService.prototype) as AuthService;
      (a as unknown as { router: { navigate: () => void } }).router = { navigate: () => undefined };
      (a as unknown as { currentUser: { set: (v: null) => void } }).currentUser = { set: () => undefined };
      return a;
    });
    auth.logout(false);
    expect(localStorage.length).toBe(0);
  });
});

describe('offlineBarText', () => {
  it('มีเวลาข้อมูลล่าสุด (เวลาไทย)', () => {
    // 2026-10-13 13:15 UTC = 20:15 ไทย
    expect(offlineBarText(Date.UTC(2026, 9, 13, 13, 15))).toBe('ออฟไลน์อยู่ · ข้อมูลล่าสุดเมื่อ 20:15 น.');
  });
  it('ไม่เคยบันทึก', () => expect(offlineBarText(null)).toBe('ออฟไลน์อยู่ · ยังไม่มีข้อมูลที่บันทึกไว้'));
});
