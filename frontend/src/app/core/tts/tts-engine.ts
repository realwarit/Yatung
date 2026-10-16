import type { TtsDiag } from './tts-lang';

/** เครื่องยนต์อ่านออกเสียงที่ไม่ใช่ Web Speech (ตอนนี้มีตัวเดียว: Android native) — TtsService เลือกใช้เมื่อ TtsEnv.native ไม่เป็น null */
export interface TtsEngine {
  /** true = พูดไทยได้จริง ; false = ไม่มีเสียงไทย (ปุ่ม 🔊 ต้องซ่อน) */
  probe(): Promise<boolean>;
  /** อ่านหนึ่งท่อน รอจนอ่านจบ */
  speak(text: string, rate: number): Promise<void>;
  stop(): Promise<void>;
  /** ข้อมูลวินิจฉัยหลัง probe (เฉพาะ true/false/จำนวน ไม่มีข้อความที่อ่าน) — ไม่ต้องมีก็ได้ */
  diag?(): TtsDiag;
}
