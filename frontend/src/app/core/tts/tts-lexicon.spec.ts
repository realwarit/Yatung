import { LEXICON, lexiconSpeech } from './tts-lexicon';
import { spokenName } from './speech-text';

describe('tts-lexicon', () => {
  const cases: [string, string][] = [
    ['Vitamin', 'วิตามิน'], ['calcium', 'แคลเซียม'], ['Metformin', 'เมทฟอร์มิน'], ['Paracetamol', 'พาราเซตามอล'], ['Amlodipine', 'แอมโลดิปีน'],
    ['Simvastatin', 'ซิมวาสแตติน'], ['Amoxicillin', 'อะม็อกซีซิลลิน'], ['Omeprazole', 'โอเมพราโซล'],
    ['mg', 'มิลลิกรัม'], ['mcg', 'ไมโครกรัม'], ['ml', 'มิลลิลิตร'], ['IU', 'หน่วย'], ['tablet', 'เม็ด'], ['capsule', 'แคปซูล'],
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
      expect(out, ch).toMatch(/^\p{Script=Thai}+$/u);
      expect(lexiconSpeech(ch.toUpperCase())).toBe(out);
    }
    expect(Object.keys(LEXICON).filter((k) => k.length === 1).length).toBe(26);
  });

  it('"Vitamin D3" → "วิตามิน ดี 3"', () => expect(lexiconSpeech('Vitamin D3')).toBe('วิตามิน ดี 3'));
  it('"Vitamin D" ผ่าน spokenName (ไม่มี tts_name) ก็อ่านเป็นไทย ไม่เหลืออักษรละติน', () => {
    expect(spokenName(null, 'Vitamin D')).toBe('วิตามิน ดี');
    expect(spokenName(null, 'Vitamin D3')).not.toMatch(/[A-Za-z]/);
  });
  it('"METFORMIN 500 mg" → "เมทฟอร์มิน 500 มิลลิกรัม"', () => expect(lexiconSpeech('METFORMIN 500 mg')).toBe('เมทฟอร์มิน 500 มิลลิกรัม'));
  it('g หลังตัวเลข = กรัม ; g โดดๆ = ตัวอักษร จี', () => {
    expect(lexiconSpeech('5 g')).toBe('5 กรัม');
    expect(lexiconSpeech('Vitamin G')).toBe('วิตามิน จี');
  });
  it('คำที่ไม่มีในพจนานุกรมและข้อความไทยคงเดิม', () => {
    expect(lexiconSpeech('Zolpidem')).toBe('Zolpidem');
    expect(lexiconSpeech('ยาลดความดัน')).toBe('ยาลดความดัน');
  });
  it('tts_name มาก่อนพจนานุกรมเสมอ (ไม่แปลงซ้ำ)', () => {
    expect(spokenName('วิตามินดี', 'Vitamin D')).toBe('วิตามินดี');
    expect(spokenName('Vitamin', 'Vitamin D')).toBe('Vitamin');
  });
});
