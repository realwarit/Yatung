import { Dose, DoseSlot, Medication, TodayResponse } from '../api/models';
import { AdherenceResponse } from '../api/stats.api';

/**
 * snapshot ข้อมูลล่าสุดไว้ดูตอนออฟไลน์ (อ่านอย่างเดียว — ไม่มีคิวบันทึกออฟไลน์)
 *  - key = `yatung_snap:<userId>:today|adherence` → คนละผู้ใช้ไม่ปนกัน แม้ล้างตอน logout พลาด
 *  - เก็บเฉพาะฟิลด์ที่หน้าจอใช้ (whitelist ด้านล่าง) — ไม่มี ocr_text / รูป / warnings / ข้อมูลผู้ดูแล
 *  - ล้างทั้งหมดตอน logout และ 401 (AuthService.logout)
 */
export const SNAP_PREFIX = 'yatung_snap:';
export const SNAP_VERSION = 1;

export type SnapKind = 'today' | 'adherence';

/** ฟิลด์ยาที่หน้าวันนี้ใช้แสดงรายการ "ยาเมื่อมีอาการ" */
export type SnapMed = Pick<Medication, 'id' | 'name' | 'tts_name' | 'strength' | 'dose_per_time' | 'unit' | 'meal_relation' | 'as_needed' | 'indication'>;

export interface TodaySnap {
  today: TodayResponse;
  activeMeds: number;
  asNeeded: SnapMed[];
  /** [medication_id, ข้อความสั้น "ยาใกล้หมด · พอใช้ n วัน"] */
  low: [number, string][];
}
export interface SnapData { today: TodaySnap; adherence: AdherenceResponse }

export interface SnapEnvelope<T> { v: number; savedAt: number; data: T }

export const snapKey = (userId: number | string, kind: SnapKind): string => `${SNAP_PREFIX}${userId}:${kind}`;

// ---------- whitelist: สร้างอ็อบเจกต์ใหม่ด้วยฟิลด์ที่ระบุเท่านั้น (ฟิลด์แปลกที่ API เพิ่มทีหลังไม่หลุดเข้ามา) ----------
export function pickDose(d: Dose): Dose {
  return {
    id: d.id, medication_id: d.medication_id, name: d.name, tts_name: d.tts_name ?? null, strength: d.strength,
    dose_per_time: d.dose_per_time, unit: d.unit, meal_relation: d.meal_relation, scheduled_at: d.scheduled_at,
    status: d.status, taken_at: d.taken_at, source: d.source ?? null, is_overdue: d.is_overdue,
  };
}
export const pickSlot = (s: DoseSlot): DoseSlot => ({ slot: s.slot, time: s.time, doses: s.doses.map(pickDose) });
export const pickTodayResponse = (r: TodayResponse): TodayResponse => ({
  slots: r.slots.map(pickSlot),
  summary: { total: r.summary.total, taken: r.summary.taken, pending: r.summary.pending, missed: r.summary.missed },
});
export const pickMed = (m: Medication): SnapMed => ({
  id: m.id, name: m.name, tts_name: m.tts_name ?? null, strength: m.strength, dose_per_time: m.dose_per_time, unit: m.unit,
  meal_relation: m.meal_relation, as_needed: m.as_needed, indication: m.indication,
});
export function pickToday(today: TodayResponse, meds: Medication[], lowText: ReadonlyMap<number, string>): TodaySnap {
  return {
    today: pickTodayResponse(today),
    activeMeds: meds.length,
    asNeeded: meds.filter((m) => m.as_needed).map(pickMed),
    low: [...lowText.entries()].map(([id, t]) => [id, t]),
  };
}
export function pickAdherence(a: AdherenceResponse): AdherenceResponse {
  const counts = (c: { taken: number; missed: number; pending_due: number; due: number; rate: number | null }) =>
    ({ taken: c.taken, missed: c.missed, pending_due: c.pending_due, due: c.due, rate: c.rate });
  return {
    range: { from: a.range.from, to: a.range.to, days: a.range.days },
    overall: counts(a.overall),
    days: a.days.map((d) => ({ ...counts(d), date: d.date, label_th: d.label_th, is_today: d.is_today, upcoming: d.upcoming })),
    by_meal: a.by_meal.map((m) => ({ meal: m.meal, label_th: m.label_th, due: m.due, taken: m.taken, rate: m.rate })),
    by_medication: a.by_medication.map((m) => ({ medication_id: m.medication_id, name: m.name, strength: m.strength, is_active: m.is_active, due: m.due, taken: m.taken, rate: m.rate })),
    by_source: { app: a.by_source.app, push: a.by_source.push, line: a.by_source.line, caregiver: a.by_source.caregiver, other: a.by_source.other },
    streak_days: a.streak_days,
    generated_at: a.generated_at,
  };
}

// ---------- storage (ทุกการเข้าถึงอยู่ใน try/catch: โหมดส่วนตัว/บล็อก storage ต้องไม่ทำให้แอปพัง) ----------
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
const defaultStore = (): Store | null => { try { return localStorage; } catch { return null; } };

export function writeSnap<K extends SnapKind>(userId: number | string, kind: K, data: SnapData[K], now = Date.now(), store: Store | null = defaultStore()): void {
  try {
    const env: SnapEnvelope<SnapData[K]> = { v: SNAP_VERSION, savedAt: now, data };
    store?.setItem(snapKey(userId, kind), JSON.stringify(env));
  } catch { /* เต็ม/ถูกบล็อก = ข้าม */ }
}

export function readSnap<K extends SnapKind>(userId: number | string, kind: K, store: Store | null = defaultStore()): { savedAt: number; data: SnapData[K] } | null {
  try {
    const raw = store?.getItem(snapKey(userId, kind));
    if (!raw) return null;
    const env = JSON.parse(raw) as Partial<SnapEnvelope<SnapData[K]>>;
    if (env.v !== SNAP_VERSION || typeof env.savedAt !== 'number' || !env.data || typeof env.data !== 'object') return null;
    return { savedAt: env.savedAt, data: env.data };
  } catch { return null; }
}

/** ลบ snapshot ของทุกผู้ใช้ (logout / 401) */
export function clearSnapshots(store: Store | null = defaultStore()): void {
  try {
    if (!store) return;
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k && k.startsWith(SNAP_PREFIX)) keys.push(k); }
    for (const k of keys) store.removeItem(k);
  } catch { /* ignore */ }
}
