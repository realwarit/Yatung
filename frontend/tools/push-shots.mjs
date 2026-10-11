// ตรวจส่วน "แจ้งเตือนบนเครื่องนี้" ครบ 5 สถานะ (+ ระบบยังไม่ตั้ง VAPID / error) ด้วย PushService จำลองที่ /dev/push-states (เฉพาะ ng serve)
//   node tools/push-shots.mjs [--scale=125] [--sizes=390x844,768x1024,1440x900]   → docs/screenshots/push/<WxH>[-s125]-<state>.png
// วัด: ล้นแนวนอน, ปุ่มสูง ≥ 56px (เทียบ rem), ข้อความ ≥ 18px, ขอบเขตของแต่ละการ์ดไม่ล้นจอ ; ต้องมี ng serve (4200) ; ใช้ Edge/Chrome ในเครื่อง
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const args = process.argv.slice(2);
const val = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const scale = val('scale', '100');
const sizes = val('sizes', '390x844').split(',').map((s) => s.split('x').map(Number));
const OUT = new URL('../../docs/screenshots/push/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const FAKE_JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 1, email: 'x@example.test', exp: 4102444800 })}.sig`;

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
let bad = 0;
for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: 2 });
  await ctx.addInitScript(([s, tok]) => {
    try { localStorage.setItem('yatung_font_scale', s); localStorage.setItem('yatung_token', tok); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); } catch {}
  }, [scale, FAKE_JWT]);
  const page = await ctx.newPage();
  const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/**', (route) => {
    const u = new URL(route.request().url()).pathname;
    if (u === '/api/line/status') return route.fulfill(json({ linked: true, display_name: 'ทดสอบ' }));
    if (u === '/api/me') return route.fulfill(json({ id: 1, notify_both: false, push_subscribed: true }));
    return route.fulfill(json({ error: 'NOT_MOCKED', details: u }, 404));
  });
  await page.goto(BASE + '/dev/push-states');
  await page.waitForSelector('section.card');
  await page.waitForTimeout(800);
  const cards = await page.$$('section.card');
  for (const card of cards) {
    const state = await card.getAttribute('data-state');
    const title = (await (await card.$('.cap')).innerText()).split('.')[0].trim().replace(/\s/g, '');
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: `${OUT}${w}x${h}${scale === '100' ? '' : '-s' + scale}-${title}-${state}.png` });
  }
  const m = await page.evaluate(() => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const root = document.querySelector('app-push-states-page');
    const sc = root || document.documentElement;
    const buttons = [...document.querySelectorAll('section.card button')].filter((e) => e.offsetParent).map((e) => Math.round(e.getBoundingClientRect().height));
    const over = [...document.querySelectorAll('section.card')].filter((c) => c.scrollWidth > c.clientWidth + 1).length;
    const tiny = [...document.querySelectorAll('section.card p, section.card li, section.card span')].filter((e) => e.offsetParent && e.children.length === 0 && parseFloat(getComputedStyle(e).fontSize) < 17.5).length;
    return { rem, minButton: Math.min(...buttons), buttons: buttons.length, overflowX: sc.scrollWidth > sc.clientWidth + 1, cardsOverflow: over, smallText: tiny };
  });
  const ok = !m.overflowX && m.cardsOverflow === 0 && m.minButton >= 56 && m.smallText === 0;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${w}x${h} scale=${scale}% rem=${m.rem}px ปุ่ม ${m.buttons} ปุ่ม สูงสุด/ต่ำสุด min=${m.minButton}px ล้นแนวนอน=${m.overflowX} การ์ดล้น=${m.cardsOverflow} ตัวหนังสือเล็กกว่า 17.5px=${m.smallText}`);
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
