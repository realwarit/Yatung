// ตรวจท่าน้องยาตรง M (56px) ของหน้า Login ทุกสถานะที่ผู้ใช้เห็นจริง → docs/screenshots/day8d/auth-mascot/<สถานะ>.png (ขยาย 3 เท่า) + เติมลง index.html
//   node tools/auth-mascot-check.mjs        (ต้องมี ng serve 4200 ; ข้อมูลจำลอง ไม่ต้อง login/docker)
// ผ่าน = ทุกท่าเรนเดอร์ได้ที่ 56px × 60px จริง และไม่มีท่าที่หน้า/แขนหลุดกรอบ (ตัดสินความอ่านออกด้วยตาจากภาพเทียบ)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { mockApi, json } from './lib/mock-app.mjs';

const OUT = path.resolve('..', 'docs', 'screenshots', 'day8d', 'auth-mascot');
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { localStorage.setItem('yatung_font_scale_v2', '100'); } catch {} });

const STATES = [
  { name: 'wave', label: 'โบกมือ (เปิดหน้า)', run: async () => {}, wait: 150 },
  { name: 'happy', label: 'ยิ้ม (ว่าง)', run: async (p) => { await p.waitForTimeout(3800); }, wait: 100 },
  { name: 'watching', label: 'เหลือบมอง (โฟกัสอีเมล)', run: async (p) => { await p.waitForTimeout(3800); await p.locator('#email').click(); }, wait: 400 },
  { name: 'shy', label: 'เขินปิดตา (โฟกัสรหัสผ่าน)', run: async (p) => { await p.waitForTimeout(3800); await p.locator('#password').click(); }, wait: 400 },
  { name: 'shy-peek', label: 'เขินแง้มนิ้ว (แสดงรหัส)', run: async (p) => { await p.waitForTimeout(3800); await p.locator('#password').click(); await p.locator('#toggle-password').click(); }, wait: 400 },
  { name: 'worried', label: 'เป็นห่วง (เข้าสู่ระบบไม่ได้)', run: async (p) => {
    await p.route('**/api/auth/login', (r) => r.fulfill(json({ error: 'INVALID_CREDENTIALS', details: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, 401)));
    await p.waitForTimeout(3800); await p.fill('#email', 'a@example.test'); await p.fill('#password', 'xxxxxxxx'); await p.locator('button[type=submit]').click();
  }, wait: 600 },
  { name: 'thinking', label: 'กำลังคิด (กำลังส่ง)', run: async (p) => {
    await p.route('**/api/auth/login', async (r) => { await new Promise((x) => setTimeout(x, 4000)); r.fulfill(json({ error: 'x', details: 'x' }, 401)); });
    await p.waitForTimeout(3800); await p.fill('#email', 'a@example.test'); await p.fill('#password', 'xxxxxxxx'); await p.locator('button[type=submit]').click();
  }, wait: 400 },
];

const shots = [];
for (const s of STATES) {
  const page = await ctx.newPage();
  await mockApi(page);
  await page.goto('http://localhost:4200/login');
  await page.waitForLoadState('networkidle').catch(() => {});
  await s.run(page);
  await page.waitForTimeout(s.wait);
  const box = await page.locator('.hello .mc').boundingBox();
  if (!box) throw new Error('ไม่พบน้องยาตรงในหัวการ์ด');
  const file = path.join(OUT, `${s.name}.png`);
  await page.screenshot({ path: file, clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: box.height + 16 } });
  console.log(`${s.name}: ${Math.round(box.width)}×${Math.round(box.height)}px → ${path.relative('..', file)}`);
  shots.push(s);
  await page.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(shots.map((s) => ({ name: s.name, label: s.label }))));
