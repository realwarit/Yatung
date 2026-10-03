// สร้างไอคอนแอปจากหน้าน้องยาตรง (แคปซูลหน้าเดียว ไม่มีแขนขา บนพื้น primary)
// ใช้: node tools/make-icons.mjs   → public/favicon.svg, favicon.ico, public/icons/*.png, resources/*.png (1024px สำหรับ @capacitor/assets)
// สี/รูปทรงคัดลอกจาก shared/components/mascot + styles/_tokens.scss (--yt-mascot-*) — แก้ที่นั่นแล้วต้องแก้ที่นี่ด้วย
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';

const C = { bg: '#0f766e', top: '#14b8a6', bottom: '#fffbf2', ink: '#134e4a', cheek: '#fda4af', white: '#ffffff' };

// แคปซูลกลางที่ (100,104) กว้าง 96 สูง 140 — พิกัดเดียวกับคอมโพเนนต์
const capsule = `
  <path d="M52 96V82a48 48 0 0 1 96 0v14z" fill="${C.top}"/>
  <path d="M52 96v30a48 48 0 0 0 96 0V96z" fill="${C.bottom}"/>
  <path d="M70 80Q70 60 86 52" fill="none" stroke="${C.bottom}" stroke-width="6" stroke-linecap="round" opacity=".6"/>
  <g fill="none" stroke="${C.ink}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M52 96h96"/><rect x="52" y="34" width="96" height="140" rx="48"/>
    <path d="M91 138Q100 148 109 138"/>
  </g>
  <ellipse cx="66" cy="139" rx="8" ry="5" fill="${C.cheek}"/><ellipse cx="134" cy="139" rx="8" ry="5" fill="${C.cheek}"/>
  <circle cx="82" cy="122" r="9.5" fill="${C.ink}"/><circle cx="85" cy="119" r="3.2" fill="${C.white}"/>
  <circle cx="118" cy="122" r="9.5" fill="${C.ink}"/><circle cx="121" cy="119" r="3.2" fill="${C.white}"/>`;

/** @param scale ขนาดแคปซูลต่อ 1 หน่วยพิกัดมาสคอต · bg=null → โปร่งใส */
function svg(size, scale, { bg = C.bg, radius = 0 } = {}) {
  const t = `translate(${size / 2 - 100 * scale} ${size / 2 - 104 * scale}) scale(${scale})`;
  const back = bg ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${back}<g transform="${t}">${capsule}</g></svg>`;
}

// 1024px: any = เต็มพื้น, maskable = เล็กลงให้อยู่ใน safe zone (วงกลมรัศมี 40%) — แคปซูลสูง 140u × 5.2 = 728px
const ANY = 6.4 * 1;
const MASK = 5.2;
const out = (p, buf) => writeFileSync(p, buf);
mkdirSync('public/icons', { recursive: true });
mkdirSync('resources', { recursive: true });

const png = (s, size) => sharp(Buffer.from(s)).resize(size, size).png().toBuffer();

const anySvg = svg(1024, ANY), maskSvg = svg(1024, MASK);
out('resources/icon-only.png', await png(anySvg, 1024));
out('resources/icon-foreground.png', await png(svg(1024, MASK, { bg: null }), 1024));
out('resources/icon-background.png', await sharp({ create: { width: 1024, height: 1024, channels: 3, background: C.bg } }).png().toBuffer());

for (const s of [72, 96, 128, 144, 152, 192, 384, 512]) out(`public/icons/icon-${s}x${s}.png`, await png(anySvg, s));
for (const s of [192, 512]) out(`public/icons/icon-maskable-${s}x${s}.png`, await png(maskSvg, s));
out('public/icons/apple-touch-icon.png', await png(anySvg, 180));

// favicon.svg: มุมมน, แคปซูลใหญ่ขึ้นให้ชัดที่ 16–32px
out('public/favicon.svg', svg(64, 0.4, { radius: 14 }));
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map(s => png(svg(64, 0.4, { radius: 14 }), s)));
const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const dir = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e[0] = s; e[1] = s; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += pngs[i].length; return e;
});
out('public/favicon.ico', Buffer.concat([head, ...dir, ...pngs]));
console.log('icons ok');
