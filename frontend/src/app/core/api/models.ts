// รูปแบบ response ของ backend (ตรวจกับ API จริงด้วยบัญชี demo) — แก้ที่ node-red/data/lib/*-service.js ต้องแก้ที่นี่ด้วย
import { DoseUnit, Slot } from './medicine-parse.model';

export type { DoseUnit, Slot };
/** ค่าที่ API รับสำหรับยา (ไม่รวม 'unknown') */
export type MealRelation = 'before' | 'after' | 'with' | 'any';

export interface Medication {
  id: number;
  name: string;
  strength: string | null;
  dose_per_time: number;
  unit: DoseUnit;
  meal_relation: MealRelation;
  as_needed: boolean;
  slots: Slot[];
  indication: string | null;
  warnings: string[];
  total_qty: number | null;
  remaining_qty: number | null;
  /** null = ยาเมื่อมีอาการ / หยุดแล้ว / ไม่ทราบจำนวน */
  days_left: number | null;
  refill_alert_days: number;
  /** ใกล้หมดตามเกณฑ์เดียวของระบบ (backend stock-service): ยาประจำ days_left ≤ refill_alert_days ; ยาเมื่อมีอาการ remaining_qty ≤ LOW_STOCK_QTY_PRN */
  is_low: boolean;
  start_date: string;           // YYYY-MM-DD
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** มีเฉพาะ response ของ POST/PUT: มื้อของวันนี้ที่เวลาผ่านไปแล้ว จึงไม่ถูกสร้างรอบ */
  skipped_slots_today?: Slot[];
}

export interface MedicationInput {
  name: string;
  strength?: string | null;
  dose_per_time: number;
  unit: DoseUnit;
  meal_relation: MealRelation;
  as_needed: boolean;
  slots: Slot[];
  indication?: string | null;
  warnings?: string[];
  total_qty?: number | null;
}

export type DoseStatus = 'pending' | 'taken' | 'missed';
export type DoseSource = 'app' | 'line' | 'push' | 'caregiver';

export interface Dose {
  id: number;
  medication_id: number;
  name: string;
  strength: string | null;
  dose_per_time: number;
  unit: DoseUnit;
  meal_relation: MealRelation;
  scheduled_at: string;         // 'YYYY-MM-DD HH:mm:ss' เวลาไทย
  status: DoseStatus;
  taken_at: string | null;
  source?: DoseSource | null;   // ช่องทางที่ยืนยัน (มีเมื่อ status = taken)
  is_overdue: boolean;          // คำนวณ ณ เวลาที่ดึงข้อมูล — หน้าจอคำนวณใหม่เองจากเวลาปัจจุบัน
}

export interface DoseSlot {
  slot: Slot;
  time: string;                 // 'HH:mm'
  doses: Dose[];
}

export interface TodayResponse {
  slots: DoseSlot[];
  summary: { total: number; taken: number; pending: number; missed: number };
}

/** response ของ take / undo */
export interface DoseActionResult {
  id: number;
  status: DoseStatus;
  taken_at: string | null;
  source: DoseSource | null;
  remaining_qty: number | null;
}

export type SlotTimes = Record<Slot, string>;   // 'HH:mm'
