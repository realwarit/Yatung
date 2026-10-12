// ถ่ายภาพหน้า Today ด้วยข้อมูลจำลอง + เวลาตรึง → เทียบก่อน/หลังแบบ pixel ต่อ pixel (ไม่ต้อง login จริง ไม่ต้องมี docker)
// ใช้: ต้องมี ng serve (4200) ; node tools/today-compare.mjs <before|after> [--sizes=375x812,412x915] [--scale=100]
//       แล้วเทียบ: node tools/today-compare.mjs diff
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const mode = args.find((a) => !a.startsWith('--')) ?? 'after';
const sizes = (args.find((a) => a.startsWith('--sizes='))?.slice(8) ?? '375x812,412x915').split(',').map((s) => s.split('x').map(Number));
const scale = args.find((a) => a.startsWith('--scale='))?.slice(8) ?? '100';
const OUT = new URL('../../docs/screenshots/day8/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE ?? 'http://localhost:4200';

const d = (id, med, name, strength, time, status, extra = {}) => ({
  id, medication_id: med, name, strength, dose_per_time: 1, unit: 'tablet', meal_relation: 'after',
  scheduled_at: `2026-10-12 ${time}:00`, status, taken_at: status === 'taken' ? `2026-10-12 ${time}:05` : null, source: status === 'taken' ? 'app' : null,
  is_overdue: status === 'pending' && time < '14:00', ...extra
});
const today = {
  slots: [
    { slot: 'morning', time: '08:00', doses: [d(1, 1, 'เมตฟอร์มิน', '500 mg', '08:00', 'taken'), d(2, 2, 'แอมโลดิปีน', '5 mg', '08:00', 'taken', { dose_per_time: 0.5 })] },
    { slot: 'noon', time: '12:00', doses: [d(3, 1, 'เมตฟอร์มิน', '500 mg', '12:00', 'pending')] },
    { slot: 'evening', time: '18:00', doses: [d(4, 1, 'เมตฟอร์มิน', '500 mg', '18:00', 'pending'), d(5, 3, 'ซิมวาสแตติน', '20 mg', '18:00', 'pending')] },
    { slot: 'bedtime', time: '21:00', doses: [d(6, 3, 'ซิมวาสแตติน', '20 mg', '21:00', 'pending')] },
  ],
  summary: { total: 6, taken: 2, pending: 4, missed: 0 },
};
const med = (id, name, strength, extra = {}) => ({
  id, name, strength, dose_per_time: 1, unit: 'tablet', meal_relation: 'after', as_needed: false, slots: ['morning'], indication: null, warnings: [],
  total_qty: 30, remaining_qty: 20, days_left: 20, refill_alert_days: 7, is_low: false, start_date: '2026-10-01', end_date: null, is_active: true,
  created_at: '2026-10-01 08:00:00', updated_at: '2026-10-01 08:00:00', ...extra
});
const meds = [
  med(1, 'เมตฟอร์มิน', '500 mg'), med(2, 'แอมโลดิปีน', '5 mg'), med(3, 'ซิมวาสแตติน', '20 mg', { remaining_qty: 4, days_left: 2, is_low: true }),
  med(9, 'พาราเซตามอล', '500 mg', { as_needed: true, slots: [], indication: 'ลดไข้ แก้ปวด', remaining_qty: 3, days_left: null, is_low: true }),
];
const exp = Math.floor(new Date('2026-10-13T00:00:00+07:00').getTime() / 1000);
const jwt = 'x.' + Buffer.from(JSON.stringify({ exp })).toString('base64url') + '.y';
const user = { id: 1, email: 'demo@example.test', display_name: 'คุณสมชาย' };

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
const hashes = {};
for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', serviceWorkers: 'block' });
  await ctx.addInitScript(([t, u, s]) => { localStorage.setItem('yatung_token', t); localStorage.setItem('yatung_user', JSON.stringify(u)); localStorage.setItem('yatung_font_scale', s); }, [jwt, user, scale]);
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-10-12T14:30:00+07:00') });
  await page.route('**/api/**', (r) => {
    const u = new URL(r.request().url()).pathname;
    const json = (b) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (u === '/api/doses/today') return json(today);
    if (u === '/api/medications') return json(meds);
    if (u === '/api/stats/adherence') return json({ overall: { taken: 13, missed: 2, pending_due: 2, due: 17, rate: 76 } });
    return json({});
  });
  await page.goto(BASE + '/today');
  await page.waitForSelector('app-dose-card');
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
  await page.waitForTimeout(500);
  if (mode === 'card') { const t = await page.evaluate(() => { const a = document.querySelector('app-adherence-card a'); const r = a?.getBoundingClientRect(); return a ? `${a.textContent.trim()} ${Math.round(r.width)}x${Math.round(r.height)} href=${a.getAttribute('href')}` : 'ไม่พบการ์ด'; }); console.log('การ์ด 7 วัน:', t); }
  if (mode !== 'diff') {
    const file = `${OUT}today-${mode}-${w}x${h}-s${scale}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log('บันทึก', file);
  }
  await ctx.close();
}
await browser.close();
if (mode === 'diff') {
  let bad = 0;
  for (const [w, h] of sizes) {
    const f = (m) => `${OUT}today-${m}-${w}x${h}-s${scale}.png`;
    if (!existsSync(f('before')) || !existsSync(f('after'))) { console.log(`✘ ${w}x${h}: ไม่มีไฟล์ before/after`); bad++; continue; }
    const a = createHash('sha256').update(readFileSync(f('before'))).digest('hex');
    const b = createHash('sha256').update(readFileSync(f('after'))).digest('hex');
    console.log(`${a === b ? '✓ เหมือนกันทุกพิกเซล' : '✘ ต่างกัน'}  ${w}x${h} s${scale}`);
    if (a !== b) bad++;
  }
  process.exit(bad ? 1 : 0);
}
