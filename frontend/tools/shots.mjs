// ถ่ายภาพหน้าจอทุกหน้าที่ 3 ขนาด: node tools/shots.mjs [ชื่อกลุ่ม] [--sizes=390x844,1440x900]
// ต้องมี ng serve (4200) และตั้ง DEMO_PASSWORD (ใน env หรือ ../.env) ; ใช้ Edge/Chrome ในเครื่อง
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const env = { ...process.env };
try {
  for (const l of readFileSync(new URL('../../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^(\w+)=(.*)$/); if (m && !(m[1] in env)) env[m[1]] = m[2];
  }
} catch {}
const BASE = env.BASE ?? 'http://localhost:4200';
const EMAIL = env.DEMO_EMAIL ?? 'demo@yatung.app';
if (!env.DEMO_PASSWORD) { console.error('ตั้ง DEMO_PASSWORD ก่อน'); process.exit(1); }

const args = process.argv.slice(2);
const sizeArg = args.find((a) => a.startsWith('--sizes='));
const sizes = (sizeArg ? sizeArg.slice(8) : '390x844,1440x900,1920x1080').split(',').map((s) => s.split('x').map(Number));
const only = args.filter((a) => !a.startsWith('--'));
const scaleArg = args.find((a) => a.startsWith('--scale='));
const scale = scaleArg ? scaleArg.slice(8) : '100';

const PAGES = [
  ['today', '/today'], ['meds', '/medications'], ['meds-stopped', '/medications', async (p) => { await p.getByRole('radio', { name: /หยุดแล้ว/ }).click(); }],
  ['med-new', '/medications/new'], ['med-edit', '/medications/EDIT_ID/edit'],
  ['settings', '/settings'], ['overview', '/overview'], ['dev-buttons', '/dev/buttons'],
];
const OUT = new URL('../../docs/screenshots/day3/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
  await ctx.addInitScript((s) => { try { localStorage.setItem('yatung_font_scale', s); } catch {} }, scale);
  const page = await ctx.newPage();
  await page.goto(BASE + '/login');
  await page.locator('input[type=email], input[autocomplete=username]').first().fill(EMAIL);
  await page.locator('input[type=password]').first().fill(env.DEMO_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL('**/today', { timeout: 15000 });
  const token = await page.evaluate(() => Object.entries(localStorage).find(([k]) => /token|jwt/i.test(k))?.[1]);
  let editId = null;
  if (token) {
    const r = await page.request.get(BASE + '/api/medications', { headers: { Authorization: 'Bearer ' + token.replace(/^"|"$/g, '') } });
    try { const j = await r.json(); editId = (Array.isArray(j) ? j : j.items ?? j.medications ?? [])[0]?.id; } catch {}
  }
  for (const [name, path, act] of PAGES) {
    if (only.length && !only.includes(name)) continue;
    await page.goto(BASE + path.replace('EDIT_ID', editId ?? 1));
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(700);
    if (act) await act(page).catch(() => {});
    await page.evaluate(() => { for (const e of document.querySelectorAll('*')) if (e.scrollTop) e.scrollTop = 0; });
    await page.waitForTimeout(300);
    const base = `${OUT}${name}-${w}x${h}${scale === '100' ? '' : '-s' + scale}`;
    await page.screenshot({ path: base + '.png' });
    // แอปเลื่อนใน container ภายใน (.main) → เลื่อนลงสุดแล้วถ่ายอีกใบ
    const scrolled = await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')]
        .filter((e) => e.scrollHeight > e.clientHeight + 8 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY))
        .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
      if (!el) return false;
      el.scrollTop = el.scrollHeight;
      return true;
    });
    if (scrolled) { await page.waitForTimeout(300); await page.screenshot({ path: base + '-bottom.png' }); }
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll("*")].some((e) => getComputedStyle(e).overflowY !== "visible" && e.scrollWidth > e.clientWidth + 1 && ["auto","scroll"].includes(getComputedStyle(e).overflowX)));
    console.log(name, w + 'x' + h, overflowX ? 'OVERFLOW-X' : 'ok');
  }
  await ctx.close();
}
await browser.close();
