import { Dose, Slot, TodayResponse } from '../../core/api/models';
import { buildSlots, lateChipText, progressOf, SlotFlags } from './today-model';

const bkk = (hms: string) => Date.parse(`2026-10-13T${hms}+07:00`);
const none: SlotFlags = { touched: new Set(), opened: new Set(), undoExpired: new Set() };
let id = 0;
const dose = (hhmm: string, status: Dose['status'] = 'pending', name = 'ยา' + (id + 1), taken_at: string | null = null): Dose => ({
  id: ++id, medication_id: id, name, strength: '500 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'after',
  scheduled_at: `2026-10-13 ${hhmm}:00`, status, taken_at: status === 'taken' ? (taken_at ?? `2026-10-13 ${hhmm}:05`) : null, is_overdue: false,
});
const day = (...slots: [Slot, string, Dose[]][]): TodayResponse => ({ summary: { total: 0, taken: 0, pending: 0, missed: 0 }, slots: slots.map(([slot, time, doses]) => ({ slot, time, doses })) });

describe('buildSlots: โหมดของแต่ละมื้อ', () => {
  it('มื้อเลยเวลา = open + chip เลยเวลา ; มื้อถัดไป = next ตัวแรก ; มื้อกินครบ = done', () => {
    const d = day(['morning', '08:00', [dose('08:00', 'taken')]], ['noon', '12:00', [dose('12:00', 'pending', 'Metformin')]], ['evening', '18:00', [dose('18:00', 'pending', 'Amlodipine'), dose('18:00', 'pending', 'Simva')]]);
    const v = buildSlots(d, bkk('13:00:00'), none);
    expect(v.map((s) => s.mode)).toEqual(['done', 'open', 'next']);
    expect(v[1].chip).toEqual({ text: 'เลยเวลา 1 ชม.', tone: 'late' });
    expect(v[2].isNext).toBe(true);
    expect(v[2].summary).toBe('Amlodipine · Simva');
    expect(v[2].remain).toBe('5 ชม.');
    expect(v[0].expanded).toBe(false);
    expect(v[2].expanded).toBe(false);
    expect(v[1].expanded).toBe(true);
  });

  it('ถึงเวลา (ไม่เกิน 30 นาที) = chip "ถึงเวลาแล้ว" ; เกิน 30 นาที = เลยเวลา n นาที ; missed = open', () => {
    const d = day(['noon', '12:00', [dose('12:00')]]);
    expect(buildSlots(d, bkk('12:10:00'), none)[0].chip).toEqual({ text: 'ถึงเวลาแล้ว', tone: 'info' });
    expect(buildSlots(d, bkk('12:30:59'), none)[0].chip).toEqual({ text: 'ถึงเวลาแล้ว', tone: 'info' });
    expect(buildSlots(d, bkk('12:45:00'), none)[0].chip).toEqual({ text: 'เลยเวลา 45 นาที', tone: 'late' });
    const m = day(['noon', '12:00', [dose('12:00', 'missed')]]);
    expect(buildSlots(m, bkk('12:00:00'), none)[0].mode).toBe('open');
  });

  it('ยังไม่ถึงมื้อแรก : ทุกมื้อ next ; มื้อแรกเป็น isNext และมี "อีก n นาที" ปัดขึ้น', () => {
    const d = day(['morning', '08:00', [dose('08:00')]], ['evening', '18:00', [dose('18:00')]]);
    const v = buildSlots(d, bkk('07:41:20'), none);
    expect(v.map((s) => s.mode)).toEqual(['next', 'next']);
    expect(v.map((s) => s.isNext)).toEqual([true, false]);
    expect(v[0].remain).toBe('19 นาที');       // เหลือ 18 นาที 40 วินาที → ปัดขึ้น 19
  });

  it('21:13:00 → ก่อนนอน 21:18 = อีก 5 นาที ; 21:17:30 = อีก 1 นาที ; 21:18:00 = open (ถึงเวลา)', () => {
    const d = day(['bedtime', '21:18', [dose('21:18')]]);
    expect(buildSlots(d, bkk('21:13:00'), none)[0].remain).toBe('5 นาที');
    expect(buildSlots(d, bkk('21:17:30'), none)[0].remain).toBe('1 นาที');
    const at = buildSlots(d, bkk('21:18:00'), none)[0];
    expect(at.mode).toBe('open'); expect(at.remain).toBeNull();
  });

  it('มื้อเดียวหลายเวลา : takeAllIds เฉพาะรอบถึง/เลยเวลาที่ยังไม่กิน (ไม่รวมรอบที่ยังรอ/ที่กินแล้ว)', () => {
    const a = dose('16:30'), b = dose('16:30'), c = dose('18:00'), t = dose('16:30', 'taken');
    const v = buildSlots(day(['evening', '16:30', [a, b, c, t]]), bkk('17:00:00'), none)[0];
    expect(v.mode).toBe('open');
    expect(v.takeAllIds).toEqual([a.id, b.id]);
    expect(v.multiTime).toBe(true);
    expect(v.time).toBe('16:30–18:00');
  });

  it('next ที่ผู้ใช้กางเอง = expanded แต่ไม่มี takeAllIds (กินล่วงหน้าทีละตัวตามเดิม)', () => {
    const d = day(['evening', '18:00', [dose('18:00'), dose('18:00')]]);
    const v = buildSlots(d, bkk('10:00:00'), { ...none, opened: new Set<Slot>(['evening']) })[0];
    expect(v.mode).toBe('next'); expect(v.expanded).toBe(true); expect(v.takeAllIds).toEqual([]);
  });

  it('done ที่เพิ่งกด (touched) ไม่พับทันที เพื่อให้กดยกเลิกได้', () => {
    const d = day(['morning', '08:00', [dose('08:00', 'taken')]]);
    expect(buildSlots(d, bkk('09:00:00'), none)[0].expanded).toBe(false);
    expect(buildSlots(d, bkk('09:00:00'), { ...none, touched: new Set<Slot>(['morning']) })[0].expanded).toBe(true);
  });

  it('canUndo : ภายใน 10 นาทีหลังกด และ UNDO_EXPIRED ซ่อนปุ่ม', () => {
    const t = dose('08:00', 'taken', 'x', '2026-10-13 08:05:00');
    const d = day(['morning', '08:00', [t]]);
    expect(buildSlots(d, bkk('08:14:00'), none)[0].doses[0].canUndo).toBe(true);
    expect(buildSlots(d, bkk('08:16:00'), none)[0].doses[0].canUndo).toBe(false);
    expect(buildSlots(d, bkk('08:10:00'), { ...none, undoExpired: new Set([t.id]) })[0].doses[0].canUndo).toBe(false);
  });
});

describe('progressOf / lateChipText', () => {
  it('นับตามสถานะที่คำนวณ', () => {
    const d = day(['morning', '08:00', [dose('08:00', 'taken')]], ['noon', '12:00', [dose('12:00')]], ['evening', '18:00', [dose('18:00')]]);
    expect(progressOf(buildSlots(d, bkk('13:00:00'), none))).toEqual({ total: 3, taken: 1, notTaken: 1, allDone: false });
  });
  it('กินครบ = allDone ; ไม่มียา = ไม่ allDone', () => {
    expect(progressOf(buildSlots(day(['morning', '08:00', [dose('08:00', 'taken')]]), bkk('09:00:00'), none)).allDone).toBe(true);
    expect(progressOf([]).allDone).toBe(false);
  });
  it('ข้อความ chip', () => {
    expect(lateChipText(45)).toBe('เลยเวลา 45 นาที');
    expect(lateChipText(60)).toBe('เลยเวลา 1 ชม.');
    expect(lateChipText(7 * 60 + 40)).toBe('เลยเวลา 7 ชม.');
  });
});
