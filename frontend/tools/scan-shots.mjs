// ถ่ายภาพทุก state ของหน้า Scan จาก /dev/scan-states: node tools/scan-shots.mjs [--sizes=390x844,1440x900] [--scale=125]
// ต้องมี ng serve (4200) ; ไม่ต้อง login (route dev ไม่มี authGuard) ; ใช้ Edge/Chrome ในเครื่อง → docs/screenshots/scan/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const args = process.argv.slice(2);
const sizeArg = args.find((a) => a.startsWith('--sizes='));
const sizes = (sizeArg ? sizeArg.slice(8) : '390x844,1440x900').split(',').map((s) => s.split('x').map(Number));
const scale = (args.find((a) => a.startsWith('--scale=')) ?? '--scale=100').slice(8);
const OUT = new URL('../../docs/screenshots/scan/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 3200 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
  await ctx.addInitScript((s) => { try { localStorage.setItem('yatung_font_scale', s); } catch {} }, scale);
  const page = await ctx.newPage();
  await page.goto(BASE + '/dev/scan-states');
  await page.waitForSelector('section[data-state]');
  await page.waitForTimeout(2500);   // ให้กรอบคำพูดพิมพ์จบ
  const titles = await page.$$eval('section[data-state]', (els) => els.map((e) => e.getAttribute('data-state')));
  for (const [i, t] of titles.entries()) {
    const sec = page.locator('section[data-state]').nth(i);
    await sec.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const n = String(i + 1).padStart(2, '0');
    await sec.screenshot({ path: `${OUT}state-${n}-${w}x${h}${scale === '100' ? '' : '-s' + scale}.png` });
    const bad = await sec.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return [...el.querySelectorAll('*')].filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && (b.right > innerWidth + 1) && !e.closest('.tips');
      }).length + (document.documentElement.scrollWidth > innerWidth + 1 ? 1000 : 0);
    });
    console.log(w + 'x' + h, t, bad ? 'OVERFLOW-X ' + bad : 'ok');
  }
  await ctx.close();
}
await browser.close();
