/** เวลาของมื้อ: เวลาเดียว = '16:30' ; หลายเวลา = ช่วง '16:30–18:00' (รับ 'HH:mm' หรือ 'YYYY-MM-DD HH:mm:ss') */
export function slotTimeLabel(times: readonly string[]): string {
  const hm = [...new Set(times.map((t) => (t.length > 5 ? t.slice(11, 16) : t)))].sort();
  return hm.length <= 1 ? (hm[0] ?? '') : `${hm[0]}–${hm[hm.length - 1]}`;
}

/** มื้อนี้มีมากกว่า 1 เวลาหรือไม่ (ถ้าใช่ การ์ดยาแต่ละตัวต้องแสดงเวลาของตัวเอง) */
export function hasMultipleTimes(times: readonly string[]): boolean {
  return new Set(times.map((t) => (t.length > 5 ? t.slice(11, 16) : t))).size > 1;
}
