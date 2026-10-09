// สร้างรูปน้องยาตรง (โบกมือ) 512×512 PNG พื้นโปร่งใส สำหรับข้อความ Flex ของ LINE
// ใช้: node tools/make-line-mascot.mjs  → public/line/mascot.png  (เสิร์ฟที่ /line/mascot.png ตาม LINE_MASCOT_URL)
// สี/รูปทรงคัดลอกจาก shared/components/mascot (mood wave) + styles/_tokens.scss (--yt-mascot-*) — แก้ที่นั่นแล้วต้องแก้ที่นี่ด้วย
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const C = { top: '#14b8a6', bottom: '#fffbf2', ink: '#134e4a', cheek: '#fda4af', white: '#ffffff' };
const ARMS = ['M56 120Q42 130 44 148', 'M144 118Q168 110 166 82'];   // mood wave

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -2 216 216" width="512" height="512">
  <ellipse cx="100" cy="206" rx="38" ry="5" fill="#134e4a" fill-opacity=".18"/>
  <g fill="${C.top}" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round">
    <rect x="68" y="158" width="26" height="38" rx="13"/><rect x="106" y="158" width="26" height="38" rx="13"/>
  </g>
  <path d="M52 96V82a48 48 0 0 1 96 0v14z" fill="${C.top}"/>
  <path d="M52 96v30a48 48 0 0 0 96 0V96z" fill="${C.bottom}"/>
  <path d="M70 80Q70 60 86 52" fill="none" stroke="${C.bottom}" stroke-width="6" stroke-linecap="round" opacity=".6"/>
  <g fill="none" stroke="${C.ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M52 96h96"/><rect x="52" y="34" width="96" height="140" rx="48"/>
    <path d="M91 137Q100 146 109 137"/>
  </g>
  <ellipse cx="66" cy="138" rx="8" ry="5" fill="${C.cheek}"/><ellipse cx="134" cy="138" rx="8" ry="5" fill="${C.cheek}"/>
  <circle cx="82" cy="122" r="9" fill="${C.ink}"/><circle cx="85" cy="119" r="3" fill="${C.white}"/>
  <circle cx="118" cy="122" r="9" fill="${C.ink}"/><circle cx="121" cy="119" r="3" fill="${C.white}"/>
  ${ARMS.map((d) => `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>`).join('\n  ')}
  ${ARMS.map((d) => `<path d="${d}" fill="none" stroke="${C.top}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`).join('\n  ')}
</svg>`;

const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'line', 'mascot.png');
mkdirSync(dirname(out), { recursive: true });
const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
writeFileSync(out, png);
console.log('เขียน', out, png.length, 'bytes');
