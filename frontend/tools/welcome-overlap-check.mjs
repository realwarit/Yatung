// ตรวจว่าของตกแต่งของ /welcome ไม่ทับปุ่ม ก/ก+/ก++ และไม่ทับข้อความ (ชื่อ "ยาตรง" รายตัวอักษร / คำโปรย) ตลอดเวลาของแอนิเมชัน
// และคำโปรยไม่แตกกลางวลี — ต้องมี ng serve (4200) ; ไม่ต้อง login/docker
//   node tools/welcome-overlap-check.mjs [--scales=100,112,125] [--sizes=246x492,295x640,320x640,384x832,1280x800]  (246/295 = 320/384 ที่ตัวอักษรระบบ 130%)
// ข้อความเทียบตั้งแต่วินาทีที่ 3 (หลังฉากเปิด — ระหว่างฉากเปิดตัวอักษรกำลังหล่น) ; ปุ่มเทียบทุกวินาที ; เมฆลอยหลังข้อความได้ (เป็นพื้นหลัง เหมือนต้นแบบ) ไม่นับ
// วิธี: หยุด animation ทั้งหมดแล้วตั้ง currentTime ทีละ 1 วินาที (0–26 วินาที ครอบรอบนกบิน 20 วินาที) เทียบ getBoundingClientRect ของ
//   ของตกแต่ง (ดวงอาทิตย์ เมฆ นก ประกาย ของลอย) กับปุ่มขนาดตัวอักษร/ตัวอักษรชื่อ/คำโปรย (รอบ ๆ ข้อความ ไม่ใช่กล่อง h1 ทั้งแถว)
import { chromium } from 'playwright';
import { mockApi } from './lib/mock-app.mjs';

const args = process.argv.slice(2);
const val = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=').slice(1).join('=');
const scales = val('scales', '100,112,125').split(',');
const sizes = val('sizes', '246x492,295x640,320x640,384x832,1280x800').split(',').map((s) => s.split('x').map(Number));
const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
let fail = 0;

for (const sc of scales) for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'th-TH', isMobile: w < 768, hasTouch: w < 768 });
  await ctx.addInitScript((v) => { try { localStorage.setItem('yatung_font_scale_v2', v); localStorage.setItem('yatung_font_hint_off', '1'); } catch {} }, sc);
  const page = await ctx.newPage();
  await mockApi(page, {});
  await page.goto('http://localhost:4200/welcome');
  await page.waitForSelector('.go');
  await page.waitForTimeout(500);
  const hits = new Set();
  for (let t = 0; t <= 26000; t += 1000) {
    await page.evaluate((ms) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = ms; } }, t);
    const r = await page.evaluate(() => {
      const box = (e, kt = 0, kb = kt) => { const b = e.getBoundingClientRect(); return [b.left, b.top + b.height * kt, b.right, b.bottom - b.height * kb]; };
      const vis = (e) => { const s = getComputedStyle(e); return s.display !== 'none' && Number(s.opacity) > 0.05; };
      const decor = [...document.querySelectorAll('app-welcome-scene .sunrise svg, app-welcome-scene .cloud svg, app-welcome-scene .bird svg, app-welcome-scene .twinkle svg, app-welcome-scene .fl svg')]
        .filter((e) => vis(e.closest('.cloud, .twinkle, .fl, .sunrise, .bird') ?? e))
        .map((e) => {
        const host = e.closest('.cloud, .twinkle, .fl, .sunrise, .bird');
        const n = host.className.split(' ')[0] + ':' + (e.getAttribute('class') ?? '');
        if (host.classList.contains('sunrise')) {   // ดวงอาทิตย์ = วงกลมแสงเรือง (รัศมี 58 จาก 140) ไม่ใช่กล่อง svg ทั้งก้อน
          const b = e.getBoundingClientRect(); const r = (b.width * 58) / 140; const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
          return { n, b: [cx - r * 0.72, cy - r * 0.72, cx + r * 0.72, cy + r * 0.72] };   // กล่องในของวงกลม (กันมุมว่างทำให้ชนปลอม)
        }
        return { n, b: box(e) };
      });
      const tg = document.querySelector('app-font-size-toggle .group');
      const toggle = tg ? box(tg) : null;
      const texts = [
        ...[...document.querySelectorAll('.ch .face')].map((e) => ({ n: 'ตัวอักษรชื่อ', b: box(e, 0.3, 0.05) })),   // box 0.3 = ที่ว่างเหนือพยัญชนะไทยในกล่องบรรทัด,
        ...[...document.querySelectorAll('.nw')].map((e) => ({ n: 'คำโปรย', b: box(e) })),
        ...[...document.querySelectorAll('.who, .lbl')].map((e) => ({ n: 'ปุ่ม/บรรทัดล่าง', b: box(e) })),
      ];
      return { decor, toggle, texts };
    });
    const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    for (const d of r.decor) {
      if (r.toggle && hit(d.b, r.toggle)) hits.add(`ทับปุ่ม ก/ก+/ก++ : ${d.n}`);
      if (t >= 3000) for (const x of r.texts) if (hit(d.b, x.b) && !d.n.startsWith('cloud')) hits.add(`ทับ${x.n} : ${d.n}`);
    }
  }
  // คำโปรย: แต่ละวลีขึ้นบรรทัดของตัวเอง และ span nowrap ไม่แตกบรรทัด
  const tag = await page.evaluate(() => {
    const ph = [...document.querySelectorAll('.tag .ph')].map((e) => ({ lines: e.getClientRects().length, h: e.getBoundingClientRect().height }));
    const broken = [...document.querySelectorAll('.tag .nw')].filter((e) => e.getClientRects().length !== 1).length;
    const line = parseFloat(getComputedStyle(document.querySelector('.tag')).lineHeight);
    const rows = ph.map((p) => Math.round(p.h / line));
    const over = document.documentElement.scrollWidth > document.documentElement.clientWidth || [...document.querySelectorAll('.tag .nw')].some((e) => e.getBoundingClientRect().right > innerWidth + 0.5 || e.getBoundingClientRect().left < -0.5);
    return { rows, broken, over };
  });
  const tagMsg = `คำโปรย บรรทัดต่อวลี=${tag.rows.join('+')}`;
  const ok = hits.size === 0 && tag.broken === 0 && !tag.over;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✘'} ${w}x${h} ก${sc === '100' ? '' : sc === '112' ? '+' : '++'} · ${tagMsg}${tag.over ? ' · ล้นจอ' : ''}${[...hits].map((x) => '\n    ' + x).join('')}`);
  await ctx.close();
}
await browser.close();
console.log(fail ? `\nไม่ผ่าน ${fail}` : '\nผ่านทั้งหมด');
process.exit(fail ? 1 : 0);
