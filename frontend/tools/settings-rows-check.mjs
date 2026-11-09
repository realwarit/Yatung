// ตรวจแถวใน hub ตั้งค่า (list-row): ลูกศร > ต้องอยู่แถวเดียวกับชื่อ ไม่ตกบรรทัดล่าง ; ไม่ล้นแนวนอน ; ป้ายไม่ซ้อนทับชื่อ
//   node tools/settings-rows-check.mjs [--out=../docs/screenshots/day11/after/rows] ; ต้องมี ng serve (4200) · สถานะ LINE: เชื่อมแล้ว / ยังไม่เชื่อม / กำลังโหลด (…)
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { FAKE_JWT, mockApi } from './lib/mock-app.mjs';

const args = process.argv.slice(2);
const out = path.resolve((args.find((a) => a.startsWith('--out=')) ?? '--out=../docs/screenshots/day11/after/rows').split('=')[1]);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
const STATES = { linked: { linked: true, line_display_name: 'สมชาย' }, unlinked: { linked: false }, loading: null };
let bad = 0, total = 0;
for (const [name, body] of Object.entries(STATES)) for (const sc of ['100', '112', '125']) for (const [w, h] of [[320, 640], [384, 832]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([s, tok]) => { localStorage.setItem('yatung_font_scale_v2', s); localStorage.setItem('yatung_font_hint_off', '1'); localStorage.setItem('yatung_token', tok); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); }, [sc, FAKE_JWT]);
  const page = await ctx.newPage();
  await mockApi(page, {});
  await page.route('**/api/line/status', (r) => (body ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }) : new Promise(() => {})));   // loading = ไม่ตอบ
  await page.goto('http://localhost:4200/settings');
  await page.waitForSelector('#set-b');
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#set-b .yt-row, #set-c .yt-row')].map((r) => {
      const R = (e) => e?.getBoundingClientRect();
      const t = R(r.querySelector('.t')), c = R(r.querySelector('.chev')), tr = R(r.querySelector('.trail')), row = R(r);
      return { title: r.querySelector('.t')?.textContent.trim(), chev: !!c, chevOnNameRow: c ? c.top < t.bottom && c.bottom > t.top : true, chipOverTitle: tr && tr.width > 0 ? !(tr.left >= t.right - 1 || tr.top >= t.bottom - 1 || tr.bottom <= t.top + 1 || tr.right <= t.left + 1) : false, right: Math.round(row.right), tall: Math.round(row.height) };
    });
    return { overflowX: document.documentElement.scrollWidth - innerWidth, vw: innerWidth, rows };
  });
  const problems = m.rows.filter((r) => !r.chevOnNameRow || r.chipOverTitle || r.right > m.vw);
  total++; if (problems.length || m.overflowX > 0) bad++;
  console.log(`${problems.length || m.overflowX > 0 ? '✘' : '✓'} ${name} ${w}x${h} ${sc === '100' ? 'ก' : sc === '112' ? 'ก+' : 'ก++'} ${m.rows.map((r) => `${r.title.slice(0, 10)}:${r.tall}`).join(' ')}${problems.length ? ' ปัญหา=' + problems.map((p) => p.title).join(',') : ''}`);
  await page.locator('app-section#set-b').screenshot({ path: path.join(out, `rows-${name}-${w}x${h}-s${sc}.png`) });
  await ctx.close();
}
await browser.close();
console.log(`${total - bad}/${total} ผ่าน`);
process.exit(bad ? 1 : 0);
