// ตรวจ "ล้นแนวนอน" ทุกหน้าหลักด้วย API จำลอง (ไม่ต้อง login จริง/ไม่ต้องมี docker) — ต้องมี ng serve (4200)
//   node tools/overflow-check.mjs [--widths=320,360,375,412] [--scales=100,112,125] [--routes=/today,/overview,…] [--probe]
// ผ่าน = scrollWidth <= clientWidth ทั้งของ <html>, <body> และตัวเลื่อนทุกตัวในหน้า (หน้าไม่เลื่อนไปทางซ้าย/ขวา)
// ไม่ผ่านจะแสดง selector ของ element ที่ right > clientWidth พร้อมความกว้าง ; --probe ปิด overflow-x:clip ชั่วคราวเพื่อหาต้นเหตุจริง
// ตั้งแต่ 8B: ทุกงาน UI ต้องวัดที่ 360px ด้วย (ไม่ใช่แค่ 375px) — ดู CLAUDE.md
import { chromium } from 'playwright';
import { FAKE_JWT, mockApi } from './lib/mock-app.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const args = process.argv.slice(2);
const val = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const widths = val('widths', '320,360,375,412').split(',').map(Number);
const scales = val('scales', '100,112,125').split(',');
const routes = val('routes', '/today,/overview,/medications,/settings,/scan').split(',');
const probe = args.includes('--probe');

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
let bad = 0, total = 0;
for (const scale of scales) {
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([s, tok]) => {
      try { localStorage.setItem('yatung_font_scale', s); localStorage.setItem('yatung_token', tok); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); } catch {}
    }, [scale, FAKE_JWT]);
    const page = await ctx.newPage();
    await mockApi(page);
    for (const r of routes) {
      await page.goto(BASE + r);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
      if (probe) await page.addStyleTag({ content: '*{overflow-x:visible!important}html,body{overflow-x:visible!important}' });
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const cw = document.documentElement.clientWidth;
        const sel = (el) => {
          let s = el.tagName.toLowerCase();
          if (el.id) s += '#' + el.id;
          const c = [...el.classList].slice(0, 3).join('.');
          if (c) s += '.' + c;
          const p = el.parentElement;
          return (p && p !== document.body ? p.tagName.toLowerCase() + (p.classList[0] ? '.' + p.classList[0] : '') + ' > ' : '') + s;
        };
        // ตัวเลื่อนที่ทำให้ "หน้า" เลื่อนซ้าย/ขวา: html, body และคอนเทนเนอร์หลักของ shell (ไม่นับแถบเลื่อนแนวนอนที่ตั้งใจทำ เช่น เคล็ดลับถ่ายรูป)
        const scrollers = [document.documentElement, document.body, ...document.querySelectorAll('.main, .yt-page')]
          .filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => `${sel(e)} scrollWidth ${e.scrollWidth} > clientWidth ${e.clientWidth}`);
        const main = document.querySelector('.main');
        if (main && main.scrollWidth > main.clientWidth + 1 && !scrollers.some((x) => x.includes('.main'))) scrollers.push(`.main scrollWidth ${main.scrollWidth} > clientWidth ${main.clientWidth}`);
        const over = [...document.querySelectorAll('body *')].filter((e) => {
          const b = e.getBoundingClientRect();
          return b.width > 0 && (b.right > cw + 0.5 || b.left < -0.5) && getComputedStyle(e).position !== 'fixed';
        }).slice(0, 12).map((e) => `${sel(e)}  right=${Math.round(e.getBoundingClientRect().right)} width=${Math.round(e.getBoundingClientRect().width)} (หน้ากว้าง ${cw})`);
        const pg = document.querySelector('.yt-page');
        return { scrollers, over, pageH: pg ? Math.round(pg.getBoundingClientRect().height) : 0 };
      });
      total++;
      const fail = m.scrollers.length > 0 || (probe && m.over.length > 0);
      if (fail) bad++;
      console.log(`${fail ? '✘' : '✓'} ${r} @${w}px ก${scale === '100' ? '' : scale === '112' ? '+' : '++'}${r === '/overview' ? ' [สูง ' + m.pageH + 'px]' : ''}${fail ? '\n    ' + [...m.scrollers, ...m.over].join('\n    ') : ''}`);
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`\n${total - bad}/${total} ผ่าน`);
process.exit(bad ? 1 : 0);
