// เวลาแสดงผลเป็นเวลาไทย (UTC+7) เสมอ ไม่ว่าอุปกรณ์จะตั้ง timezone ไว้เป็นอะไร
// server ส่งเวลาเป็นสตริง 'YYYY-MM-DD HH:mm:ss' (เวลาไทยอยู่แล้ว)
const OFFSET_MS = 7 * 60 * 60 * 1000;

const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD HH:mm:ss' (เวลาไทย) → epoch ms */
export function parseServerTime(s: string): number {
  return Date.parse(s.replace(' ', 'T') + '+07:00');
}

/** epoch ms → 'YYYY-MM-DD HH:mm:ss' (เวลาไทย) */
export function toServerTime(ms: number): string {
  const d = new Date(ms + OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** epoch ms → 'HH:mm' (เวลาไทย) */
export function clockTime(ms: number): string {
  const d = new Date(ms + OFFSET_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** 'วันอาทิตย์ที่ 4 ตุลาคม 2569' */
export function thaiDate(ms: number): string {
  const d = new Date(ms + OFFSET_MS);
  return `วัน${DAYS[d.getUTCDay()]}ที่ ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
}

/** 'YYYY-MM-DD' → '4 ตุลาคม 2569' */
export function thaiShortDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y + 543}`;
}

export function greeting(ms: number): string {
  const h = new Date(ms + OFFSET_MS).getUTCHours();
  if (h < 12) return 'สวัสดีตอนเช้า';
  if (h < 17) return 'สวัสดีตอนบ่าย';
  if (h < 19) return 'สวัสดีตอนเย็น';
  return 'สวัสดีตอนค่ำ';
}

/** นาที → '45 นาที' | '1 ชม. 20 นาที' | '2 ชม.' */
export function duration(totalMin: number): string {
  const m = Math.max(0, Math.round(totalMin));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} นาที`;
  return r === 0 ? `${h} ชม.` : `${h} ชม. ${r} นาที`;
}
