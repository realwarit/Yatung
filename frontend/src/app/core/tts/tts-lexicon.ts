/**
 * พจนานุกรมคำอ่านไทย สำหรับคำอังกฤษในชื่อยา — ใช้กับ "เสียง" เท่านั้น ชื่อบนจอไม่เปลี่ยน
 * เหตุผล: เสียงไทยของ iPhone อ่าน "Vitamin" เป็น "ไวตามินอ" ; เสียงอ่านมองตัวพิมพ์ใหญ่ล้วนเป็นตัวย่อแล้วสะกดทีละตัว
 * ลำดับการเลือกชื่อที่พูด (spokenName): tts_name → พจนานุกรม → speakableLatin → ชื่อเดิม
 * เทียบทีละคำ (ตัวอักษรละติน/ตัวเลขต่อกัน) ไม่สนตัวพิมพ์ ; คำที่ไม่มีในพจนานุกรมคงเดิม
 */
export const LEXICON: Readonly<Record<string, string>> = {
  // ทั่วไป
  vitamin: 'วิตามิน', calcium: 'แคลเซียม', iron: 'ไอเอิร์น', zinc: 'ซิงค์', folic: 'โฟลิก', acid: 'แอซิด', omega: 'โอเมก้า', fish: 'ฟิช', oil: 'ออยล์',
  // ยาในซองตัวอย่าง docs/sample-images #1–#6
  metformin: 'เมทฟอร์มิน', paracetamol: 'พาราเซตามอล', amlodipine: 'แอมโลดิปีน', simvastatin: 'ซิมวาสแตติน',
  amoxicillin: 'อะม็อกซีซิลลิน', omeprazole: 'โอเมพราโซล',
  // ยาที่พบบ่อยเพิ่ม
  aspirin: 'แอสไพริน', ibuprofen: 'ไอบูโพรเฟน', atorvastatin: 'อะทอร์วาสแตติน', losartan: 'โลซาร์แทน', enalapril: 'อีนาลาพริล',
  furosemide: 'ฟูโรเซไมด์', glipizide: 'กลิพิไซด์', insulin: 'อินซูลิน', warfarin: 'วาร์ฟาริน', cetirizine: 'เซทิริซีน', loratadine: 'โลราทาดีน',
  // หน่วยที่ยังไม่มีใน strengthSpoken
  tablet: 'เม็ด', tab: 'เม็ด', capsule: 'แคปซูล', cap: 'แคปซูล', drop: 'หยด', drops: 'หยด', mcg: 'ไมโครกรัม', mg: 'มิลลิกรัม', ml: 'มิลลิลิตร', iu: 'หน่วย', g: 'กรัม',
  er: 'อีอาร์', xr: 'เอ็กซ์อาร์', sr: 'เอสอาร์', od: 'โอดี', hcl: 'เอชซีแอล',
  // ตัวอักษรเดี่ยว A–Z (วิตามิน D, B12 → "บี" + ตัวเลข)
  a: 'เอ', b: 'บี', c: 'ซี', d: 'ดี', e: 'อี', f: 'เอฟ', h: 'เอช', i: 'ไอ', j: 'เจ', k: 'เค', l: 'แอล', m: 'เอ็ม',
  n: 'เอ็น', o: 'โอ', p: 'พี', q: 'คิว', r: 'อาร์', s: 'เอส', t: 'ที', u: 'ยู', v: 'วี', w: 'ดับเบิลยู', x: 'เอ็กซ์', y: 'วาย', z: 'แซด',
};

/** ตัวอักษรเดี่ยว: g/G เป็นหน่วย "กรัม" เมื่อมาหลังตัวเลข แต่ตัวเดียวโดดๆ ในชื่อ ("Vitamin G") อ่านเป็นตัวอักษร */
const LETTER_G = 'จี';

/** แปลงทีละคำละติน ("Vitamin D3" → "วิตามิน ดี 3", "METFORMIN 500 mg" → "เมทฟอร์มิน 500 มิลลิกรัม") */
export function lexiconSpeech(text: string): string {
  return text
    .replace(/[A-Za-zµμ]+/g, (w, offset: number, whole: string) => {
      const key = w.toLowerCase();
      if (key === 'g') {
        const prevIsDigit = /\d\s*$/.test(whole.slice(0, offset));
        return prevIsDigit ? LEXICON['g'] : LETTER_G;
      }
      if (key === 'µg' || key === 'μg') return LEXICON['mcg'];
      return LEXICON[key] ?? w;
    })
    .replace(/(\p{Script=Thai})(\d)/gu, '$1 $2')       // "ดี3" → "ดี 3"
    .replace(/(\d)(\p{Script=Thai})/gu, '$1 $2')       // "500มิลลิกรัม" → "500 มิลลิกรัม"
    .replace(/\s+/g, ' ').trim();
}
