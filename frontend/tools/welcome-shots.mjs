// ถ่ายภาพหน้า /welcome (วันที่ 9W) — ต้องมี ng serve (4200) ; ไม่ต้อง login/docker
//   node tools/welcome-shots.mjs [--out=../docs/screenshots/day9w] [--scale=100|112|125]
// ภาพ: ท่าสุดท้าย (หลังฉากเปิด) 384×832 / 320×640 (+ -full = เลื่อนทั้งหน้า) / 1280×800 · reduced-motion · เฟรมของฉากเปิดที่ 0.5 / 1.5 / 3 วินาที
//   เฟรมฉากเปิดหยุด animation ทั้งหมดแล้วตั้ง currentTime ตรงตามเวลา (ไม่พึ่งความเร็วเครื่อง)
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { mockApi } from './lib/mock-app.mjs';

const args = process.argv.slice(2);
const val = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=').slice(1).join('=');
const out = path.resolve(val('out', '../docs/screenshots/day9w'));
const scale = val('scale', '100');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));

async function open(w, h, { reduced = false } = {}) {
  const mobile = w < 768;
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: 2,
    isMobile: mobile, hasTouch: mobile, reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  await ctx.addInitScript((sc) => { try { localStorage.setItem('yatung_font_scale_v2', sc); localStorage.setItem('yatung_font_hint_off', '1'); } catch {} }, scale);
  const page = await ctx.newPage();
  await mockApi(page, {});
  page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 300)));
  await page.goto('http://localhost:4200/welcome');
  await page.waitForSelector('.go');
  return { ctx, page };
}

async function seek(page, ms) {
  await page.evaluate((t) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; } }, ms);
  await page.waitForTimeout(150);
}

for (const [w, h] of [[384, 832], [320, 640], [1280, 800]]) {
  const { ctx, page } = await open(w, h);
  await page.waitForTimeout(7000);   // ฉากเปิดจบ (~2.8s) + ให้เห็นท่าวนต่อเนื่องบางส่วน
  await seek(page, 4200);            // ท่านิ่ง "หลังฉากเปิด" ที่แน่นอน (ก่อนกระโดดดึ๋งรอบแรกที่ 3.2s+ ผ่านแล้ว)
  await page.screenshot({ path: `${out}/final-${w}x${h}.png` });
  await page.screenshot({ path: `${out}/final-${w}x${h}-full.png`, fullPage: true });
  if (w === 384) {
    for (const t of [500, 1500, 3000]) {
      await seek(page, t);
      await page.screenshot({ path: `${out}/frame-${t}ms-${w}x${h}.png` });
    }
  }
  await ctx.close();
}
{
  const { ctx, page } = await open(384, 832, { reduced: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/reduced-384x832.png` });
  await ctx.close();
}
await browser.close();
console.log('saved →', out);
