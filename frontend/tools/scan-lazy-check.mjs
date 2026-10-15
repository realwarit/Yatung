// ตรวจว่า Ionic ที่โหลดแบบ lazy (เฉพาะ route /scan) ยังทำงานครบ — ข้อมูลจำลอง ไม่ต้อง login/docker
//   node tools/scan-lazy-check.mjs [--base=http://localhost:4200]
// ครอบคลุม: เข้า /scan ตรงจาก URL · ปุ่ม/segment/textarea ของ Ionic เป็น custom element จริง · เลือกรูป → ส่ง → /review ·
//           พิมพ์เอง → ส่งไม่ถึงเซิร์ฟเวอร์ → ion-toast · เข้าจากหน้าอื่นด้วย router (ไม่ reload) · /dev/scan-states
import { chromium } from 'playwright';
import sharp from 'sharp';
import { FAKE_JWT, json, mockApi } from './lib/mock-app.mjs';

const BASE = (process.argv.find((a) => a.startsWith('--base=')) ?? '--base=http://localhost:4200').slice(7);
let fail = 0;
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', name, extra); };

const img = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#c8d4d0' } }).jpeg().toBuffer();
const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
await ctx.addInitScript(([t]) => { try { localStorage.setItem('yatung_token', t); localStorage.setItem('yatung_font_hint_off', '1'); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); } catch {} }, [FAKE_JWT]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await mockApi(page, {});
let scanMode = 'ok';
await page.route('**/api/scan', (r) => (scanMode === 'ok'
  ? r.fulfill(json({ prescription_id: 1, ocr_text: 'x', result: {}, review_flags: [] }))
  : r.abort('failed')));

// 1) เข้า /scan ตรงจาก URL (โหลดหน้าใหม่) — Ionic ต้องถูกเริ่มจาก route ไม่ใช่ app root
await page.goto(BASE + '/scan');
await page.waitForSelector('app-scan-stage');
await page.waitForTimeout(800);
const state = await page.evaluate(() => ({
  ce: document.documentElement.classList.contains('ion-ce'),
  button: !!customElements.get('ion-button'), segment: !!customElements.get('ion-segment'), toast: !!customElements.get('ion-toast'), textarea: !!customElements.get('ion-textarea'),
  mode: document.querySelector('ion-button')?.getAttribute('class') ?? '',
}));
check('เข้า /scan ตรง: class ion-ce + custom element ของ Ionic ลงทะเบียน', state.ce && state.button && state.segment, JSON.stringify(state));
check('UI กล้องของ pwa-elements ลงทะเบียน (จาก route ไม่ใช่ main)', await page.evaluate(() => !!customElements.get('pwa-camera-modal')));
check('segment ถ่ายรูป/พิมพ์เอง แสดง', (await page.locator('ion-segment-button').count()) === 2);

// 2) เลือกรูป → พรีวิว → ส่ง → /review/1
{
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'อัปโหลดรูปซองยา' }).click()]);
  await fc.setFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: img });
  await page.waitForSelector('app-scan-capture .frame--image img');
  check('เลือกรูป: มีพรีวิว', true);
  await page.locator('.act ion-button').first().click();
  await page.waitForURL('**/review/1', { timeout: 15000 }).then(() => check('ส่งรูป → ไปหน้า Review', true), () => check('ส่งรูป → ไปหน้า Review', false, page.url()));
  check('หน้า Review แสดงผล', (await page.locator('app-review-card, .review, h1').count()) > 0);
}

// 3) กลับมา /scan ด้วย router จากหน้าอื่น (ไม่ reload) → พิมพ์เอง → ส่งล้มเหลว → ion-toast
await page.goto(BASE + '/today');
await page.waitForSelector('app-today-progress, app-empty-state');
await page.getByRole('link', { name: /สแกน/ }).first().click();
await page.waitForURL('**/scan');
await page.waitForSelector('app-scan-stage');
check('เข้า /scan ด้วย router จากหน้าวันนี้', (await page.locator('ion-segment').count()) === 1);
await page.locator('ion-segment-button', { hasText: 'พิมพ์เอง' }).click();
const ta = page.locator('ion-textarea textarea');
await ta.waitFor();
await ta.fill('Metformin 500 mg ครั้งละ 1 เม็ด วันละ 2 ครั้ง หลังอาหาร');
check('พิมพ์เอง: ion-textarea รับข้อความ', (await ta.inputValue()).startsWith('Metformin'));
scanMode = 'fail';
await page.locator('.act ion-button').first().click();
await page.waitForSelector('ion-toast', { timeout: 8000 }).then(() => check('เน็ตหลุด → ion-toast แสดง', true), () => check('เน็ตหลุด → ion-toast แสดง', false));

// 4) หน้าตรวจสถานะของนักพัฒนา (เฉพาะ ng serve)
const res = await page.goto(BASE + '/dev/scan-states');
await page.waitForTimeout(1200);
check('/dev/scan-states โหลดได้และมี Ionic', res.ok() && (await page.locator('ion-button').count()) > 0);

const real = errors.filter((e) => !/Failed to load resource|ERR_FAILED|net::/.test(e));
check('ไม่มี error ใน console/หน้า', real.length === 0, real.slice(0, 3).join(' | ').slice(0, 300));
await browser.close();
console.log(fail ? `\nไม่ผ่าน ${fail}` : '\nผ่านทั้งหมด');
process.exit(fail ? 1 : 0);
