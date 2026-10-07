// ทดสอบ Day 4 ผ่านหน้าเว็บจริง: อัปโหลดรูปที่ 1 → หน้า Review ชั่วคราวแสดงผลจาก API จริง → เปิด URL ตรงๆ โหลดจาก GET /api/prescriptions/:id
// ใช้ได้ทั้ง AI_MOCK=true (ไม่เปลืองโควตา — ค่าเริ่มต้นที่ควรใช้) และ AI_MOCK=false (เรียก Gemini จริง 1 ครั้ง)
//   AI_MOCK=true docker compose up -d nodered ; cd frontend && node tools/scan-review-e2e.mjs
// ต้องมี ng serve (4200) และ DEMO_PASSWORD ใน env หรือ ../.env
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const env = { ...process.env };
try {
  for (const l of readFileSync(new URL('../../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^(\w+)=(.*)$/); if (m && !(m[1] in env)) env[m[1]] = m[2];
  }
} catch {}
const BASE = env.BASE ?? 'http://localhost:4200';
const IMG = new URL('../../docs/sample-images/1-metformin-normal.jpg', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const OUT = new URL('../../docs/screenshots/day4/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

let bad = 0;
const check = (name, ok, extra = '') => { if (!ok) bad++; console.log(ok ? 'PASS' : 'FAIL', name, extra); };

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'th-TH' })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(BASE + '/login');
await page.locator('input[type=email], input[autocomplete=username]').first().fill(env.DEMO_EMAIL ?? 'demo@yatung.app');
await page.locator('input[type=password]').first().fill(env.DEMO_PASSWORD);
await page.keyboard.press('Enter');
await page.waitForURL('**/today', { timeout: 15000 });
await page.goto(BASE + '/scan');
await page.waitForSelector('app-scan-stage');

// 1) อัปโหลดรูปที่ 1 แล้วส่งอ่าน
const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'อัปโหลดรูปซองยา' }).click()]);
await fc.setFiles(IMG);
await page.waitForSelector('app-scan-capture .frame--image img');
const resp = page.waitForResponse((r) => r.url().endsWith('/api/scan') && r.request().method() === 'POST', { timeout: 60000 });
await page.locator('.act ion-button').click();
const r = await resp;
check('POST /api/scan → 200', r.status() === 200, String(r.status()));
const body = await r.json();
await page.waitForURL('**/review/*', { timeout: 15000 });
check('ไปหน้า Review พร้อม id ของ prescription', page.url().endsWith('/review/' + body.prescription_id));
await page.waitForSelector('.med h2');
const names = await page.locator('.med h2').allInnerTexts();
check('Review แสดงรายชื่อยา', names.length === body.result.medications.length && /metformin/i.test(names.join()), names.join('|'));
check('Review แสดงมื้อ/ก่อน-หลังอาหาร', (await page.locator('.med dl').first().innerText()).includes('หลังอาหาร'));
await page.locator('details.ocr summary').click();
check('ocr_text อยู่ในกล่องพับ', (await page.locator('details.ocr pre').innerText()).length > 20);
check('ocr_text ไม่มีชื่อผู้ป่วย/HN', !/สมศรี|123456/.test(await page.locator('details.ocr pre').innerText()));
await page.screenshot({ path: OUT + 'review-after-scan.png', fullPage: true });

// 2) เปิด URL ตรงๆ (ไม่มี history.state) → โหลดจาก GET /api/prescriptions/:id
const reviewUrl = page.url();
await page.goto(BASE + '/today');   // เปลี่ยนหน้าก่อน เพื่อให้ history.state ของ navigation เดิมไม่ติดมา
const get = page.waitForResponse((x) => x.url().includes('/api/prescriptions/') && x.request().method() === 'GET');
await page.goto(reviewUrl);
check('GET /api/prescriptions/:id → 200', (await get).status() === 200);
await page.waitForSelector('.med h2');
check('refresh แล้วแสดงยาเดิมจาก API', (await page.locator('.med h2').allInnerTexts()).join() === names.join());
await page.locator('details.ocr summary').click();
check('refresh: ocr_text ครบ', (await page.locator('details.ocr pre').innerText()) === body.ocr_text);
await page.screenshot({ path: OUT + 'review-after-refresh.png', fullPage: true });

// 3) id ที่ไม่มี → "ไม่พบข้อมูล"
await page.goto(BASE + '/review/99999999');
await page.waitForSelector('.empty');
check('id ที่ไม่มี: "ไม่พบข้อมูล กรุณาสแกนใหม่"', (await page.locator('.empty').innerText()).includes('ไม่พบข้อมูล'));

// 4) error จาก backend → ข้อความไทยตาม code ในกรอบน้องยาตรง (ใช้ได้เฉพาะ AI_MOCK=true)
if ((env.AI_MOCK_EXPECT ?? 'true') === 'true') {
  await page.goto(BASE + '/scan');
  await page.waitForSelector('app-scan-stage');
  await page.locator('ion-segment-button[value=text]').click();
  await page.locator('app-scan-text-input textarea').fill('ยาทดสอบ [[mock:no_result]]');
  await page.locator('.act ion-button').click();
  await page.waitForSelector('app-scan-coach .full', { timeout: 15000 });
  const t = await page.locator('app-scan-coach .full').innerText();
  check('AI_NO_RESULT → ข้อความไทยในสถานะ error (น้อง worried)', t.includes('น้องอ่านซองนี้ไม่ได้'), t.replace(/\s+/g, ' ').slice(0, 80));
  await page.screenshot({ path: OUT + 'scan-error-no-result.png' });
}
await browser.close();
console.log(bad ? `FAILED ${bad}` : 'ALL PASS');
process.exit(bad ? 1 : 0);
