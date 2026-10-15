import { Dose, Slot, TodayResponse } from '../../core/api/models';
import { SLOT_LABEL } from '../../core/i18n/labels';
import { nowrapUnits } from '../../core/nowrap';
import { medDisplayName } from '../../core/text';
import { clockTime, duration, lateMinutes, parseServerTime, remainMinutes } from '../../core/time';
import { hasMultipleTimes, slotTimeLabel } from './slot-time';

/** กติกาของหน้าวันนี้ทั้งหมด (ฟังก์ชันล้วน — เทสใน today-model.spec.ts) */
export const OVERDUE_AFTER_MIN = 30;           // ตรงกับ is_overdue ของ backend
export const UNDO_WINDOW_MS = 10 * 60 * 1000;  // undo ได้ 10 นาทีหลังกด

export type DoseState = 'waiting' | 'due' | 'overdue' | 'taken';
/** open = มีรอบถึงเวลา/เลยเวลาที่ยังไม่กิน (กางไว้) · next = ทุกรอบที่เหลือยังไม่ถึงเวลา (พับเป็นบรรทัดสรุป) · done = กินครบแล้ว (พับเป็นแถวเขียว) */
export type SlotMode = 'open' | 'next' | 'done';

export interface DoseVM { dose: Dose; state: DoseState; lateMin: number; takenClock: string | null; canUndo: boolean; }
export interface SlotChip { text: string; tone: 'late' | 'info'; }
export interface SlotVM {
  slot: Slot; time: string; multiTime: boolean; doses: DoseVM[];
  mode: SlotMode;
  /** มื้อที่ต้องแสดงรายการยา (open เสมอ ; next/done = เมื่อผู้ใช้กางเอง หรือ done ที่เพิ่งกด) */
  expanded: boolean;
  chip: SlotChip | null;
  /** บรรทัดสรุปตอนพับ : ชื่อยาที่ยังไม่กิน */
  summary: string;
  /** "3 ชม. 5 นาที" ของรอบที่ใกล้ที่สุดที่ยังไม่ถึงเวลา (เฉพาะ mode next) */
  remain: string | null;
  /** มื้อถัดไป = mode next ตัวแรก */
  isNext: boolean;
  /** id ที่ "กินครบมื้อนี้" ส่งไป (เฉพาะรอบถึงเวลา/เลยเวลาที่ยังไม่กิน ; ปุ่มแสดงเมื่อ mode open และมี ≥ 2) */
  takeAllIds: number[];
}

export function doseState(dose: Dose, nowMs: number): { state: DoseState; lateMin: number } {
  const late = lateMinutes(parseServerTime(dose.scheduled_at), nowMs);
  const state: DoseState = dose.status === 'taken' ? 'taken'
    : dose.status === 'missed' || late > OVERDUE_AFTER_MIN ? 'overdue'
    : late >= 0 ? 'due' : 'waiting';
  return { state, lateMin: Math.max(0, late) };
}

/** "เลยเวลา 45 นาที" · "เลยเวลา 7 ชม." (ตั้งแต่ 1 ชม. ไม่แสดงนาที) */
export function lateChipText(min: number): string {
  return min < 60 ? `เลยเวลา ${min} นาที` : `เลยเวลา ${Math.floor(min / 60)} ชม.`;
}

export interface SlotFlags { touched: ReadonlySet<Slot>; opened: ReadonlySet<Slot>; undoExpired: ReadonlySet<number>; }

export function buildSlots(data: TodayResponse | null, nowMs: number, flags: SlotFlags): SlotVM[] {
  if (!data) return [];
  let nextTaken = false;
  return data.slots.map((s): SlotVM => {
    const doses = s.doses.map((dose): DoseVM => {
      const { state, lateMin } = doseState(dose, nowMs);
      const takenMs = state === 'taken' && dose.taken_at ? parseServerTime(dose.taken_at) : null;
      return {
        dose, state, lateMin,
        takenClock: takenMs ? clockTime(takenMs) : null,
        canUndo: takenMs !== null && nowMs - takenMs < UNDO_WINDOW_MS && !flags.undoExpired.has(dose.id),
      };
    });
    const pending = doses.filter((d) => d.state !== 'taken');
    const active = pending.filter((d) => d.state === 'due' || d.state === 'overdue');
    const mode: SlotMode = active.length ? 'open' : pending.length ? 'next' : 'done';
    const isNext = mode === 'next' && !nextTaken;
    if (isNext) nextTaken = true;

    // chip ของหัวมื้อ : รอบที่เลยมามากที่สุดที่ยังไม่กิน
    let chip: SlotChip | null = null;
    if (mode === 'open') {
      const worst = Math.max(...active.map((d) => d.lateMin));
      chip = active.some((d) => d.state === 'overdue') ? { text: lateChipText(worst), tone: 'late' } : { text: 'ถึงเวลาแล้ว', tone: 'info' };
    }
    const upcoming = pending.filter((d) => d.state === 'waiting').map((d) => parseServerTime(d.dose.scheduled_at));
    const remain = mode === 'next' && upcoming.length ? duration(remainMinutes(Math.min(...upcoming), nowMs)) : null;

    const expanded = mode === 'open' || flags.opened.has(s.slot) || (mode === 'done' && flags.touched.has(s.slot));
    return {
      slot: s.slot, time: slotTimeLabel(s.doses.map((x) => x.scheduled_at)), multiTime: hasMultipleTimes(s.doses.map((x) => x.scheduled_at)),
      doses, mode, expanded, chip,
      summary: pending.map((d) => medDisplayName(d.dose.name)).join(' · '),
      remain, isNext,
      takeAllIds: active.map((d) => d.dose.id),
    };
  });
}

export const slotName = (slot: Slot): string => SLOT_LABEL[slot];

export interface Progress { total: number; taken: number; notTaken: number; allDone: boolean; }
export function progressOf(slots: readonly SlotVM[]): Progress {
  const all = slots.flatMap((s) => s.doses);
  const taken = all.filter((d) => d.state === 'taken').length;
  return {
    total: all.length, taken,
    notTaken: all.filter((d) => d.state === 'overdue' || d.state === 'due').length,
    allDone: all.length > 0 && taken === all.length,
  };
}

// ---------- ข้อความกล่องคำพูดของน้องยาตรงบนหน้าวันนี้ (D2.5) : 1 กล่อง = เรื่องเดียวที่สำคัญที่สุดตอนนี้ ----------
export interface TodayBubble { text: string; tone: 'neutral' | 'warning' | 'success'; }

/** เลือกข้อความตามลำดับ: ไม่มียา → กินครบ → มียาเลยเวลา → ถึงเวลา → มื้อถัดไป (นับถอยหลังจากนาฬิกา ปัดขึ้น) */
export function bubbleOf(slots: readonly SlotVM[], nowMs: number): TodayBubble {
  const b = rawBubble(slots, nowMs);
  return { ...b, text: nowrapUnits(b.text) };   // E5: ตัวเลขไม่แยกจากหน่วย
}

function rawBubble(slots: readonly SlotVM[], nowMs: number): TodayBubble {
  const p = progressOf(slots);
  if (p.total === 0) return { text: 'วันนี้ไม่มียาที่ต้องกินค่ะ', tone: 'neutral' };
  if (p.allDone) return { text: 'วันนี้กินครบแล้ว เก่งมากเลยค่ะ', tone: 'success' };
  const overdue = slots.flatMap((s) => s.doses).filter((d) => d.state === 'overdue').length;
  if (overdue > 0) return { text: `เลยเวลาแล้ว ${overdue} รายการ กินเลยนะคะ`, tone: 'warning' };
  const open = slots.find((s) => s.mode === 'open');
  if (open) return { text: `ถึงเวลากินยามื้อ${SLOT_LABEL[open.slot]}แล้วนะคะ`, tone: 'neutral' };
  const next = slots.find((s) => s.isNext);
  if (next) {
    const waiting = next.doses.filter((d) => d.state === 'waiting').map((d) => parseServerTime(d.dose.scheduled_at));
    if (waiting.length) {
      const at = Math.min(...waiting);
      return { text: `มื้อถัดไป ${SLOT_LABEL[next.slot]} ${clockTime(at)} อีก ${duration(remainMinutes(at, nowMs))}ค่ะ`, tone: 'neutral' };
    }
  }
  return { text: 'วันนี้ไม่มียาที่ต้องกินค่ะ', tone: 'neutral' };
}
