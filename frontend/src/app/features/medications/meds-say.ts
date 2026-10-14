import { Medication } from '../../core/api/models';
import { UNIT_LABEL } from '../../core/i18n/labels';
import { glueThai } from '../../core/nowrap';
import { MascotMood } from '../../shared/components/mascot/mascot.component';
import { BubbleTone } from '../../shared/components/speech-bubble/speech-bubble.component';

const NB = ' ';   // NBSP กันตัวเลขกับหน่วยตัดบรรทัด

export interface MedsSay { tone: BubbleTone; mood: MascotMood; text: string; /** ชวนสแกนซองยา */ scan: boolean }

/** ยาที่ใกล้หมดของแท็บ "กำลังใช้" เรียงตัวที่หมดก่อนไว้หน้า (วันที่พอใช้น้อยสุด ; ไม่มีวัน = ยาเมื่อมีอาการ เรียงตามจำนวนที่เหลือ) */
export function lowMeds(meds: Medication[]): Medication[] {
  const key = (m: Medication): number => (m.days_left ?? 10_000 + (m.remaining_qty ?? 0));
  return meds.filter((m) => m.is_active && m.is_low).sort((a, b) => key(a) - key(b));
}

/** ข้อความในกล่องคำพูดเดียวของหน้า ("
" = ขั้นประโยค ; กล่องคำพูดไม่ตัดกลางประโยค) "ยาของฉัน" (D3 ช่วง 1) */
export function medsSay(tab: 'active' | 'stopped', meds: Medication[]): MedsSay {
  if (!meds.length) return { tone: 'info', mood: 'happy', text: 'ยังไม่มียาเลยค่ะ\nลองสแกนซองยาดูนะคะ', scan: true };
  if (tab === 'stopped') return { tone: 'neutral', mood: 'happy', text: 'ยาที่หยุดแล้ว กดกลับมาใช้ได้นะคะ', scan: false };
  if (!meds.some((m) => m.is_active)) return { tone: 'info', mood: 'happy', text: 'ตอนนี้ไม่มียาที่ใช้อยู่ค่ะ\nลองสแกนซองยาดูนะคะ', scan: true };
  const low = lowMeds(meds);
  if (!low.length) return { tone: 'success', mood: 'happy', text: 'ยาทุกตัวพอใช้ค่ะ เก่งมากเลยนะคะ', scan: false };
  const m = low[0];
  if (low.length > 1) return { tone: 'warning', mood: 'worried', text: `${m.name} กับอีก ${low.length - 1}${NB}ตัวใกล้หมดแล้วนะคะ`, scan: false };
  if (m.remaining_qty === 0) return { tone: 'warning', mood: 'worried', text: `${m.name} หมดแล้วนะคะ`, scan: false };
  const left = m.days_left !== null ? `เหลือพอใช้อีก ${m.days_left}${NB}${glueThai('วันค่ะ')}` : `เหลืออีก ${m.remaining_qty}${NB}${glueThai((UNIT_LABEL[m.unit] ?? m.unit) + 'ค่ะ')}`;
  return { tone: 'warning', mood: 'worried', text: `${m.name} ${glueThai('ใกล้หมดแล้วนะคะ')}
${left}`, scan: false };
}
