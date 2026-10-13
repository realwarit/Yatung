// ตรวจ "ล้นแนวนอน" ของสถานะที่เกิดทีหลังโหลดหน้า (8C) + ถ่ายภาพ ก (100%) ที่ 360px → docs/screenshots/day8/state-<ชื่อ>.png
//   สถานะ: offline-bar · offline-dose-card · conn-expired · install-android · install-ios
//   node tools/state-check.mjs [--widths=320,360,375,412] [--scales=100,112,125] [--only=install-ios,…]   (ต้องมี ng serve 4200 ; ไม่ต้อง login/docker)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { FAKE_JWT, mockApi } from './lib/mock-app.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const args = process.argv.slice(2);
const val = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const widths = val('widths', '320,360,375,412').split(',').map(Number);
const scales = val('scales', '100,112,125').split(',');
const only = val('only', '').split(',').filter(Boolean);
const OUT = new URL('../../docs/screenshots/day8/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const fakePrompt = () => { const e = new Event('beforeinstallprompt'); e.prompt = async () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); };

// ctx = ตัวเลือกของ context ; run(page, {ctx, html}) เตรียมสถานะ ; shot = ถ่ายอะไร (ค่าเริ่มต้นทั้งจอ) ; expect = ข้อความที่ต้องเห็น
const STATES = [
  { name: 'offline-bar', run: async (p, c) => { await c.ctx.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event('offline'))); }, expect: 'ออฟไลน์|ไม่มีอินเทอร์เน็ต|ต่ออินเทอร์เน็ต' },
  { name: 'offline-dose-card', run: async (p, c) => { await c.ctx.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event('offline'))); }, expect: 'ต่ออินเทอร์เน็ตก่อนนะคะ', shot: 'app-dose-card:has(.yt-offline-hint)' },
  { name: 'conn-expired', run: async (p, c) => { c.html.on = true; await p.reload(); }, expect: 'หมดอายุ' },
  { name: 'install-android', run: async (p) => { await p.evaluate(fakePrompt); }, expect: 'ติดตั้ง' },
  { name: 'install-ios', ctxOpts: { userAgent: IOS_UA }, expect: 'หน้าจอโฮม|เพิ่ม' },
];

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
let bad = 0, total = 0;
for (const st of STATES.filter((s) => !only.length || only.includes(s.name))) {
  for (const scale of scales) {
    for (const w of widths) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...(st.ctxOpts ?? {}) });
      await ctx.addInitScript(([s, tok]) => {
        try { localStorage.setItem('yatung_font_scale', s); localStorage.setItem('yatung_token', tok); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); } catch {}
      }, [scale, FAKE_JWT]);
      const page = await ctx.newPage();
      const html = { on: false };
      await mockApi(page, { htmlMode: () => html.on });
      await page.goto(BASE + '/today');
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(600);
      await st.run?.(page, { ctx, html });
      await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
      await page.waitForTimeout(900);
      const m = await page.evaluate((expect) => {
        const bodyText = document.body.innerText;
        const scrollers = [document.documentElement, document.body, ...document.querySelectorAll('.main, .yt-page')]
          .filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')} scrollWidth ${e.scrollWidth} > ${e.clientWidth}`);
        const cw = document.documentElement.clientWidth;
        const over = [...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > cw + 0.5 || b.left < -0.5) && getComputedStyle(e).position !== 'fixed'; })
          .slice(0, 8).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 2).join('.')} right=${Math.round(e.getBoundingClientRect().right)}`);
        const small = [...document.querySelectorAll('button, a[href], [role=button]')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && getComputedStyle(e).visibility !== 'hidden' && b.height < 47.5 && /ติดตั้ง|ปิด|แตะ|กด|รับ|เพิ่ม/.test(e.innerText || '') && e.closest('app-install-card, app-connection-banner, app-offline-bar'); }).map((e) => `${(e.innerText || '').trim().slice(0, 20)} สูง ${Math.round(e.getBoundingClientRect().height)}`);
        return { seen: new RegExp(expect).test(bodyText), scrollers, over, small };
      }, st.expect);
      total++;
      const issues = [...(m.seen ? [] : [`ไม่พบข้อความ /${st.expect}/`]), ...m.scrollers, ...m.over, ...m.small.map((x) => `ปุ่มเตี้ย ${x}`)];
      if (issues.length) bad++;
      console.log(`${issues.length ? '✘' : '✓'} ${st.name} @${w}px ก${scale === '100' ? '' : scale === '112' ? '+' : '++'}${issues.length ? '\n    ' + issues.join('\n    ') : ''}`);
      if (w === 360 && scale === '100') {
        if (!st.shot) await page.evaluate(() => document.querySelectorAll('.main, .yt-page').forEach((e) => { e.scrollTop = 0; })).catch(() => {});   // หน้าวันนี้เลื่อนไปมื้อถัดไปเอง
        const target = st.shot ? page.locator(st.shot).first() : page;
        await target.screenshot({ path: `${OUT}state-${st.name}.png` }).catch((e) => console.log(`  (ถ่ายภาพ ${st.name} ไม่ได้: ${e.message.split('\n')[0]})`));
      }
      await ctx.close();
    }
  }
}
await browser.close();
console.log(`\n${total - bad}/${total} ผ่าน`);
process.exit(bad ? 1 : 0);
