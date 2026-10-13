import { clockTime } from '../time';

/** ข้อความบนแถบออฟไลน์ ; savedAt = epoch ms ของข้อมูลล่าสุดที่มี (null = ไม่เคยบันทึก) */
export function offlineBarText(savedAt: number | null): string {
  return savedAt === null ? 'ออฟไลน์อยู่ · ยังไม่มีข้อมูลที่บันทึกไว้' : `ออฟไลน์อยู่ · ข้อมูลล่าสุดเมื่อ ${clockTime(savedAt)} น.`;
}

/** ข้อความข้างปุ่มที่ต้องใช้เน็ต (กินแล้ว ฯลฯ) ตอนออฟไลน์ */
export const NEEDS_ONLINE_TEXT = 'ต่ออินเทอร์เน็ตก่อนนะคะ';
