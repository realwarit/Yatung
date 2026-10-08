// ตรวจซ้ำฝั่ง server: source_text ของยาตัวหนึ่งเขียน "ขนาดยาต่อครั้ง" ไว้หลายแบบที่ขัดกันหรือไม่
// (เช่น "Sig: 1 tab" กับ "ครั้งละ ½ เม็ด") — ใช้เป็น review_flag ช่อง dose_per_time เมื่อ AI ไม่เตือนเอง
// หลักการ: นับเฉพาะข้อความที่ "บอกวิธีกิน" (ตามหลัง Sig/take/use/ครั้งละ/รับประทาน/กิน/ทาน หรือมีคำความถี่ตามหลัง เช่น po bid tid)
//          ไม่นับจำนวนรวมในซอง (Disp: 30 tabs, #30, จำนวน 30 เม็ด, x30) และไม่นับความแรง (500 mg) / ความถี่ (วันละ 2 ครั้ง)
// ช่วง "1–2" ถือเป็นขนาดยา 1 แบบ (ไม่แตกเป็นสองค่า) — การปรับค่าของช่วงเป็นหน้าที่ของ AI ตามกฎ Ambiguity ใน prompt
const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
const FRACTION = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

const UNIT = String.raw`(?:tab(?:let)?s?|caps?(?:ule)?s?|เม็ด|แคปซูล|ช้อนชา|ช้อนโต๊ะ|ซอง|หยด|มล\.?|ซีซี|ml|cc|puff|พ่น|สูด)`;
// ตัวเลขหนึ่งตัว: "1 1/2", "1½", "½", "1/2", "1.5", "2" หรือคำว่า "ครึ่ง"
const NUM = String.raw`(?:\d+\s*[½¼¾⅓⅔]|[½¼¾⅓⅔]|\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|ครึ่ง)`;
// ช่วง "1-2", "1–2", "1 - 2", "1 ถึง 2" (ตัวเลขสองตัวคั่นด้วยขีดหรือคำว่า "ถึง")
const RANGE_SEP = String.raw`(?:\s*[-–—~]\s*|\s+ถึง\s+)`;
const AMOUNT = String.raw`(${NUM}(?:${RANGE_SEP}${NUM})?)`;
// คำความถี่แบบย่อของใบสั่งยา (ใช้ยืนยันว่า "N tab" เป็นวิธีกิน ไม่ใช่จำนวนรวม)
const FREQ = String.raw`(?:po|p\.o\.?|od|qd|bid|tid|qid|hs|prn|ac|pc|q\s?\d+\s?h(?:r|rs)?|stat)\b`;

const PATTERNS = [
  // อังกฤษ: Sig / take / use / ii (apply ไม่รวม) + จำนวน + หน่วย
  new RegExp(String.raw`(?<![a-z])(?:sig|take|use)\s*[:.]?\s*${AMOUNT}\s*${UNIT}`, 'gi'),
  // ไทย: ครั้งละ / ครั้งหนึ่ง / รับประทาน / กิน / ทาน + จำนวน + หน่วย
  new RegExp(String.raw`(?:ครั้งละ|ครั้งหนึ่ง|รับประทาน|กิน|ทาน)\s*${AMOUNT}\s*${UNIT}`, 'g'),
  // อังกฤษแบบไม่มี Sig: "1 tab po bid" — ต้องมีคำความถี่ตามหลังเท่านั้น
  new RegExp(String.raw`${AMOUNT}\s*${UNIT}\s+${FREQ}`, 'gi'),
];
// จำนวนรวมที่อยู่ติดหน้าตัวเลข: ไม่ใช่ขนาดยา
const QUANTITY_BEFORE = /(?:disp(?:ense)?|qty|quantity|total|จำนวน|รวม|#|(?<![a-z])[x×])\s*[:.]?\s*$/i;

function normalize(text) {
  return String(text || '').replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)))
    .replace(/ /g, ' ');
}

function parseNumber(s) {
  s = s.trim();
  if (s === 'ครึ่ง') return 0.5;
  let m;
  if ((m = s.match(/^(\d+)\s*([½¼¾⅓⅔])$/))) return Number(m[1]) + FRACTION[m[2]];
  if (FRACTION[s] !== undefined) return FRACTION[s];
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return Number(m[1]) / Number(m[2]);
  return Number(s);
}

const round = (n) => Math.round(n * 100) / 100;

/** "1 - 2" → { key: '1-2', values: [1,2] } ; "½" → { key: '0.5', values: [0.5] } ; ผิดรูป → null */
function parseAmount(raw) {
  const parts = raw.split(new RegExp(RANGE_SEP)).map((p) => p.trim()).filter(Boolean);
  const values = parts.map(parseNumber).map(round);
  if (!values.length || values.some((v) => !Number.isFinite(v) || v <= 0)) return null;
  return { key: values.join('-'), values };
}

/** ขนาดยาที่ปรากฏใน text ตามลำดับที่เจอ (ไม่ซ้ำ): [{ key, values }] */
function findDoses(text) {
  const t = normalize(text);
  const hits = [];
  for (const re of PATTERNS) {
    for (const m of t.matchAll(re)) {
      const start = m.index + m[0].indexOf(m[1]);
      if (QUANTITY_BEFORE.test(t.slice(Math.max(0, start - 14), start))) continue;
      const amt = parseAmount(m[1]);
      if (amt) hits.push({ at: start, ...amt });
    }
  }
  hits.sort((a, b) => a.at - b.at);
  const seen = new Set();
  return hits.filter((h) => !seen.has(h.key) && seen.add(h.key)).map(({ key, values }) => ({ key, values }));
}

// 0.5 → ½, 1.5 → 1½, 0.25 → ¼, 2 → 2, 0.4 → 0.4
function show(n) {
  const whole = Math.floor(n + 1e-9);
  const frac = round(n - whole);
  const f = { 0.5: '½', 0.25: '¼', 0.75: '¾' }[frac];
  if (frac === 0) return String(whole);
  if (f) return whole ? `${whole}${f}` : f;
  return String(round(n));
}
const showDose = (d) => d.values.map(show).join('–');

/**
 * ข้อความเตือนถ้า source_text ระบุขนาดยาต่อครั้งตั้งแต่ 2 แบบขึ้นไป ; ไม่ขัดกัน/ไม่พบ = null
 * เช่น "ซองเขียนขนาดยาไว้ 2 แบบ (1 และ ½) กรุณาตรวจ"
 */
function doseConflictReason(sourceText) {
  const doses = findDoses(sourceText);
  if (doses.length < 2) return null;
  const shown = doses.map(showDose);
  const list = shown.length === 2 ? shown.join(' และ ') : `${shown.slice(0, -1).join(', ')} และ ${shown[shown.length - 1]}`;
  return `ซองเขียนขนาดยาไว้ ${doses.length} แบบ (${list}) กรุณาตรวจ`;
}

module.exports = { findDoses, doseConflictReason };
