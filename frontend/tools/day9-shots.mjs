// ภาพจำลองแอป Android (ช่วง D) : build แบบ native ที่ ng serve พอร์ต 4300
//   npx ng serve --build-target=frontend:build:development,native --port 4300
//   node tools/day9-shots.mjs [--w=384] [--h=832] [--top=24] [--bottom=24] [--scale=100|112|125] [--nav=gesture|buttons]
// จำลอง: class is-native (main.ts ใส่เอง) + safe-area บน/ล่างด้วย CDP Emulation.setSafeAreaInsetsOverride + วาดแถบสถานะ/แถบนำทางปลอมทับ
// (เป็นภาพประกอบการตัดสินใจเท่านั้น — พฤติกรรมจริงของ WebView/แถบระบบต้องดูบนเครื่อง S23 FE)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { FAKE_JWT, mockApi } from './lib/mock-app.mjs';

const args = process.argv.slice(2);
const val = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=').slice(1).join('=');
const W = Number(val('w', 384)), H = Number(val('h', 832)), TOP = Number(val('top', 24)), BOT = Number(val('bottom', 24));
const scale = val('scale', '100'), nav = val('nav', 'gesture'), only = val('only', '');
const outDir = path.resolve('../docs/screenshots/day9');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));

async function shot(name, route, { authed = true, action } = {}) {
  if (only && !name.includes(only)) return;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([sc, tok, auth]) => {
    try {
      localStorage.setItem('yatung_font_scale_v2', sc); localStorage.setItem('yatung_font_hint_off', '1');
      if (auth) { localStorage.setItem('yatung_token', tok); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); }
    } catch { /* ไม่เป็นไร */ }
  }, [scale, FAKE_JWT, authed]);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: TOP, bottom: BOT, left: 0, right: 0 } });
  await mockApi(page, { today: () => 'late' });
  page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 200)));
  await page.goto('http://localhost:4300' + route);
  await page.waitForLoadState('networkidle').catch(() => {});
  if (!action) await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
  await page.waitForTimeout(700);
  if (action) { await action(page); await page.waitForTimeout(700); }
  // แถบระบบปลอม (ไม่มีในแอปจริง — Android วาดเอง) : สถานะ = เวลา + ไอคอนขาว , นำทาง = ขีดท่าทาง (gesture) หรือ 3 ปุ่ม
  await page.evaluate(([top, bot, mode]) => {
    const bar = document.createElement('div');
    bar.style.cssText = `position:fixed;left:0;right:0;top:0;height:${top}px;z-index:2147483647;pointer-events:none;display:flex;align-items:center;justify-content:space-between;padding:0 16px;color:#fff;font:600 12px sans-serif`;
    bar.innerHTML = '<span>9:41</span><span style="letter-spacing:2px">▲ ◉ ▮</span>';
    const nb = document.createElement('div');
    nb.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${bot}px;z-index:2147483647;pointer-events:none;display:flex;align-items:center;justify-content:center;color:#222;font:700 14px sans-serif`;
    nb.innerHTML = mode === 'gesture' ? '<span style="width:96px;height:4px;border-radius:2px;background:#222"></span>' : '<span style="display:flex;gap:56px"><span>◁</span><span>○</span><span>□</span></span>';
    document.documentElement.append(bar, nb);
  }, [TOP, BOT, nav]);
  const file = path.join(outDir, `${name}-${W}x${H}-${scale}.png`);
  await page.screenshot({ path: file });
  const info = await page.evaluate(() => ({
    native: document.documentElement.classList.contains('is-native'),
    safeTop: getComputedStyle(document.documentElement).getPropertyValue('--yt-safe-top').trim(),
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
  }));
  console.log(name, JSON.stringify(info), '→', file);
  await ctx.close();
}

await shot('d-1-login', '/login', { authed: false });
await shot('d-2-today', '/today');
await shot('d-3-settings', '/settings');
await shot('d-4-sheet-line', '/settings', { action: async (p) => { await p.getByText('แจ้งเตือนบนเครื่องนี้').first().click(); } });
await browser.close();
