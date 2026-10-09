// สร้างรูปน้องยาตรง 512×512 PNG พื้นโปร่งใส สำหรับข้อความ Flex ของ LINE ใส่ที่ public/line/ (เสิร์ฟที่ ${LINE_ASSET_BASE}/<ไฟล์>)
//   mascot.png        โบกมือ (mood wave)      ← ไฟล์เดิม เก็บไว้ (ใช้เป็นท่ากระดิ่งสำรองเมื่อมี LINE_MASCOT_URL)
//   mascot-bell.png   ถือกระดิ่ง (reminder)   ใช้กับข้อความเตือน
//   mascot-cheer.png  ดีใจ (celebrate)        ใช้กับข้อความสำเร็จ
//   mascot-hello.png  ปกติ (happy)            ใช้กับต้อนรับ / ช่วยเหลือ / rich menu
// ใช้: node tools/make-line-mascot.mjs
// สี/รูปทรงคัดลอกจาก shared/components/mascot (mascot.component.ts/.html/.scss) + styles/_tokens.scss (--yt-mascot-*) — แก้ที่นั่นแล้วต้องแก้ที่นี่ด้วย
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const C = { top: '#14b8a6', bottom: '#fffbf2', ink: '#134e4a', cheek: '#fda4af', white: '#ffffff', accent: '#f59e0b', sweat: '#7dd3fc' };
const ARM_DOWN = ['M56 120Q42 130 44 148', 'M144 120Q158 130 156 148'];
const ARMS = {
  wave: [ARM_DOWN[0], 'M144 118Q168 110 166 82'],
  happy: ARM_DOWN,
  reminder: [ARM_DOWN[0], 'M144 118Q168 112 166 90'],
  celebrate: ['M56 116Q30 108 34 78', 'M144 116Q170 108 166 78'],
};

const eyes = `<circle cx="82" cy="122" r="9" fill="${C.ink}"/><circle cx="85" cy="119" r="3" fill="${C.white}"/>
  <circle cx="118" cy="122" r="9" fill="${C.ink}"/><circle cx="121" cy="119" r="3" fill="${C.white}"/>`;
const strokeBase = `fill="none" stroke="${C.ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"`;

const FACES = {
  smile: { eyes, mouth: `<path d="M91 137Q100 146 109 137" ${strokeBase}/>` },
  cheer: {
    eyes: `<path d="M73 125Q82 112 91 125M109 125Q118 112 127 125" ${strokeBase}/>`,
    mouth: `<path d="M88 136Q100 158 112 136Z" fill="${C.ink}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/><ellipse cx="100" cy="144.5" rx="5" ry="3" fill="${C.cheek}"/>`,
  },
};

const star = ([x, y, s]) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0-11L3.5-3.5L11 0L3.5 3.5L0 11L-3.5 3.5L-11 0L-3.5-3.5Z" fill="${C.accent}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>`;
const conf = ([x, y, r, k]) => `<rect x="-5" y="-3" width="10" height="6" rx="2" transform="translate(${x} ${y}) rotate(${r})" fill="${{ cheek: C.cheek, top: C.top, sweat: C.sweat }[k]}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>`;
const halo = (d) => `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="8" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${C.bottom}" stroke-width="4" stroke-linecap="round"/>`;

const PROPS = {
  none: '',
  bell: ['M144 52Q139 62 144 72', 'M188 52Q193 62 188 72'].map(halo).join('') +
    `<g transform="translate(166 62)"><path d="M-15 14H15Q13 14 13 6Q13 -10 0 -10Q-13 -10 -13 6Q-13 14 -15 14Z" fill="${C.accent}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/><circle cx="0" cy="19" r="4" fill="${C.ink}"/></g>`,
  cheer: [[22, 52, 1.2], [176, 44, 1], [14, 118, 0.8], [188, 118, 0.8]].map(star).join('') +
    [[58, 20, 25, 'cheek'], [148, 16, -20, 'top'], [100, 8, 60, 'sweat'], [190, 82, 40, 'cheek'], [8, 84, -35, 'sweat']].map(conf).join(''),
};

function svgOf(arms, face, props) {
  const arm = (d, c, w) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-14 -6 228 226" width="512" height="512">
  <ellipse cx="100" cy="206" rx="38" ry="5" fill="#134e4a" fill-opacity=".18"/>
  <g fill="${C.top}" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round">
    <rect x="68" y="158" width="26" height="38" rx="13"/><rect x="106" y="158" width="26" height="38" rx="13"/>
  </g>
  <path d="M52 96V82a48 48 0 0 1 96 0v14z" fill="${C.top}"/>
  <path d="M52 96v30a48 48 0 0 0 96 0V96z" fill="${C.bottom}"/>
  <path d="M70 80Q70 60 86 52" fill="none" stroke="${C.bottom}" stroke-width="6" stroke-linecap="round" opacity=".6"/>
  <g ${strokeBase}><path d="M52 96h96"/><rect x="52" y="34" width="96" height="140" rx="48"/></g>
  <ellipse cx="66" cy="138" rx="8" ry="5" fill="${C.cheek}"/><ellipse cx="134" cy="138" rx="8" ry="5" fill="${C.cheek}"/>
  ${face.eyes}
  ${face.mouth}
  ${arms.map((d) => arm(d, C.ink, 22)).join('\n  ')}
  ${arms.map((d) => arm(d, C.top, 12)).join('\n  ')}
  ${props}
</svg>`;
}

const POSES = {
  ...(process.argv.includes('--legacy') ? { 'mascot.png': svgOf(ARMS.wave, FACES.smile, PROPS.none) } : {}),   // mascot.png เดิม (โบกมือ) เก็บไว้ ไม่เขียนทับ เว้นแต่ --legacy
  'mascot-bell.png': svgOf(ARMS.reminder, FACES.smile, PROPS.bell),
  'mascot-cheer.png': svgOf(ARMS.celebrate, FACES.cheer, PROPS.cheer),
  'mascot-hello.png': svgOf(ARMS.happy, FACES.smile, PROPS.none),
};

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'line');
mkdirSync(dir, { recursive: true });
for (const [name, svg] of Object.entries(POSES)) {
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(resolve(dir, name), png);
  console.log('เขียน', resolve(dir, name), png.length, 'bytes');
}
