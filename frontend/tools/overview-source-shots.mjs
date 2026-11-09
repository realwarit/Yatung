// ถ่ายบรรทัด "บันทึกผ่าน … คนที่ห่วงใย n" ท้ายการ์ดหน้าสรุป (ข้อมูลจำลองมี caregiver:1 ใน tools/lib/mock-app.mjs) : node tools/overview-source-shots.mjs
// ขนาด 320×640 / 384×832 × ก (100) / ก++ (125) → docs/screenshots/day11/after/overview-source-*.png ; วัดล้นแนวนอน/จำนวนบรรทัด
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { FAKE_JWT, mockApi } from './lib/mock-app.mjs';

const out = path.resolve('../docs/screenshots/day11/after');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
let bad = 0;
for (const [w, h] of [[320, 640], [384, 832]]) for (const sc of ['100', '125']) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([s, tok]) => { localStorage.setItem('yatung_font_scale_v2', s); localStorage.setItem('yatung_font_hint_off', '1'); localStorage.setItem('yatung_token', tok); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); }, [sc, FAKE_JWT]);
  const page = await ctx.newPage();
  await mockApi(page, {});
  await page.goto('http://localhost:4200/overview');
  await page.waitForSelector('app-med-breakdown');
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
  await page.waitForTimeout(500);
  const el = page.locator('.src').first();
  await el.scrollIntoViewIfNeeded();
  await page.evaluate(() => { const m = document.querySelector('.main'); if (m) m.scrollBy(0, 120); });
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const n = document.querySelector('.src');
    const r = n.getBoundingClientRect(), lh = parseFloat(getComputedStyle(n).lineHeight);
    return { text: n.textContent.trim(), lines: Math.round(r.height / lh), right: Math.round(r.right), vw: innerWidth, overflowX: document.documentElement.scrollWidth - innerWidth, fs: getComputedStyle(n).fontSize };
  });
  const bar = await page.evaluate(() => { const nav = document.querySelector('nav.bottom'); const n = document.querySelector('.src'); return nav ? Math.round(nav.getBoundingClientRect().top - n.getBoundingClientRect().bottom) : null; });
  const ok = m.overflowX <= 0 && m.right <= m.vw && m.lines <= 3;
  if (!ok) bad++;
  const file = path.join(out, `overview-source-${w}x${h}-s${sc}.png`);
  await page.screenshot({ path: file });
  console.log(`${ok ? '✓' : '✘'} ${w}x${h} ${sc === '100' ? 'ก' : 'ก++'} บรรทัด=${m.lines} ขวา=${m.right}/${m.vw} ล้น=${m.overflowX} ฟอนต์=${m.fs} ห่างแถบเมนู=${bar}  "${m.text}"`);
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
