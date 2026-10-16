// สร้างภาพ splash ของแอป Android จากหน้าน้องยาตรง (ชุดเดียวกับ make-icons.mjs)
//   node tools/make-splash.mjs            → resources/splash-icon.png (1152px = 288dp × 4, พื้นโปร่งใส) = windowSplashScreenAnimatedIcon → android/.../drawable-nodpi/splash_icon.png
//                                           + resources/splash-fallback.png (1080px พื้นมิ้นต์) → android/.../drawable/splash.png (ใช้เฉพาะทางสำรองของปลั๊กอิน SplashScreen ซึ่งปกติไม่ถูกใช้)
//   node tools/make-splash.mjs --preview  → ภาพตัวอย่างที่ docs/screenshots/day9/e-icon-preview.png (ไม่แตะ resources/ ไม่แตะ android/ ไม่ commit)
// Android 12+ ครอบไอคอน splash เป็นวงกลมกลาง 2/3 ของกรอบ (192dp จาก 288dp) → ตัวน้องทั้งตัวต้องอยู่ในวงกลมนั้นและเหลือขอบ
// สี/รูปทรงคัดลอกจาก make-icons.mjs → mascot.component — แก้ที่นั่นแล้วต้องแก้ที่นี่ด้วย
import sharp from 'sharp';
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';

const C = { bg: '#e8f7f3', top: '#14b8a6', bottom: '#fffbf2', ink: '#134e4a', cheek: '#fda4af', white: '#ffffff', icon: '#0f766e' };
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

// เดิม 0.0042 (สูง ≈ 59% ของกรอบ) → ย่อลง 15% = 0.00357 (สูง ≈ 50% ของกรอบ = 75% ของวงกลมที่มองเห็น)
const SPLASH_SCALE = 0.0042 * 0.85;
const place = (size, scale) => `translate(${size / 2 - 100 * scale} ${size / 2 - 104 * scale}) scale(${scale})`;
const splashSvg = (size, { bg = null, ring = false } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  ${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ''}
  <g transform="${place(size, size * SPLASH_SCALE)}">${capsule}</g>
  ${ring ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 3}" fill="none" stroke="#dc2626" stroke-width="${size * 0.004}" stroke-dasharray="${size * 0.02} ${size * 0.015}"/>` : ''}</svg>`;

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

if (process.argv.includes('--preview')) {
  const dir = '../docs/screenshots/day9';
  mkdirSync(dir, { recursive: true });
  const S = 432;   // 108dp × 4
  const bgLayer = await sharp({ create: { width: S, height: S, channels: 3, background: C.icon } }).png().toBuffer();
  const fg = await sharp(readFileSync('resources/icon-foreground.png')).resize(S, S).png().toBuffer();
  const layer = await sharp(bgLayer).composite([{ input: fg }]).png().toBuffer();   // adaptive icon เต็ม 108dp
  // ส่วนที่มองเห็นจริง = 72dp กลาง (66.7% ของ 108dp)
  const squirclePath = (s, n = 5) => {   // superellipse |x|^n + |y|^n = r^n (แบบ One UI)
    const r = s / 3, pts = [];
    for (let i = 0; i < 360; i += 2) {
      const t = (i * Math.PI) / 180, c = Math.cos(t), sn = Math.sin(t);
      pts.push(`${(s / 2 + Math.sign(c) * Math.abs(c) ** (2 / n) * r).toFixed(1)},${(s / 2 + Math.sign(sn) * Math.abs(sn) ** (2 / n) * r).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(' ')}"/>`;
  };
  const shapes = {
    circle: (s) => `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 3}"/>`,
    roundsq: (s) => `<rect x="${s / 6}" y="${s / 6}" width="${(s * 2) / 3}" height="${(s * 2) / 3}" rx="${s * 0.1}"/>`,
    squircle: squirclePath,
  };
  const masked = async (shape, size) => {
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><g fill="white">${shape(S)}</g></svg>`);
    const full = await sharp(layer).composite([{ input: await sharp(mask).png().toBuffer(), blend: 'dest-in' }]).png().toBuffer();
    const vis = Math.round((S * 2) / 3), off = Math.round(S / 6);   // ตัดเหลือส่วนที่มองเห็น 72dp
    return sharp(full).extract({ left: off, top: off, width: vis, height: vis }).resize(size, size).png().toBuffer();
  };
  const tile = (bg, w, h) => sharp({ create: { width: w, height: h, channels: 3, background: bg } }).png().toBuffer();
  const light = '#eef0f1', dark = '#1d2326';
  // ช่องหน้าโฮม: 144px (48dp ที่ 3x) ด้านบน + 48px จริงด้านล่าง
  const home = async (bg, shape) => sharp(await tile(bg, 200, 220)).composite([{ input: await masked(shape, 144), left: 28, top: 10 }, { input: await masked(shape, 48), left: 76, top: 164 }]).png().toBuffer();

  const pad = 24, cw = 288;
  const items = [];
  let x = pad;
  for (const sh of [shapes.circle, shapes.roundsq, shapes.squircle]) { items.push({ input: await masked(sh, cw), left: x, top: pad }); x += cw + pad; }
  items.push({ input: await png(splashSvg(1152, { bg: C.bg, ring: true }), cw), left: x, top: pad });   // splash + วงกลม 2/3 (เส้นประแดง)
  x += cw + pad;
  const W = x;
  let hx = pad;
  for (const [bg, sh] of [[light, shapes.circle], [light, shapes.squircle], [dark, shapes.circle], [dark, shapes.squircle]]) {
    items.push({ input: await home(bg, sh), left: hx, top: pad * 2 + cw }); hx += 200 + pad;
  }
  const H = pad * 3 + cw + 220;
  const base = await sharp({ create: { width: W, height: H, channels: 3, background: '#cfd6d4' } }).png().toBuffer();
  await sharp(base).composite(items).toFile(`${dir}/e-icon-preview.png`);
  console.log('preview →', `${dir}/e-icon-preview.png`, `${W}x${H}`);
} else {
  writeFileSync('resources/splash-icon.png', await png(splashSvg(1152), 1152));
  writeFileSync('resources/splash-fallback.png', await png(splashSvg(1080, { bg: C.bg }), 1080));
  const res = 'android/app/src/main/res';
  if (existsSync(res)) {
    mkdirSync(`${res}/drawable-nodpi`, { recursive: true });
    copyFileSync('resources/splash-icon.png', `${res}/drawable-nodpi/splash_icon.png`);
    copyFileSync('resources/splash-fallback.png', `${res}/drawable/splash.png`);
  }
  console.log('splash ok → resources/splash-icon.png, splash-fallback.png (+ คัดลอกเข้า android/res)');
}
