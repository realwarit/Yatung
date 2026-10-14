// ภาพหน้าตา D3 (ก่อน/หลัง) ด้วยข้อมูลจำลอง — ต้องมี ng serve (4200) ; ไม่ต้อง login/docker
//   node tools/d3-shots.mjs --tag=before|after [--only=medications,sheet,...] [--scales=100,125] [--widths=384,320]
// ผลลัพธ์ : docs/screenshots/day8d/d3-<tag>/<หน้า>-<กว้าง>-<k|kp|kpp>.png (หน้ายาวเต็มหน้า ที่ความสูง 1900/3400)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { FAKE_JWT, MED, MED_PRN, fakeThaiVoice, mockApi } from './lib/mock-app.mjs';

const args = process.argv.slice(2);
const val = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=').slice(1).join('=');
const tag = val('tag', 'after');
const only = val('only', '').split(',').filter(Boolean);
const widths = val('widths', '384').split(',').map(Number);
const scales = val('scales', '100,125').split(',');
const out = `../docs/screenshots/day8d/d3-${tag}`;
fs.mkdirSync(out, { recursive: true });
const HEIGHT = { 384: 832, 320: 640 };
const SC = { 100: 'k', 112: 'kp', 125: 'kpp' };

const metformin = { ...MED, id: 3, name: 'Metformin', strength: '500 mg', slots: ['morning', 'noon', 'evening', 'bedtime'], indication: 'ลดน้ำตาลในเลือด', remaining_qty: 40, days_left: 20, is_low: false };
const stopped = { ...MED, id: 4, name: 'Simvastatin', strength: '20 mg', slots: ['bedtime'], indication: 'ลดไขมันในเลือด', is_active: false, end_date: '2026-10-10', is_low: false, remaining_qty: 12, days_left: null };
const MEDS = [MED, MED_PRN, metformin, stopped];

// หน้า : [ชื่อไฟล์, route, เงื่อนไข/ขั้นตอนเพิ่ม]
const SHOTS = [
  ['medications', '/medications', {}],
  ['medications-sheet', '/medications', { click: 'ดูรายละเอียด Amlodipine', h: 900 }],
  ['medications-confirm', '/medications', { click: 'ดูรายละเอียด Amlodipine', then: 'หยุดใช้ยานี้', h: 900 }],
  ['medications-stopped', '/medications', { tab: 'หยุดแล้ว' }],
  ['medications-ok', '/medications', { meds: [metformin, MED_PRN] }],
  ['medications-empty', '/medications', { meds: [] }],
  ['med-form', '/medications/new', {}],
  ['med-form-edit', '/medications/1/edit', {}],
  ['settings', '/settings', {}],
  ['overview', '/overview', {}],
  ['today-empty', '/today', { empty: true }],
];

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
for (const scale of scales) for (const w of widths) for (const [name, route, o] of SHOTS) {
  if (only.length && !only.includes(name)) continue;
  const h = HEIGHT[w] ?? 832;   // จอจริง : 384×832 (S23 FE) / 320×640 ; -full = หน้ายาวเต็มหน้า
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([sc, tok]) => { try { localStorage.setItem('yatung_font_scale_v2', sc); localStorage.setItem('yatung_font_hint_off', '1'); localStorage.setItem('yatung_token', tok); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); } catch {} }, [scale, FAKE_JWT]);
  await fakeThaiVoice(ctx);
  const page = await ctx.newPage();
  await mockApi(page, { today: () => 'late' });
  const list = o.meds ?? MEDS;
  await page.route('**/api/medications', (r) => (r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) }) : r.fallback()));
  await page.route('**/api/medications/1', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MED) }));
  await page.route('**/api/medications/1/stop', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...MED, is_active: false, end_date: '2026-10-14' }) }));
  if (o.empty) await page.route('**/api/doses/today', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: { total: 0, taken: 0, pending: 0, missed: 0 }, slots: [] }) }));
  await page.goto('http://localhost:4200' + route);
  await page.waitForLoadState('networkidle').catch(() => {});
  if (!o.click) await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });   // sheet ต้องเล่น animation เข้าจนจบ
  await page.waitForTimeout(700);
  if (o.tab) { await page.getByRole('radio', { name: new RegExp(o.tab) }).click(); await page.waitForTimeout(300); }
  if (o.click) { await page.getByRole('button', { name: o.click }).click(); await page.waitForTimeout(1200); }
  if (o.then) { await page.getByRole('button', { name: o.then }).evaluate((e) => e.click()); await page.waitForTimeout(900); }
  const file = `${out}/${name}-${w}-${SC[scale]}.png`;
  await page.screenshot({ path: file });
  if (!o.noFull) { await page.setViewportSize({ width: w, height: o.h ?? (scale === '100' ? 1900 : 3400) }); await page.waitForTimeout(500); await page.screenshot({ path: file.replace('.png', '-full.png') }); }
  const ov = await page.evaluate(() => { const m = document.querySelector('.main') ?? document.documentElement; return [document.documentElement.scrollWidth, m.scrollWidth, m.clientWidth]; });
  console.log(`${name} ${w} ${SC[scale]} → ${file}  scrollWidth ${ov.join('/')}`);
  await ctx.close();
}
await browser.close();
