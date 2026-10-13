/**
 * พจนานุกรมคำอ่านไทย สำหรับคำอังกฤษในชื่อยา — ใช้กับ "เสียง" เท่านั้น ชื่อบนจอไม่เปลี่ยน
 * เหตุผล: เสียงไทยของ iPhone อ่าน "Vitamin" เป็น "ไวตามินอ" ; เสียงอ่านมองตัวพิมพ์ใหญ่ล้วนเป็นตัวย่อแล้วสะกดทีละตัว
 * ลำดับการเลือกชื่อที่พูด (spokenName): tts_name → พจนานุกรม → speakableLatin → ชื่อเดิม
 * **คำอ่านที่มีหลายพยางค์เขียนเว้นวรรคระหว่างพยางค์** ("วิ ตา มิน") เพราะเสียงไทยของ iOS ตัดคำทับศัพท์ผิด ("วิ-ตาม-อิ-นอ") ถ้าติดกัน ; เว้นวรรคแล้วอ่านถูก (ยืนยันบน iPhone จริง 13 ต.ค.)
 * เทียบทีละคำ (ตัวอักษรละติน/ตัวเลขต่อกัน) ไม่สนตัวพิมพ์ ; คำที่ไม่มีในพจนานุกรมคงเดิม
 */
export const LEXICON: Readonly<Record<string, string>> = {
  // ทั่วไป
  vitamin: 'วิ ตา มิน', calcium: 'แคล เซียม', iron: 'ไอ เอิร์น', zinc: 'ซิงค์', folic: 'โฟ ลิก', acid: 'แอ สิด', omega: 'โอ เม ก้า', fish: 'ฟิช', oil: 'ออยล์',
  // ยาในซองตัวอย่าง docs/sample-images #1–#6
  metformin: 'เมท ฟอร์ มิน', paracetamol: 'พา รา เซ ตา มอล', amlodipine: 'แอม โล ดิ ปีน', simvastatin: 'ซิม วา สะ แต ติน',
  amoxicillin: 'อะ ม็อก ซี ซิล ลิน', omeprazole: 'โอ เม ปรา โซล',
  // ยาที่พบบ่อยเพิ่ม
  aspirin: 'แอส ไพ ริน', ibuprofen: 'ไอ บู โปร เฟน', atorvastatin: 'อะ ทอร์ วา สะ แต ติน', losartan: 'โล ซาร์ ทาน', enalapril: 'อี นา ลา พริล',
  furosemide: 'ฟู โร เซ ไมด์', glipizide: 'กลิ พิ ไซด์', insulin: 'อิน ซู ลิน', warfarin: 'วาร์ ฟา ริน', cetirizine: 'เซ ติ ริ ซีน', loratadine: 'โล รา ทา ดีน',
  // หน่วยที่ยังไม่มีใน strengthSpoken
  tablet: 'เม็ด', tab: 'เม็ด', capsule: 'แคป ซูล', cap: 'แคป ซูล', drop: 'หยด', drops: 'หยด', mcg: 'ไม โคร กรัม', mg: 'มิล ลิ กรัม', ml: 'มิล ลิ ลิตร', iu: 'หน่วย', g: 'กรัม',
  er: 'อี อาร์', xr: 'เอ็กซ์ อาร์', sr: 'เอส อาร์', od: 'โอ ดี', hcl: 'เอช ซี แอล',
  // ตัวอักษรเดี่ยว A–Z (วิตามิน D, B12 → "บี" + ตัวเลข)
  a: 'เอ', b: 'บี', c: 'ซี', d: 'ดี', e: 'อี', f: 'เอฟ', h: 'เอช', i: 'ไอ', j: 'เจ', k: 'เค', l: 'แอล', m: 'เอ็ม',
  n: 'เอ็น', o: 'โอ', p: 'พี', q: 'คิว', r: 'อาร์', s: 'เอส', t: 'ที', u: 'ยู', v: 'วี', w: 'ดับ เบิล ยู', x: 'เอ็กซ์', y: 'วาย', z: 'แซด',
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
