// ตัวช่วยร่วมของสคริปต์ Playwright (e2e / ภาพหน้าจอ): อ่าน .env, เปิด Edge/Chrome ในเครื่อง, login, เรียก API ด้วย token
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

export const env = { ...process.env };
try {
  for (const l of readFileSync(new URL('../../../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^(\w+)=(.*)$/); if (m && !(m[1] in env)) env[m[1]] = m[2];
  }
} catch { /* ไม่มี .env */ }

export const BASE = env.BASE ?? 'http://localhost:4200';
export const EMAIL = env.DEMO_EMAIL ?? 'demo@yatung.app';

export const launch = () => chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));

export async function newPage(browser, { width = 1440, height = 900, scale = '100' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
  await ctx.addInitScript((s) => { try { localStorage.setItem('yatung_font_scale', s); } catch { /* ignore */ } }, scale);
  return { ctx, page: await ctx.newPage() };
}

export async function login(page, email = EMAIL, password = env.DEMO_PASSWORD) {
  if (!password) { console.error('ตั้ง DEMO_PASSWORD ก่อน'); process.exit(1); }
  await page.goto(BASE + '/login');
  await page.locator('input[type=email], input[autocomplete=username]').first().fill(email);
  await page.locator('input[type=password]').first().fill(password);
  await page.keyboard.press('Enter');
  await page.waitForURL('**/today', { timeout: 15000 });
  const token = await page.evaluate(() => Object.entries(localStorage).find(([k]) => /token|jwt/i.test(k))?.[1]);
  return token.replace(/^"|"$/g, '');
}

export const api = (page, token) => async (method, path, data) => {
  const r = await page.request.fetch(BASE + path, {
    method, data, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  let body = null; try { body = await r.json(); } catch { /* ไม่ใช่ JSON */ }
  return { status: r.status(), body };
};

let pass = 0, fail = 0;
export const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✔', name); } else { fail++; console.log('  ✘', name, extra); }
};
export const summary = () => { console.log(`\nผ่าน ${pass} / ล้มเหลว ${fail}`); return fail === 0; };
