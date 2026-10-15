import { lexiconSpeech } from './tts-lexicon';
import { DoseUnit, MealRelation, Slot } from '../api/medicine-parse.model';
import { AdherenceResponse } from '../api/stats.api';
import { MEAL_LABEL } from '../i18n/labels';
import { levelOf } from '../../features/overview/adherence-level';

/**
 * แปลงข้อมูลยา/เวลาเป็นประโยคภาษาพูดไทยสำหรับ Web Speech API (ฟังก์ชันล้วน ไม่แตะเบราว์เซอร์)
 * ห้ามส่งเลขเวลาดิบ ("08:00") ให้ตัวอ่าน — เสียงไทยของบางเครื่องอ่านเป็นตัวเลขทีละหลัก
 * ตารางคำพูดแยกจาก labels.ts (สะกดให้ออกเสียงถูก) แต่ใช้คีย์ enum ชุดเดียวกัน → spec บังคับว่าครอบทุกค่า
 */

/** ความยาวสูงสุดต่อท่อน (ตัวอักษร) — ท่อนยาวมีเครื่องตัดเสียงกลางคัน (Chrome/Android) */
export const MAX_CHUNK = 150;

const DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];

/** 0–99 เป็นคำไทย (11 = สิบเอ็ด, 21 = ยี่สิบเอ็ด) ; นอกช่วง/ไม่ใช่จำนวนเต็ม → null */
export function thaiNumber(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
  if (n < 10) return DIGITS[n];
  const tens = Math.floor(n / 10), ones = n % 10;
  const t = tens === 1 ? 'สิบ' : tens === 2 ? 'ยี่สิบ' : `${DIGITS[tens]}สิบ`;
  return ones === 0 ? t : ones === 1 ? `${t}เอ็ด` : `${t}${DIGITS[ones]}`;
}

/** คำเรียกชั่วโมง (24 ชม.) ตามภาษาพูดไทย — index = ชั่วโมง 0–23 */
export const HOUR_WORDS: readonly string[] = [
  'เที่ยงคืน', 'ตีหนึ่ง', 'ตีสอง', 'ตีสาม', 'ตีสี่', 'ตีห้า',
  'หกโมงเช้า', 'เจ็ดโมงเช้า', 'แปดโมงเช้า', 'เก้าโมงเช้า', 'สิบโมงเช้า', 'สิบเอ็ดโมง',
  'เที่ยงวัน', 'บ่ายโมง', 'บ่ายสองโมง', 'บ่ายสามโมง', 'สี่โมงเย็น', 'ห้าโมงเย็น', 'หกโมงเย็น',
  'หนึ่งทุ่ม', 'สองทุ่ม', 'สามทุ่ม', 'สี่ทุ่ม', 'ห้าทุ่ม',
];

/** "08:00" → "แปดโมงเช้า" · "18:30" → "หกโมงเย็นครึ่ง" · "07:15" → "เจ็ดโมงเช้า 15 นาที" ; รูปแบบผิด → null */
export function timeSpoken(hhmm: string): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const base = HOUR_WORDS[h];
  return min === 0 ? base : min === 30 ? `${base}ครึ่ง` : `${base} ${min} นาที`;
}

/** ชื่อหน่วยที่อ่านออกเสียง (ครบทุกค่า DoseUnit) */
export const UNIT_SPOKEN: Record<DoseUnit, string> = {
  tablet: 'เม็ด', capsule: 'แคปซูล', ml: 'มิลลิลิตร', teaspoon: 'ช้อนชา', tablespoon: 'ช้อนโต๊ะ',
  sachet: 'ซอง', drop: 'หยด', puff: 'พ่น', other: 'หน่วย',
};

/** ชื่อมื้อที่อ่านออกเสียง (ครบทุกค่า Slot) */
export const SLOT_SPOKEN: Record<Slot, string> = {
  morning: 'มื้อเช้า', noon: 'มื้อกลางวัน', evening: 'มื้อเย็น', bedtime: 'ก่อนนอน',
};

/** ก่อน/หลังอาหาร ใช้ข้อความเดียวกับเว็บ (MEAL_LABEL) — 'unknown' ไม่พูด */
export const mealSpoken = (m: MealRelation): string => MEAL_LABEL[m] ?? '';

/**
 * ปริมาณต่อครั้ง: 0.5 → "ครึ่งเม็ด" · 1.5 → "หนึ่งเม็ดครึ่ง" · 2 → "สองเม็ด" ;
 * ค่าแปลก (0.25, ทศนิยมอื่น, > 99) → ใช้เลขดิบ ("0.25 เม็ด")
 */
export function doseSpoken(n: number, unit: DoseUnit): string {
  const u = UNIT_SPOKEN[unit] ?? '';
  const whole = Math.floor(n), frac = Math.round((n - whole) * 100) / 100;
  const w = whole === 0 ? '' : thaiNumber(whole);
  if (n > 0 && frac === 0.5 && (whole === 0 || w)) return whole === 0 ? `ครึ่ง${u}` : `${w}${u}ครึ่ง`;
  if (n > 0 && frac === 0 && w) return unit === 'puff' ? `พ่น${w}ครั้ง` : `${w}${u}`;
  return unit === 'puff' ? `พ่น ${n} ครั้ง` : `${n} ${u}`.trim();
}

const STRENGTH_WORD: Record<string, string> = {
  mcg: 'ไมโครกรัม', 'µg': 'ไมโครกรัม', 'μg': 'ไมโครกรัม', mg: 'มิลลิกรัม', ml: 'มิลลิลิตร', iu: 'หน่วย', g: 'กรัม',
};

/** "500 mg" → "500 มิลลิกรัม" · "250mg/5ml" → "250 มิลลิกรัม ต่อ 5 มิลลิลิตร" (แปลงเฉพาะหน่วยที่เป็นคำเดี่ยว) */
export function strengthSpoken(s: string | null | undefined): string {
  if (!s) return '';
  return s.trim()
    .replace(/(^|[^A-Za-z])(mcg|µg|μg|mg|ml|iu|g)(?![A-Za-z])/gi, (_m, pre: string, u: string) => `${pre} ${STRENGTH_WORD[u.toLowerCase()]} `)
    .replace(/\s*\/\s*/g, ' ต่อ ').replace(/\s+/g, ' ').trim();
}

/**
 * ชื่อยาที่เป็นอักษรละตินตัวพิมพ์ใหญ่ทั้งคำ (≥ 4 ตัว) เช่น METFORMIN → metformin ก่อนส่งให้ TTS
 * (เสียงอ่านมองคำตัวพิมพ์ใหญ่ล้วนเป็นตัวย่อแล้วสะกดทีละตัว) — ใช้กับ "เสียง" เท่านั้น ชื่อที่แสดงบนจอไม่เปลี่ยน ; คำสั้น ≤ 3 ตัว (ASA, MTX) คงเดิม
 */
export const speakableLatin = (s: string): string => s.replace(/(?<![A-Za-z])[A-Z]{4,}(?![A-Za-z])/g, (w) => w.toLowerCase());

/** ชื่อที่ให้อ่าน: tts_name (ใช้ตามที่ผู้ใช้ตั้ง ไม่แปลง) → พจนานุกรม `tts-lexicon.ts` → speakableLatin (ตัวพิมพ์ใหญ่ล้วนยาว ≥ 4 → ตัวเล็ก) → ชื่อเดิม */
export const spokenName = (ttsName: string | null | undefined, name: string): string => {
  const custom = ttsName?.trim();
  return custom ? custom : speakableLatin(lexiconSpeech(name.trim()));
};

/** ท่อนทดลองฟังชื่อยา (ฟอร์มยา) */
export function medNameSpeech(ttsName: string, name: string): string[] {
  const n = spokenName(ttsName, name);
  return n ? chunkSpeech([n]) : ['ยังไม่ได้กรอกชื่อยาค่ะ'];
}

export interface SpeakableDose {
  name: string;
  tts_name?: string | null;
  dose_per_time: number;
  unit: DoseUnit;
  meal_relation: MealRelation;
  status?: 'pending' | 'taken' | 'missed';
}

/** ยา 1 รายการ: "ยาความดัน หนึ่งเม็ด หลังอาหาร" (ไม่อ่านความแรง/ข้อบ่งใช้ — สั้นพอฟังรู้เรื่อง) */
export function doseLine(d: SpeakableDose): string {
  return [spokenName(d.tts_name, d.name), doseSpoken(d.dose_per_time, d.unit), mealSpoken(d.meal_relation)].filter(Boolean).join(' ');
}

export interface SpeakableSlot { slot: Slot; time: string; doses: SpeakableDose[]; }

export const ALL_DONE_SPEECH = 'วันนี้กินยาครบแล้วค่ะ เก่งมากเลยนะคะ';

/** ประโยคของมื้อหนึ่ง เช่น "มื้อเช้า แปดโมงเช้า มียา 2 รายการค่ะ" แล้วตามด้วยยาทีละรายการ */
function slotSentences(s: SpeakableSlot, withStatus: boolean): string[] {
  const t = timeSpoken(s.time);
  const out = [`${SLOT_SPOKEN[s.slot]}${t ? ' ' + t : ''} มียา ${s.doses.length} รายการค่ะ`];
  for (const d of s.doses) {
    const status = withStatus ? (d.status === 'taken' ? ' กินแล้วค่ะ' : ' ยังไม่ได้กินค่ะ') : '';
    out.push(doseLine(d) + status);
  }
  return out;
}

/** ปุ่มใหญ่หน้า Today: เฉพาะมื้อที่ยังมียาที่ยังไม่ได้กิน ; ครบแล้ว/ไม่มียา → ประโยคชมเชย */
export function todaySpeech(slots: SpeakableSlot[]): string[] {
  const left = slots
    .map((s) => ({ ...s, doses: s.doses.filter((d) => d.status !== 'taken') }))
    .filter((s) => s.doses.length > 0);
  if (!left.length) return chunkSpeech([ALL_DONE_SPEECH]);
  const n = left.reduce((c, s) => c + s.doses.length, 0);
  return chunkSpeech([`วันนี้ยังต้องกินยา ${n} รายการค่ะ`, ...left.flatMap((s) => slotSentences(s, false))]);
}

/** ปุ่มเล็กต่อมื้อ: บอกสถานะ "กินแล้ว/ยังไม่ได้กิน" ทีละรายการ */
export function slotSpeech(s: SpeakableSlot): string[] {
  return chunkSpeech(slotSentences(s, true));
}

/** หน้าสรุป: อ่านตัวเลขเป็นประโยค (ไม่อ่านชื่อยา) */
export function adherenceSpeech(a: AdherenceResponse, lineLinked: boolean | null = null): string[] {
  const days = a.range.days;
  if (a.overall.rate === null) return chunkSpeech([`สรุปการกินยา ${days} วันค่ะ`, 'ยังไม่มีข้อมูลยาในช่วงนี้ค่ะ']);
  const parts = [
    `สรุปการกินยา ${days} วันค่ะ`,
    `กินครบ ${a.overall.rate} เปอร์เซ็นต์`,
    `กินแล้ว ${a.overall.taken} ครั้ง จากที่ถึงเวลา ${a.overall.due} ครั้ง`,
  ];
  if (a.streak_days > 0) parts.push(`กินครบต่อเนื่อง ${a.streak_days} วันแล้วค่ะ`);
  parts.push(levelOf(a.overall.rate, lineLinked).text);
  return chunkSpeech(parts);
}

/** แบ่งประโยคเป็นท่อน ≤ max ตัวอักษร: รวมประโยคสั้นเข้าด้วยกัน ตัดที่ขอบประโยค/รายการ ; ประโยคเดี่ยวที่ยาวเกินตัดที่ช่องว่าง */
export function chunkSpeech(sentences: string[], max = MAX_CHUNK): string[] {
  const pieces: string[] = [];
  for (const raw of sentences) {
    let s = raw.trim();
    while (s.length > max) {
      let cut = s.lastIndexOf(' ', max);
      if (cut < max / 2) cut = max;
      pieces.push(s.slice(0, cut).trim());
      s = s.slice(cut).trim();
    }
    if (s) pieces.push(s);
  }
  const out: string[] = [];
  let cur = '';
  for (const p of pieces) {
    const next = cur ? `${cur}. ${p}` : p;
    if (next.length <= max) cur = next;
    else { if (cur) out.push(cur); cur = p; }
  }
  if (cur) out.push(cur);
  return out;
}

/** ชื่อเสียงสำหรับแสดง: ยุบคำซ้ำติดกัน ("ไทย ไทย" → "ไทย") แล้วต่อ (lang) เฉพาะเมื่อชื่อยังไม่มีรหัสภาษา (th-TH / th_TH / tha) */
export function voiceLabel(v: { name: string; lang: string }): string {
  const name = v.name.trim().split(/\s+/).filter((w, i, a) => i === 0 || w !== a[i - 1]).join(' ');
  const code = v.lang.trim();
  const norm = (s: string): string => s.toLowerCase().replace(/_/g, '-');
  const has = norm(name).includes(norm(code)) || /\((th|tha)([-_][a-z]+)?\)/i.test(name);
  return !code || has ? name : `${name} (${code})`;
}
