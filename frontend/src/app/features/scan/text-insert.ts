/**
 * เติมข้อความ (chip คำที่ใช้บ่อย) ที่ตำแหน่ง cursor/ช่วงที่เลือก แล้วเว้นวรรคให้อัตโนมัติ
 * @returns ข้อความใหม่ + ตำแหน่ง cursor หลังข้อความที่เติม ; เกิน max = คืนค่าเดิม (ไม่เติม)
 */
export function insertAtCursor(
  text: string, start: number, end: number, snippet: string, max = 1000,
): { text: string; caret: number } {
  const s = Math.max(0, Math.min(start, text.length));
  const e = Math.max(s, Math.min(end, text.length));
  const before = text.slice(0, s);
  const after = text.slice(e);
  const lead = before !== '' && !/\s$/.test(before) ? ' ' : '';
  const trail = after !== '' && !/^\s/.test(after) ? ' ' : '';
  const next = before + lead + snippet + trail + after;
  if (next.length > max) return { text, caret: s };
  return { text: next, caret: (before + lead + snippet).length };
}
