import { LEXICON, lexiconSpeech } from './tts-lexicon';
import { chunkSpeech, spokenName, todaySpeech } from './speech-text';

describe('tts-lexicon', () => {
  const cases: [string, string][] = [
    ['Vitamin', 'วิ ตา มิน'], ['calcium', 'แคล เซียม'], ['Metformin', 'เมท ฟอร์ มิน'], ['Paracetamol', 'พา รา เซ ตา มอล'], ['Amlodipine', 'แอม โล ดิ ปีน'],
    ['Simvastatin', 'ซิม วา สะ แต ติน'], ['Amoxicillin', 'อะ ม็อก ซี ซิล ลิน'], ['Omeprazole', 'โอ เม ปรา โซล'],
    ['mg', 'มิล ลิ กรัม'], ['mcg', 'ไม โคร กรัม'], ['ml', 'มิล ลิ ลิตร'], ['IU', 'หน่วย'], ['tablet', 'เม็ด'], ['capsule', 'แคป ซูล'],
  ];
  for (const [en, th] of cases) {
    it(`${en} → ${th} (ไม่สนตัวพิมพ์)`, () => {
      expect(lexiconSpeech(en)).toBe(th);
      expect(lexiconSpeech(en.toUpperCase())).toBe(th);
    });
  }

  it('ตัวอักษรเดี่ยว A–Z ครบ 26 ตัว', () => {
    for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
      const out = lexiconSpeech(ch);
      expect(out, ch).toMatch(/^[\p{Script=Thai} ]+$/u);
      expect(lexiconSpeech(ch.toUpperCase())).toBe(out);
    }
    expect(Object.keys(LEXICON).filter((k) => k.length === 1).length).toBe(26);
  });

  it('"Vitamin D3" → "วิ ตา มิน ดี 3"', () => expect(lexiconSpeech('Vitamin D3')).toBe('วิ ตา มิน ดี 3'));
  it('"Vitamin D" ผ่าน spokenName (ไม่มี tts_name) ก็อ่านเป็นไทย ไม่เหลืออักษรละติน', () => {
    expect(spokenName(null, 'Vitamin D')).toBe('วิ ตา มิน ดี');
    expect(spokenName(null, 'Vitamin D3')).not.toMatch(/[A-Za-z]/);
  });
  it('"METFORMIN 500 mg" → "เมท ฟอร์ มิน 500 มิล ลิ กรัม"', () => expect(lexiconSpeech('METFORMIN 500 mg')).toBe('เมท ฟอร์ มิน 500 มิล ลิ กรัม'));
  it('g หลังตัวเลข = กรัม ; g โดดๆ = ตัวอักษร จี', () => {
    expect(lexiconSpeech('5 g')).toBe('5 กรัม');
    expect(lexiconSpeech('Vitamin G')).toBe('วิ ตา มิน จี');
  });
  it('คำที่ไม่มีในพจนานุกรมและข้อความไทยคงเดิม', () => {
    expect(lexiconSpeech('Zolpidem')).toBe('Zolpidem');
    expect(lexiconSpeech('ยาลดความดัน')).toBe('ยาลดความดัน');
  });
  it('คำอ่านหลายพยางค์ต้องเว้นวรรคระหว่างพยางค์ทุกคำ (iOS ตัดคำทับศัพท์ผิดถ้าติดกัน) และช่องว่างเดียวเสมอ', () => {
    for (const [k, v] of Object.entries(LEXICON)) {
      expect(v, k).not.toMatch(/ {2,}/);
      expect(v, k).toBe(v.trim());
    }
    for (const k of ['vitamin', 'calcium', 'metformin', 'paracetamol', 'amlodipine', 'simvastatin', 'amoxicillin', 'omeprazole']) expect(LEXICON[k], k).toContain(' ');
  });
  it('speech-text ไม่ยุบช่องว่างระหว่างพยางค์ และ chunkSpeech ไม่ตัดกลางคำ', () => {
    const t = spokenName(null, 'Vitamin D3');
    expect(todaySpeech([{ slot: 'morning', time: '08:00', doses: [{ name: 'Vitamin D3', dose_per_time: 1, unit: 'tablet', meal_relation: 'after' }] }]).join(' ')).toContain(t);
    const long = Array.from({ length: 40 }, () => 'วิ ตา มิน ดี').join(' ');
    const chunks = chunkSpeech([long]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) { expect(c.length).toBeLessThanOrEqual(150); expect(c).toMatch(/^[\p{Script=Thai}. ]+$/u); }
    // ตัดที่ช่องว่างเท่านั้น: ต่อท่อนกลับแล้วได้พยางค์ครบเดิมตามลำดับ (ไม่มีพยางค์ถูกตัดครึ่ง/หาย) ; ประโยคจริงของแอปสั้นกว่า 150 ตัวอักษรจึงไม่ถูกตัด
    expect(chunks.join(' ').replace(/\. /g, ' ').replace(/ {2,}/g, ' ')).toBe(long);
  });
  it('tts_name มาก่อนพจนานุกรมเสมอ (ไม่แปลงซ้ำ)', () => {
    expect(spokenName('วิตามินดี', 'Vitamin D')).toBe('วิตามินดี');
    expect(spokenName('Vitamin', 'Vitamin D')).toBe('Vitamin');
  });
});
