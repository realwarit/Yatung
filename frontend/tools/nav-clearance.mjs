// ตรวจว่าเนื้อหาท้ายหน้าไม่ถูกแถบเมนูล่าง/ปุ่มสแกนบังทุกหน้าที่มีแถบ: node tools/nav-clearance.mjs [--scale=125] [--sizes=390x844,375x667]
// ล็อกอินบัญชีเดโมจริง (ต้องมี ng serve + backend + DEMO_PASSWORD ใน env หรือ ../.env) ; เลื่อน .main ไปสุดแล้ววัดช่องว่างระหว่างองค์ประกอบสุดท้ายที่มองเห็นกับขอบบนของปุ่มสแกน/แถบเมนู
// ผ่านเมื่อ clearance ≥ 0 ทุกหน้า ; ที่ safe-area-inset-bottom จริงของเครื่องใช้ค่า 0 ในเดสก์ท็อป (ค่า env() รวมอยู่ใน --yt-bottom-clearance แล้ว)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const env = { ...process.env };
try { for (const l of readFileSync(new URL('../../.env', import.meta.url), 'utf8').split(/\r?\n/)) { const m = l.match(/^(\w+)=(.*)$/); if (m && !(m[1] in env)) env[m[1]] = m[2]; } } catch {}
const BASE = env.BASE ?? 'http://localhost:4200';
const pw = env.DEMO_PASSWORD || 'demo1234';
const args = process.argv.slice(2);
const val = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const scale = val('scale', '125');
const sizes = val('sizes', '390x844,375x667').split(',').map((s) => s.split('x').map(Number));
const PAGES = ['/today', '/medications', '/medications/new', '/overview', '/settings'];

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
let fail = 0;
for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
  await ctx.addInitScript((s) => { try { localStorage.setItem('yatung_font_scale', s); } catch {} }, scale);
  const page = await ctx.newPage();
  await page.goto(BASE + '/login');
  await page.locator('input[type=email], input[autocomplete=username]').first().fill('demo@yatung.app');
  await page.locator('input[type=password]').first().fill(pw);
  await page.keyboard.press('Enter');
  await page.waitForURL('**/today', { timeout: 15000 });
  for (const path of PAGES) {
    await page.goto(BASE + path);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => {
      const main = document.querySelector('.main'); const scan = document.querySelector('.scan__btn');
      if (!main || !scan) return null;
      main.scrollTop = main.scrollHeight;
      const mb = main.getBoundingClientRect().bottom;
      let last = 0;
      for (const e of main.querySelectorAll('*')) {
        if (e.children.length && !['BUTTON', 'A'].includes(e.tagName)) continue;   // เฉพาะใบ (กล่องครอบที่ยืดไปถึงขอบ padding ไม่นับ)
        if (e.closest('.actions, .savebar, .sticky')) continue;
        const col = e.closest('.yt-collapse'); if (col && col.getBoundingClientRect().height < 2) continue;   // ส่วนที่พับอยู่ (ซ่อนด้วย overflow) ไม่ใช่เนื้อหาที่มองเห็น
        const b = e.getBoundingClientRect();
        { const t = document.elementFromPoint(b.left + b.width / 2, Math.min(b.top + b.height / 2, innerHeight - 1)); if (!t || !(e === t || e.contains(t))) continue; }   // ถูกตัด/พับ/ถูกบังด้วยองค์ประกอบอื่น = ไม่ใช่เนื้อหาที่มองเห็น
        if (b.top + b.height / 2 < mb && b.height > 0 && b.width > 0 && getComputedStyle(e).visibility !== 'hidden') last = Math.max(last, b.bottom);
      }
      // องค์ประกอบ sticky (ปุ่มบันทึกของฟอร์ม) อยู่ติดแถบโดยตั้งใจ ไม่นับ
      return { lastContentBottom: Math.round(last), scanTop: Math.round(scan.getBoundingClientRect().top), mainBottom: Math.round(mb), overflowX: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    if (!r) { console.log(`${w}x${h} ${path}: ไม่พบ .main/.scan__btn`); fail++; continue; }
    const clearance = r.scanTop - r.lastContentBottom;
    const ok = clearance >= 0 && !r.overflowX;
    if (!ok) fail++;
    console.log(`${ok ? '✔' : '✘'} ${w}x${h} s${scale} ${path}: clearance=${clearance}px ${JSON.stringify(r)}`);
  }
  await ctx.close();
}
await browser.close();
console.log(fail ? `\nไม่ผ่าน ${fail} หน้า` : '\nผ่านทุกหน้า');
process.exit(fail ? 1 : 0);
