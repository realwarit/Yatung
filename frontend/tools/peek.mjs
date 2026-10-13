// ถ่ายภาพหน้าเดียวด้วยข้อมูลจำลอง (ไว้ดูตอนพัฒนา) — ต้องมี ng serve (4200) ; ไม่ต้อง login/docker
//   node tools/peek.mjs /today [--w=375] [--h=667] [--scale=100|112|125] [--today=late|before|done|soon] [--offline] [--full] [--out=path.png] [--click=ข้อความปุ่ม] [--scroll=px]
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { FAKE_JWT, fakeThaiVoice, mockApi } from './lib/mock-app.mjs';

const args = process.argv.slice(2);
const route = args.find((a) => a.startsWith('/')) ?? '/today';
const val = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=').slice(1).join('=');
const w = Number(val('w', 375)), h = Number(val('h', 667)), scale = val('scale', '100');
const out = path.resolve(val('out', `../docs/screenshots/day8d/peek-${route.replace(/\W+/g, '-').replace(/^-|-$/g, '')}-${w}x${h}-${scale}.png`));
const mobile = w < 768;
fs.mkdirSync(path.dirname(out), { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
const authed = !['/login', '/register'].includes(route);
await ctx.addInitScript(([sc, tok, auth]) => {
  try {
    localStorage.setItem('yatung_font_scale_v2', sc); localStorage.setItem('yatung_font_hint_off', '1');
    if (auth) { localStorage.setItem('yatung_token', tok); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); }
  } catch {}
}, [scale, FAKE_JWT, authed]);
await fakeThaiVoice(ctx);
const page = await ctx.newPage();
const taken = [];
await mockApi(page, { today: () => val('today', 'late'), onTake: (id) => taken.push(['take', id]), onTakeMany: (ids) => taken.push(['many', ids]) });
page.on('console', (m) => { if (m.type() === 'error') console.log('console.error:', m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 300)));
await page.goto('http://localhost:4200' + route);
await page.waitForLoadState('networkidle').catch(() => {});
await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
await page.waitForTimeout(700);
if (args.includes('--offline')) { await ctx.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline'))); await page.waitForTimeout(500); }
const click = val('click', '');
if (click) { await page.getByText(click, { exact: false }).first().click(); await page.waitForTimeout(600); }
const sc = Number(val('scroll', 0));
await page.evaluate((y) => { document.querySelectorAll('*').forEach((e) => { if (e.scrollTop) e.scrollTop = 0; }); if (y) document.querySelector('.main, app-auth-shell')?.scrollTo(0, y); }, sc);
if (sc) await page.waitForTimeout(300);
await page.screenshot({ path: out, fullPage: args.includes('--full') });
if (taken.length) console.log('คำขอที่ส่ง:', JSON.stringify(taken));
console.log('url:', page.url());
console.log('→', out);
await browser.close();
