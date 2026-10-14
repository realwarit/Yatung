const NB = ' ';

/**
 * กันกล่องคำพูดตัดบรรทัดระหว่างตัวเลขกับหน่วย ("2 รายการ", "5 นาที", "1 ชม. 5 นาที", "18:00 น.")
 * แทนช่องว่างด้วย NBSP — ทำในฟังก์ชันสร้างข้อความ ไม่ใช่ใน template
 */
export function nowrapUnits(text: string): string {
  return text
    .replace(/(\d+) (?=รายการ|นาที|ชม\.|ช่อง|วัน|มื้อ)/g, `$1${NB}`)
    .replace(/(ชม\.) (?=\d)/g, `$1${NB}`)
    .replace(/(\d{1,2}:\d{2}) (?=น\.)/g, `$1${NB}`);
}

/** NBSP ระหว่างตัวเลข/เศษส่วนกับคำถัดไป ("5 mg", "1 เม็ด", "2 วัน") — ใช้กับทุกข้อความที่มีตัวเลขติดหน่วย */
export function nbNum(text: string | null | undefined): string {
  return (text ?? '').replace(/([\d½¼¾]) (?=\S)/g, `$1${NB}`);
}

const WJ = '⁠';

/** ผูกวลีภาษาไทยเป็นก้อนเดียว (ไม่ตัดบรรทัดระหว่างคำ ; Intl.Segmenter แบบ word ไม่มี = คืนข้อความเดิม) — ใช้กับวลีสั้นท้ายประโยค เช่น "ใกล้หมดแล้วนะคะ" */
export function glueThai(text: string): string {
  const Seg = (Intl as { Segmenter?: new (l: string, o: object) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (!Seg) return text;
  return Array.from(new Seg('th', { granularity: 'word' }).segment(text), (x) => x.segment).join(WJ);
}
