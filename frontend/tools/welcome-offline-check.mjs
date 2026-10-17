// ตรวจ production build + service worker ของหน้า /welcome (วันที่ 9W) — ต้อง `ng build` ก่อน (dist/frontend/browser, ไม่ใช่ build:native) ; ข้อมูล API จำลอง
//   node tools/welcome-offline-check.mjs
// ครอบคลุม: ผู้ใช้ที่ล็อกอินแล้วเปิด `/` ไม่โหลด chunk ของ welcome เลย · ยังไม่ล็อกอิน: `/` → /welcome · SW แคช chunk แล้วตัดเน็ต → `/` และ `/welcome` ยังขึ้น · deep link `/today` → /login
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { FAKE_JWT, mockApi } from './lib/mock-app.mjs';

const ROOT = path.resolve('dist/frontend/browser');
if (!fs.existsSync(path.join(ROOT, 'ngsw.json'))) { console.log('ไม่พบ ngsw.json — ต้อง `ng build` (เว็บ) ก่อน ไม่ใช่ build:native'); process.exit(2); }
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(4311, r));
const BASE = 'http://localhost:4311';
const MARK = 'ช่วยเตือนเองนะคะ';   // ข้อความเฉพาะของ chunk welcome
let fail = 0;
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', name, extra); };

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));

// 1) ล็อกอินแล้ว: ไม่โหลด chunk welcome
{
  const ctx = await browser.newContext({ viewport: { width: 384, height: 832 }, locale: 'th-TH', serviceWorkers: 'block' });
  await ctx.addInitScript(([t]) => { try { localStorage.setItem('yatung_token', t); localStorage.setItem('yatung_font_hint_off', '1'); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'x' })); } catch {} }, [FAKE_JWT]);
  const page = await ctx.newPage();
  await mockApi(page, {});
  let welcomeChunk = 0;
  page.on('response', async (r) => { if (/\.js$/.test(r.url())) { try { if ((await r.text()).includes(MARK)) welcomeChunk++; } catch {} } });
  await page.goto(BASE + '/');
  await page.waitForSelector('app-shell, .shell, nav', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  check('ล็อกอินแล้ว: `/` → /today', new URL(page.url()).pathname === '/today', page.url());
  check('ล็อกอินแล้ว: ไม่โหลด chunk ของ welcome', welcomeChunk === 0, `(${welcomeChunk})`);
  await page.goto(BASE + '/welcome');
  await page.waitForTimeout(1000);
  check('ล็อกอินแล้ว: /welcome → /today', new URL(page.url()).pathname === '/today');
  await ctx.close();
}

// 2) ยังไม่ล็อกอิน + SW + ออฟไลน์
{
  const ctx = await browser.newContext({ viewport: { width: 384, height: 832 }, locale: 'th-TH', serviceWorkers: 'allow' });
  await ctx.addInitScript(() => { try { localStorage.setItem('yatung_font_hint_off', '1'); } catch {} });
  const page = await ctx.newPage();
  await mockApi(page, {});
  await page.goto(BASE + '/');
  await page.waitForSelector('button.go', { timeout: 15000 });
  check('ยังไม่ล็อกอิน: `/` → /welcome', new URL(page.url()).pathname === '/welcome', page.url());
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', null, { timeout: 60000 });
  await page.waitForTimeout(8000);
  // chunk ที่ผ่านขั้น lazy ทุกไฟล์ต้องอยู่ใน ngsw.json (prefetch) — ตรวจจากรายการที่ build ได้ ไม่ต้องเทียบข้อความในไฟล์
  const ngsw = JSON.parse(fs.readFileSync(path.join(ROOT, 'ngsw.json'), 'utf8'));
  const urls = new Set(ngsw.assetGroups.find((g) => g.name === 'app').urls);
  const js = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js') && !/^(ngsw-worker|safety-worker|worker-basic)/.test(f));
  check('ngsw.json: ทุกไฟล์ .js (รวม chunk ของ welcome) อยู่ในกลุ่ม prefetch', js.every((f) => urls.has('/' + f)), `(${js.length} ไฟล์)`);
  const inCache = await page.evaluate(async () => { let n = 0; for (const k of await caches.keys()) n += (await (await caches.open(k)).keys()).filter((r) => /\.js$/.test(r.url)).length; return n; });
  check('SW แคชไฟล์ .js ครบตามรายการ', inCache >= js.length, `(${inCache}/${js.length})`);

  await ctx.setOffline(true);
  for (const p of ['/welcome', '/']) {
    await page.goto(BASE + p);
    const ok = await page.waitForSelector('button.go', { timeout: 15000 }).then(() => true, () => false);
    check(`ออฟไลน์: เปิด ${p} แล้วเห็นปุ่มเริ่มต้นใช้งาน`, ok && new URL(page.url()).pathname === '/welcome', page.url());
  }
  await page.click('button.go');
  await page.waitForTimeout(1000);
  check('ออฟไลน์: กดปุ่ม → /login', new URL(page.url()).pathname === '/login');
  await page.goto(BASE + '/today');
  await page.waitForTimeout(1500);
  check('ออฟไลน์: deep link /today (ไม่ล็อกอิน) → /login?returnUrl ไม่ผ่าน welcome', page.url().includes('/login') && page.url().includes('returnUrl'), page.url());
  await ctx.close();
}
await browser.close(); server.close();
console.log(fail ? `\nไม่ผ่าน ${fail}` : '\nผ่านทั้งหมด');
process.exit(fail ? 1 : 0);
