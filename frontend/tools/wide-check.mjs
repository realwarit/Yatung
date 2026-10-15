// ตรวจจอกว้าง (D2.5 E1/E3/E4) ด้วย API จำลอง — ต้องมี ng serve (4200)
//   node tools/wide-check.mjs [--sizes=1366x768,1024x768]
//  - Review: 2 คอลัมน์ (รูป/ข้อความซ้าย การ์ดขวา) · เลื่อนถึงล่างสุดแล้ว review bar ต้องไม่ทับช่องกรอก/ปุ่มใดๆ · bar กว้างเต็มพื้นที่เนื้อหา
//  - วันนี้ (late): ที่ว่างกลางการ์ดหลัก (ระหว่างกล่องคำพูดกับกลุ่มวงแหวน) ≤ 25% ของความกว้างการ์ด
//  - สแกน: น้องยาตรง L ในคอลัมน์ซ้ายอยู่กึ่งกลางแนวตั้งของการ์ดฝั่งขวา (คลาดเคลื่อน ≤ 24px)
import { chromium } from 'playwright';
import { FAKE_JWT, fakeThaiVoice, mockApi } from './lib/mock-app.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const args = process.argv.slice(2);
const sizes = (args.find((a) => a.startsWith('--sizes=')) ?? '--sizes=1366x768,1024x768').split('=')[1].split(',').map((s) => s.split('x').map(Number));
const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`   ${ok ? '✓' : '✘'} ${msg}`); };

for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
  await ctx.addInitScript(([tok]) => { try { localStorage.setItem('yatung_font_hint_off', '1'); localStorage.setItem('yatung_token', tok); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); } catch {} }, [FAKE_JWT]);
  await fakeThaiVoice(ctx);
  const open = async (route, today = 'late') => {
    const page = await ctx.newPage();
    await mockApi(page, { today: () => today });
    await page.goto(BASE + route);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
    await page.waitForTimeout(600);
    return page;
  };

  console.log(`\n/review/1 @${w}x${h}`);
  let page = await open('/review/1');
  const top = await page.evaluate(() => {
    const side = document.querySelector('.side')?.getBoundingClientRect();
    const main = document.querySelector('.main-col')?.getBoundingClientRect();
    const cols = getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length;
    return { cols, side: side && { l: side.left, r: side.right, w: side.width }, main: main && { l: main.left, w: main.width } };
  });
  const two = top.cols === 2;   // container ของหน้า ≥ 56rem (ที่ 1024 มี sidebar กินที่ = ยังเป็นคอลัมน์เดียว ตามที่ตั้งใจ)
  if (two) check(top.side.r <= top.main.l + 1 && top.side.w > 200, `2 คอลัมน์: ซ้าย (${Math.round(top.side.w)}px) อยู่ซ้ายของการ์ดยา (${Math.round(top.main.w)}px)`);
  else console.log('   – คอลัมน์เดียว (container < 56rem) ตามเดิม');
  const r = await page.evaluate(async () => {
    const scrollers = [document.scrollingElement, ...document.querySelectorAll('.main, app-shell, .content')].filter(Boolean);
    for (const e of scrollers) e.scrollTop = e.scrollHeight;
    await new Promise((res) => setTimeout(res, 300));
    const bar = document.querySelector('app-review-bar');
    const b = bar.getBoundingClientRect();
    const pe = document.querySelector('.yt-page'); const pr = pe.getBoundingClientRect(); const cs = getComputedStyle(pe);
    const page = { left: pr.left + parseFloat(cs.paddingLeft), width: pr.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) };
    const hits = [...document.querySelectorAll('input, textarea, select, button, a, [role=button]')]
      .filter((e) => !bar.contains(e) && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden')
      .filter((e) => { const q = e.getBoundingClientRect(); return q.top < b.bottom - 1 && q.bottom > b.top + 1 && q.left < b.right && q.right > b.left && q.top < innerHeight && q.bottom > 0; })
      .map((e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + ' "' + (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20) + '"');
    const btns = [...bar.querySelectorAll('.bar__btns > button')].map((x) => x.getBoundingClientRect());
    const rows = new Set(btns.map((q) => Math.round(q.top)));
    return { bar: { l: b.left, w: b.width, bottom: b.bottom, h: b.height }, page: { l: page.left, w: page.width }, hits, rows: rows.size, vh: innerHeight };
  });
  check(r.hits.length === 0, r.hits.length ? `review bar ทับ: ${r.hits.join(', ')}` : 'เลื่อนถึงล่างสุด review bar ไม่ทับช่องกรอก/ปุ่มใด');
  if (two) check(Math.abs(r.bar.w - r.page.w) <= 2, `bar เต็มความกว้างเนื้อหา (${Math.round(r.bar.w)} / ${Math.round(r.page.w)}px)`);
  check(r.rows === 1, 'ปุ่มทิ้ง/บันทึกอยู่แถวเดียว');
  check(r.bar.bottom <= r.vh, `bar อยู่ในจอ (ล่าง ${Math.round(r.bar.bottom)} ≤ ${r.vh})`);
  await page.close();

  console.log(`/today (late) @${w}x${h}`);
  page = await open('/today', 'late');
  const t = await page.evaluate(() => {
    const card = document.querySelector('app-today-progress .card').getBoundingClientRect();
    const bub = document.querySelector('app-today-progress .bub').getBoundingClientRect();
    const stat = document.querySelector('app-today-progress .stat').getBoundingClientRect();
    return { card: card.width, gap: stat.left - bub.right, bub: bub.width };
  });
  check(t.gap <= t.card * 0.25, `ที่ว่างกลางการ์ด ${Math.round(t.gap)}px = ${Math.round((t.gap / t.card) * 100)}% ของการ์ด (${Math.round(t.card)}px) ≤ 25%`);
  await page.close();

  console.log(`/scan @${w}x${h}`);
  page = await open('/scan');
  const s = await page.evaluate(() => {
    const pe = document.querySelector('app-scan-perch').getBoundingClientRect();
    const m = document.querySelector('app-scan-perch app-mascot').getBoundingClientRect();
    const c = document.querySelector('app-scan-stage .card').getBoundingClientRect();
    return { mascot: Math.round(m.width), left: Math.abs(pe.left - c.left), cardW: Math.round(c.width), wide: c.width >= 880 };
  });
  if (s.wide) {
    check(s.cardW <= 960, `การ์ดกว้าง ${s.cardW}px ≤ 960`);
    check(s.left <= 4, `น้องยาตรงเกาะขอบบนซ้ายของการ์ด (คลาด ${Math.round(s.left)}px)`);
    check(s.mascot >= 112 && s.mascot <= 140, `น้องยาตรง L ${s.mascot}px`);
  } else console.log('   – container < 720px (คอลัมน์เดียว น้องยาตรง 80px ตามที่ตกลง) ข้าม');
  await page.close();
  await ctx.close();
}
await browser.close();
console.log(fail ? `\nไม่ผ่าน ${fail}` : '\nผ่านทั้งหมด');
process.exit(fail ? 1 : 0);
