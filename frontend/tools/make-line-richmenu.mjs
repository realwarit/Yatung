// สร้างรูป rich menu ของ LINE (2500×843, 3 ช่องเท่ากัน) → docs/line-richmenu/richmenu.png (≤ 1 MB)
//   ซ้าย "ยาวันนี้" (ไอคอน today) · กลาง "เปิดแอป" (น้องยาตรงท่าปกติ) · ขวา "วิธีใช้" (ไอคอน info)
// ใช้: node tools/make-line-richmenu.mjs
// - สีจาก styles/_tokens.scss ; ไอคอนเป็น SVG path ชุดเดียวกับเว็บ (ดึงจาก src/app/shared/icon.component.ts) ; ห้ามใช้อิโมจิในรูป
// - ตัวหนังสือเรนเดอร์ด้วยเบราว์เซอร์ (Edge/Chrome ผ่าน Playwright) โดยฝังฟอนต์ Mitr 600 จาก @fontsource เป็น @font-face
//   → จัดวางสระ/วรรณยุกต์ไทยถูกต้อง ; สคริปต์ตรวจว่า Mitr โหลดจริง (document.fonts) ก่อนถ่ายภาพ ถ้าไม่โหลดจะหยุดทันที (ไม่ใช้ฟอนต์สำรอง)
import { chromium } from 'playwright';
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, '..', 'docs', 'line-richmenu');
const OUT = resolve(outDir, 'richmenu.png');
const W = 2500, H = 843;

const C = { primary: '#0f766e', deep: '#134e4a', mint: '#e8f7f3', soft: '#cdeee6', white: '#ffffff', border: '#d3e2df' };

// ดึง path ของไอคอนจากเว็บ (ชุดเดียวกับแถบเมนู)
const iconSrc = readFileSync(resolve(root, 'src/app/shared/icon.component.ts'), 'utf8');
const iconPath = (name) => {
  const m = new RegExp(`^\\s*${name}:\\s*'(.*)',?\\s*$`, 'm').exec(iconSrc);
  if (!m) throw new Error('ไม่พบไอคอน ' + name);
  return m[1];
};
const icon = (name, size) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${C.primary}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${iconPath(name)}</svg>`;

const font600 = readFileSync(resolve(root, 'node_modules/@fontsource/mitr/files/mitr-thai-600-normal.woff2')).toString('base64');
const mascot = readFileSync(resolve(root, 'public/line/mascot-hello.png')).toString('base64');

const cell = (bg, art, label) => `
  <div class="cell" style="background:${bg}">
    <div class="art">${art}</div>
    <div class="label">${label}</div>
  </div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Mitr'; font-weight: 600; src: url(data:font/woff2;base64,${font600}) format('woff2'); }
* { box-sizing: border-box; margin: 0; }
html, body { width: ${W}px; height: ${H}px; background: ${C.white}; overflow: hidden; }
.row { display: flex; width: ${W}px; height: ${H}px; gap: 0; }
.slot { flex: 1; padding: 22px; }
.cell { width: 100%; height: 100%; border-radius: 56px; border: 6px solid ${C.border}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px; }
.art { height: 330px; display: flex; align-items: center; justify-content: center; }
.art img { height: 330px; }
.label { font-family: 'Mitr'; font-weight: 600; font-size: 168px; line-height: 1.25; color: ${C.deep}; }
</style></head><body><div class="row">
  <div class="slot">${cell(C.mint, icon('today', 300), 'ยาวันนี้')}</div>
  <div class="slot">${cell(C.soft, `<img src="data:image/png;base64,${mascot}" alt="">`, 'เปิดแอป')}</div>
  <div class="slot">${cell(C.mint, icon('info', 300), 'วิธีใช้')}</div>
</div></body></html>`;

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const check = await page.evaluate(() => ({
    loaded: [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'Mitr' && f.status === 'loaded').length,
    usable: document.fonts.check('600 168px Mitr', 'ยาวันนี้เปิดแอปวิธีใช้'),
    family: getComputedStyle(document.querySelector('.label')).fontFamily
  }));
  if (!check.loaded || !check.usable) throw new Error('ฟอนต์ Mitr ไม่ได้โหลด (' + JSON.stringify(check) + ') — หยุด ไม่ใช้ฟอนต์สำรอง');
  console.log('ฟอนต์ Mitr โหลดแล้ว:', JSON.stringify(check));
  const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
  const png = await sharp(shot).png({ compressionLevel: 9, palette: false }).toBuffer();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(OUT, png);
  const meta = await sharp(png).metadata();
  console.log(`เขียน ${OUT} ${meta.width}×${meta.height} ${statSync(OUT).size} bytes`);
  if (meta.width !== W || meta.height !== H) throw new Error('ขนาดรูปไม่ใช่ ' + W + '×' + H);
  if (statSync(OUT).size > 1_000_000) throw new Error('รูปเกิน 1 MB');
} finally {
  await browser.close();
}
