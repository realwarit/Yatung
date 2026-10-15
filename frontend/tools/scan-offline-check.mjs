// ตรวจ production build + service worker: เปิดแอปออนไลน์ครั้งเดียว (SW แคชทุก chunk รวม chunk ของ /scan) แล้วตัดเน็ต
// เปิด /scan ตรงจาก URL ต้องขึ้นและ Ionic ทำงาน — ต้อง `ng build` ก่อน (dist/frontend/browser) ; ข้อมูล API จำลอง
//   node tools/scan-offline-check.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { FAKE_JWT, mockApi } from './lib/mock-app.mjs';

const ROOT = path.resolve('dist/frontend/browser');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, 'index.html');   // SPA fallback
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(4310, r));
const BASE = 'http://localhost:4310';
let fail = 0;
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', name, extra); };

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
const ctx = await browser.newContext({ viewport: { width: 375, height: 700 }, locale: 'th-TH', serviceWorkers: 'allow' });
await ctx.addInitScript(([t]) => { try { localStorage.setItem('yatung_token', t); localStorage.setItem('yatung_font_hint_off', '1'); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); } catch {} }, [FAKE_JWT]);
const page = await ctx.newPage();
await mockApi(page, {});
await page.goto(BASE + '/today');
await page.waitForLoadState('networkidle');
// registerWhenStable:30000 → SW ลงทะเบียนหลังนิ่ง/ไม่เกิน 30 วินาที แล้วรอให้ prefetch ครบ
await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', null, { timeout: 60000 });
await page.waitForTimeout(8000);
const cached = await page.evaluate(async () => { let n = 0; for (const k of await caches.keys()) n += (await (await caches.open(k)).keys()).filter((r) => /\.js$/.test(r.url)).length; return n; });
check('SW แคชไฟล์ .js แล้ว', cached > 10, `(${cached} ไฟล์)`);
const scanCached = await page.evaluate(async () => { for (const k of await caches.keys()) { const c = await caches.open(k); for (const r of await c.keys()) if (/chunk-.*\.js$/.test(r.url)) { const t = await (await c.match(r)).text(); if (t.includes('pwa-camera-modal') || t.includes('ion-segment-button')) return true; } } return false; });
check('chunk ที่มีโค้ด Ionic (หน้า Scan) อยู่ในแคชของ SW', scanCached);

await ctx.setOffline(true);
await page.goto(BASE + '/scan');
await page.waitForSelector('app-scan-stage', { timeout: 15000 }).then(() => check('ออฟไลน์: เปิด /scan ตรงจาก URL ได้', true), () => check('ออฟไลน์: เปิด /scan ตรงจาก URL ได้', false));
const st = await page.evaluate(() => ({ ce: document.documentElement.classList.contains('ion-ce'), btn: !!customElements.get('ion-button'), seg: document.querySelectorAll('ion-segment-button').length }));
check('ออฟไลน์: Ionic ทำงาน (ion-ce, ion-button, segment)', st.ce && st.btn && st.seg === 2, JSON.stringify(st));
await page.locator('ion-segment-button', { hasText: 'พิมพ์เอง' }).click();
check('ออฟไลน์: สลับโหมดพิมพ์เอง → ion-textarea', (await page.locator('ion-textarea textarea').count()) === 1);
await browser.close(); server.close();
console.log(fail ? `\nไม่ผ่าน ${fail}` : '\nผ่านทั้งหมด');
process.exit(fail ? 1 : 0);
