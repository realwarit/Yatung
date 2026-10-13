import { UNITS } from '../i18n/labels';
import { AdherenceResponse } from '../api/stats.api';
import {
  ALL_DONE_SPEECH, HOUR_WORDS, MAX_CHUNK, SLOT_SPOKEN, UNIT_SPOKEN, adherenceSpeech, chunkSpeech, doseLine, doseSpoken,
  mealSpoken, medNameSpeech, slotSpeech, speakableLatin, spokenName, strengthSpoken, thaiNumber, timeSpoken, todaySpeech,
} from './speech-text';

describe('timeSpoken (เวลาเป็นภาษาพูดไทย)', () => {
  const cases: [string, string][] = [
    ['00:00', 'เที่ยงคืน'], ['01:00', 'ตีหนึ่ง'], ['05:00', 'ตีห้า'], ['06:00', 'หกโมงเช้า'], ['08:00', 'แปดโมงเช้า'],
    ['10:00', 'สิบโมงเช้า'], ['11:00', 'สิบเอ็ดโมง'], ['12:00', 'เที่ยงวัน'], ['13:00', 'บ่ายโมง'], ['14:00', 'บ่ายสองโมง'],
    ['15:00', 'บ่ายสามโมง'], ['16:00', 'สี่โมงเย็น'], ['18:00', 'หกโมงเย็น'], ['19:00', 'หนึ่งทุ่ม'], ['21:00', 'สามทุ่ม'], ['23:00', 'ห้าทุ่ม'],
  ];
  for (const [t, w] of cases) it(`${t} → ${w}`, () => expect(timeSpoken(t)).toBe(w));
  it(':30 อ่านว่า ครึ่ง · :00 ไม่อ่านนาที · อื่นๆ "n นาที"', () => {
    expect(timeSpoken('18:30')).toBe('หกโมงเย็นครึ่ง');
    expect(timeSpoken('08:15')).toBe('แปดโมงเช้า 15 นาที');
    expect(timeSpoken('12:30')).toBe('เที่ยงวันครึ่ง');
  });
  it('มีคำครบ 24 ชั่วโมง และไม่มีเลขดิบในผลลัพธ์ของชั่วโมงเต็ม', () => {
    expect(HOUR_WORDS.length).toBe(24);
    for (let h = 0; h < 24; h++) expect(timeSpoken(`${String(h).padStart(2, '0')}:00`)).not.toMatch(/\d/);
  });
  it('รับ HH:mm:ss และรูปแบบผิด → null', () => {
    expect(timeSpoken('08:00:00')).toBe('แปดโมงเช้า');
    expect(timeSpoken('25:00')).toBeNull();
    expect(timeSpoken('abc')).toBeNull();
  });
});

describe('ปริมาณและหน่วย', () => {
  it('ครึ่ง/จำนวนเต็ม/จำนวนครึ่ง', () => {
    expect(doseSpoken(0.5, 'tablet')).toBe('ครึ่งเม็ด');
    expect(doseSpoken(1, 'tablet')).toBe('หนึ่งเม็ด');
    expect(doseSpoken(1.5, 'tablet')).toBe('หนึ่งเม็ดครึ่ง');
    expect(doseSpoken(2, 'capsule')).toBe('สองแคปซูล');
    expect(doseSpoken(11, 'tablet')).toBe('สิบเอ็ดเม็ด');
    expect(doseSpoken(21, 'tablet')).toBe('ยี่สิบเอ็ดเม็ด');
    expect(doseSpoken(0.5, 'teaspoon')).toBe('ครึ่งช้อนชา');
  });
  it('ค่าแปลก → เลขดิบ', () => {
    expect(doseSpoken(0.25, 'tablet')).toBe('0.25 เม็ด');
    expect(doseSpoken(2.75, 'tablet')).toBe('2.75 เม็ด');
    expect(doseSpoken(100, 'tablet')).toBe('100 เม็ด');
  });
  it('พ่น อ่านเป็น "พ่น n ครั้ง"', () => expect(doseSpoken(2, 'puff')).toBe('พ่นสองครั้ง'));
  it('ตารางหน่วย/มื้อครอบทุกค่า enum', () => {
    for (const u of UNITS) expect(UNIT_SPOKEN[u]).toBeTruthy();
    for (const s of ['morning', 'noon', 'evening', 'bedtime'] as const) expect(SLOT_SPOKEN[s]).toBeTruthy();
    for (const m of ['before', 'after', 'with', 'any'] as const) expect(mealSpoken(m)).toBeTruthy();
    expect(mealSpoken('unknown')).toBe('');
  });
  it('thaiNumber', () => {
    expect([0, 1, 10, 11, 20, 21, 22, 35, 99].map(thaiNumber)).toEqual(['ศูนย์', 'หนึ่ง', 'สิบ', 'สิบเอ็ด', 'ยี่สิบ', 'ยี่สิบเอ็ด', 'ยี่สิบสอง', 'สามสิบห้า', 'เก้าสิบเก้า']);
    expect(thaiNumber(100)).toBeNull();
    expect(thaiNumber(1.5)).toBeNull();
  });
});

describe('strengthSpoken', () => {
  it('แปลงหน่วย', () => {
    expect(strengthSpoken('500 mg')).toBe('500 มิลลิกรัม');
    expect(strengthSpoken('500mg')).toBe('500 มิลลิกรัม');
    expect(strengthSpoken('50 mcg')).toBe('50 ไมโครกรัม');
    expect(strengthSpoken('50 µg')).toBe('50 ไมโครกรัม');
    expect(strengthSpoken('1 g')).toBe('1 กรัม');
    expect(strengthSpoken('5 mL')).toBe('5 มิลลิลิตร');
    expect(strengthSpoken('1000 IU')).toBe('1000 หน่วย');
    expect(strengthSpoken('250mg/5ml')).toBe('250 มิลลิกรัม ต่อ 5 มิลลิลิตร');
  });
  it('ไม่แตะคำที่มีตัวอักษรติดกัน และค่าว่าง', () => {
    expect(strengthSpoken('Magnesium')).toBe('Magnesium');
    expect(strengthSpoken(null)).toBe('');
    expect(strengthSpoken('')).toBe('');
  });
});

describe('ชื่อที่ให้อ่าน (tts_name)', () => {
  it('ใช้ tts_name ถ้ามี ไม่งั้นชื่อยา', () => {
    expect(spokenName('ยาความดัน', 'Amlodipine')).toBe('ยาความดัน');
    expect(spokenName(null, 'Amlodipine')).toBe('แอมโลดิปีน');
    expect(spokenName('  ', 'Amlodipine')).toBe('แอมโลดิปีน');
    expect(spokenName(null, 'Zolpidem')).toBe('Zolpidem');
    expect(medNameSpeech('', '')).toEqual(['ยังไม่ได้กรอกชื่อยาค่ะ']);
  });
  it('doseLine', () => {
    expect(doseLine({ name: 'Amlodipine', tts_name: 'ยาความดัน', dose_per_time: 1, unit: 'tablet', meal_relation: 'after' })).toBe('ยาความดัน หนึ่งเม็ด หลังอาหาร');
  });
});

describe('chunkSpeech (แบ่งท่อน ≤ 150)', () => {
  it('รวมประโยคสั้นเป็นท่อนเดียว', () => expect(chunkSpeech(['ก', 'ข'])).toEqual(['ก. ข']));
  it('ไม่เกิน MAX_CHUNK ทุกท่อน และตัดที่ขอบประโยค', () => {
    const sentences = Array.from({ length: 12 }, (_, i) => `ยาตัวที่ ${i + 1} ครั้งละหนึ่งเม็ด หลังอาหาร`);
    const out = chunkSpeech(sentences);
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(MAX_CHUNK);
    expect(out.join('. ')).toContain('ยาตัวที่ 12');
  });
  it('ประโยคเดี่ยวยาวเกิน → ตัดที่ช่องว่าง', () => {
    const long = Array.from({ length: 60 }, () => 'คำยาว').join(' ');
    for (const c of chunkSpeech([long])) expect(c.length).toBeLessThanOrEqual(MAX_CHUNK);
  });
  it('ไม่มีท่อนว่าง', () => expect(chunkSpeech(['', '  '])).toEqual([]));
});

const dose = (status: 'pending' | 'taken' | 'missed', name = 'ยา A') =>
  ({ name, dose_per_time: 1, unit: 'tablet' as const, meal_relation: 'after' as const, status });

describe('todaySpeech / slotSpeech', () => {
  it('เฉพาะยาที่ยังไม่กิน', () => {
    const t = todaySpeech([
      { slot: 'morning', time: '08:00', doses: [dose('taken', 'ยาเช้า')] },
      { slot: 'evening', time: '18:00', doses: [dose('pending', 'ยาเย็น'), dose('missed', 'ยาลืม')] },
    ]).join(' ');
    expect(t).toContain('2 รายการ');
    expect(t).toContain('มื้อเย็น หกโมงเย็น');
    expect(t).toContain('ยาเย็น');
    expect(t).toContain('ยาลืม');
    expect(t).not.toContain('ยาเช้า');
    expect(t).not.toMatch(/\d\d:\d\d/);
  });
  it('กินครบแล้ว/ไม่มียา → ประโยคชมเชย', () => {
    expect(todaySpeech([{ slot: 'morning', time: '08:00', doses: [dose('taken')] }])).toEqual([ALL_DONE_SPEECH]);
    expect(todaySpeech([])).toEqual(['วันนี้กินยาครบแล้วค่ะ เก่งมากเลยนะคะ']);
  });
  it('slotSpeech บอกสถานะทีละรายการ', () => {
    const t = slotSpeech({ slot: 'noon', time: '12:00', doses: [dose('taken', 'ยา ก'), dose('pending', 'ยา ข')] }).join(' ');
    expect(t).toContain('ยา ก หนึ่งเม็ด หลังอาหาร กินแล้วค่ะ');
    expect(t).toContain('ยา ข หนึ่งเม็ด หลังอาหาร ยังไม่ได้กินค่ะ');
  });
});

describe('adherenceSpeech', () => {
  const base = (rate: number | null, streak = 0): AdherenceResponse => ({
    range: { from: '2026-10-06', to: '2026-10-12', days: 7 },
    overall: { taken: 18, missed: 2, pending_due: 1, due: 21, rate },
    days: [], by_meal: [], by_medication: [], by_source: { app: 0, push: 0, line: 0, caregiver: 0, other: 0 }, streak_days: streak, generated_at: '',
  });
  it('อ่านตัวเลขเป็นประโยค ไม่มีชื่อยา', () => {
    const t = adherenceSpeech(base(86, 3)).join(' ');
    expect(t).toContain('กินครบ 86 เปอร์เซ็นต์');
    expect(t).toContain('กินแล้ว 18 ครั้ง จากที่ถึงเวลา 21 ครั้ง');
    expect(t).toContain('ต่อเนื่อง 3 วัน');
  });
  it('rate = null → ยังไม่มีข้อมูล (ไม่พูด 0%)', () => {
    const t = adherenceSpeech(base(null)).join(' ');
    expect(t).toContain('ยังไม่มีข้อมูล');
    expect(t).not.toContain('เปอร์เซ็นต์');
  });
});

describe('C5: ชื่อยาตัวพิมพ์ใหญ่ทั้งคำ → ตัวเล็กก่อนส่งให้ TTS', () => {
  it('ZOLPIDEM (ไม่อยู่ในพจนานุกรม, ≥ 4 ตัว) → zolpidem', () => expect(spokenName(null, 'ZOLPIDEM')).toBe('zolpidem'));
  it('หลายคำ/มีตัวเลข: เฉพาะคำที่เป็นตัวพิมพ์ใหญ่ล้วนยาว ≥ 4', () => {
    expect(speakableLatin('METFORMIN 500 mg')).toBe('metformin 500 mg');
    expect(speakableLatin('AMOXICILLIN-CLAVULANATE')).toBe('amoxicillin-clavulanate');
  });
  it('คำสั้น ≤ 3 ตัวคงเดิม (ตัวย่อที่ควรสะกด)', () => {
    expect(speakableLatin('ASA')).toBe('ASA');
    expect(speakableLatin('MTX 2.5')).toBe('MTX 2.5');
  });
  it('มีตัวพิมพ์เล็กปนอยู่แล้ว/ตัวพิมพ์ใหญ่เฉพาะตัวแรก ไม่แตะ', () => {
    expect(speakableLatin('Metformin')).toBe('Metformin');
    expect(speakableLatin('MetFORMIN')).toBe('MetFORMIN');
    expect(speakableLatin('paracetamol')).toBe('paracetamol');
  });
  it('ชื่อไทย/ปนไทย ไม่แตะ', () => {
    expect(speakableLatin('พาราเซตามอล')).toBe('พาราเซตามอล');
    expect(speakableLatin('ยา AMLODIPINE')).toBe('ยา amlodipine');
  });
  it('มี tts_name = ใช้ตามที่ตั้ง ไม่แปลงตัวพิมพ์ (ผู้ใช้ตั้งใจเขียน)', () => {
    expect(spokenName('METFORMIN', 'METFORMIN')).toBe('METFORMIN');
    expect(spokenName('ยาเบาหวาน', 'METFORMIN')).toBe('ยาเบาหวาน');
  });
  it('ไม่เปลี่ยนค่าที่ส่งเข้า (ชื่อบนจอไม่ถูกแตะ) และไปถึงประโยคที่อ่านจริง', () => {
    const d = { name: 'ZOLPIDEM', tts_name: null, dose_per_time: 1, unit: 'tablet', meal_relation: 'after' } as Parameters<typeof doseLine>[0];
    expect(doseLine(d)).toContain('zolpidem');
    expect(doseLine(d)).not.toContain('ZOLPIDEM');
    expect(d.name).toBe('ZOLPIDEM');
  });
  it('ท่อนทดลองฟังชื่อยาในฟอร์ม ใช้กฎเดียวกัน', () => expect(medNameSpeech('', 'ZOLPIDEM')).toEqual(['zolpidem']));
});
