// ถ่ายภาพ + วัดหน้า "สรุป 7 วัน" ด้วยข้อมูลจำลอง (ไม่ต้อง login จริง/ไม่ต้องมี docker) ; ต้องมี ng serve (4200)
// node tools/overview-shots.mjs [--scale=100,112,125] [--sizes=375x1500,768x1400,1440x1200] [state…]   state = data | empty | stopped | error
// วัด: ไม่มีแนวนอนล้น · ปุ่ม/พื้นที่แตะ ≥ 48px · ตัวอักษรเนื้อหา ≥ 16px (บรรทัดช่องทาง .src ≥ 15px ; sr-only ข้าม) · ความสูงหน้า · แถวป้ายใต้แท่งสูงเท่ากัน · แท่ง 100% สูง ≈ 150px ที่ 375px/100%
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const scales = (args.find((a) => a.startsWith('--scale='))?.slice(8) ?? '100,112,125').split(',');
const sizes = (args.find((a) => a.startsWith('--sizes='))?.slice(8) ?? '360x1500,375x1500,768x1400,1440x1200').split(',').map((s) => s.split('x').map(Number));
const only = args.filter((a) => !a.startsWith('--'));
const OUT = new URL('../../docs/screenshots/day8/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE ?? 'http://localhost:4200';

const D = (date, label_th, taken, missed, pending_due, upcoming, is_today = false) => {
  const due = taken + missed + pending_due;
  return { date, label_th, is_today, taken, missed, pending_due, upcoming, due, rate: due ? Math.round((taken * 100) / due) : null };
};
const days = [
  D('2026-10-06', 'อ. 6 ต.ค.', 3, 0, 0, 0), D('2026-10-07', 'พ. 7 ต.ค.', 0, 0, 0, 0), D('2026-10-08', 'พฤ. 8 ต.ค.', 2, 1, 0, 0),
  D('2026-10-09', 'ศ. 9 ต.ค.', 1, 2, 0, 0), D('2026-10-10', 'ส. 10 ต.ค.', 3, 0, 0, 0), D('2026-10-11', 'อา. 11 ต.ค.', 2, 0, 1, 0),
  D('2026-10-12', 'จ. 12 ต.ค.', 2, 0, 0, 1, true),
];
const sum = (k) => days.reduce((n, d) => n + d[k], 0);
const overall = { taken: sum('taken'), missed: sum('missed'), pending_due: sum('pending_due'), due: sum('due'), rate: Math.round((sum('taken') * 100) / sum('due')) };
const data = {
  range: { from: '2026-10-06', to: '2026-10-12', days: 7 }, overall, days,
  by_meal: [{ meal: 'morning', label_th: 'เช้า', due: 7, taken: 7, rate: 100 }, { meal: 'evening', label_th: 'เย็น', due: 7, taken: 4, rate: 57 }],
  by_medication: [
    { medication_id: 2, name: 'ซิมวาสแตติน', strength: '20 mg', is_active: true, due: 7, taken: 4, rate: 57 },
    { medication_id: 3, name: 'ยาเก่าที่หยุดแล้ว', strength: null, is_active: false, due: 3, taken: 2, rate: 67 },
    { medication_id: 1, name: 'เมตฟอร์มิน', strength: '500 mg', is_active: true, due: 7, taken: 7, rate: 100 },
  ],
  by_source: { app: 8, push: 1, line: 2, caregiver: 1, other: 0 }, streak_days: 2, generated_at: '2026-10-12T14:30:00+07:00',
};
const emptyDays = days.map((d) => D(d.date, d.label_th, 0, 0, 0, 0, d.is_today));
const empty = { ...data, overall: { taken: 0, missed: 0, pending_due: 0, due: 0, rate: null }, days: emptyDays, by_meal: [], by_medication: [], by_source: { app: 0, push: 0, line: 0, caregiver: 0, other: 0 }, streak_days: 0 };
const perfect = { ...data, overall: { ...overall, rate: 100 }, days: days.map((d) => ({ ...d, taken: d.due || 0, missed: 0, rate: d.due ? 100 : null })), by_meal: [{ meal: 'morning', label_th: 'เช้า', due: 7, taken: 7, rate: 100 }] };
const STATES = { data, empty, perfect, error: null };

const exp = Math.floor(new Date('2026-10-13T00:00:00+07:00').getTime() / 1000);
const jwt = 'x.' + Buffer.from(JSON.stringify({ exp })).toString('base64url') + '.y';
const user = { id: 1, email: 'demo@example.test', display_name: 'คุณสมชาย' };

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
let bad = 0;
const fail = (m) => { bad++; console.log('  ✘', m); };
for (const state of only.length ? only : Object.keys(STATES)) {
  for (const scale of scales) for (const [w, h] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', serviceWorkers: 'block' });
    await ctx.addInitScript(([t, u, s]) => { localStorage.setItem('yatung_token', t); localStorage.setItem('yatung_user', JSON.stringify(u)); localStorage.setItem('yatung_font_scale', s); }, [jwt, user, scale]);
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date('2026-10-12T14:30:00+07:00') });
    await page.route('**/api/**', (r) => {
      const u = new URL(r.request().url()).pathname;
      if (u === '/api/stats/adherence') return STATES[state] ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATES[state]) }) : r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"INTERNAL_ERROR","details":"ระบบขัดข้อง กรุณาลองใหม่ภายหลัง"}' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.goto(BASE + '/overview');
    await page.waitForSelector(state === 'error' ? '[role=alert]' : 'app-adherence-hero');
    await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
    await page.waitForTimeout(400);
    const file = `${OUT}overview-${state}-${w}x${h}-s${scale}.png`;
    await page.screenshot({ path: file, fullPage: true });
    const m = await page.evaluate(() => {
      const out = { overflowX: document.documentElement.scrollWidth - innerWidth, small: [], taps: [], lblH: [], barH: [] };
      const scroller = document.querySelector('app-overview-page');
      out.hOverflow = scroller ? scroller.scrollWidth - scroller.clientWidth : 0;
      for (const el of document.querySelectorAll('app-overview-page :is(p,span,li,h1,h2,td,th,a,button):not(.sr-only)')) {
        if (el.closest('.sr-only') || el.closest('svg') || el.closest('.mark')) continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < (el.closest('.src') ? 15 : 16)) out.small.push(`${el.textContent.trim().slice(0, 20)}=${fs}px`);
      }
      for (const el of document.querySelectorAll('app-overview-page button, app-overview-page a')) {
        const r = el.getBoundingClientRect(); if (r.width && (r.width < 48 || r.height < 48)) out.taps.push(`${el.textContent.trim().slice(0, 20) || el.getAttribute('aria-label')?.slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      out.lblH = [...document.querySelectorAll('.lbl')].map((e) => Math.round(e.getBoundingClientRect().height));
      out.barH = [...document.querySelectorAll('.area')].map((e) => Math.round(e.getBoundingClientRect().height));
      const tallBar = document.querySelector('.bar.tone-good'); out.bar100 = tallBar ? Math.round(tallBar.getBoundingClientRect().height) : null;
      out.pageH = Math.round(document.querySelector('.yt-page')?.getBoundingClientRect().height ?? 0);
      out.areaW = document.querySelector('.col') ? Math.round(document.querySelector('.col').getBoundingClientRect().width) : null;
      return out;
    });
    if (args.includes('--fonts')) {
      const f = await page.evaluate(() => {
        const rows = new Map();
        for (const el of document.querySelectorAll('app-overview-page *')) {
          if (el.closest('.sr-only') || el.closest('svg')) continue;
          const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
          if (!own) continue;
          const px = Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10;
          const where = (el.closest('[class]')?.className?.toString() || el.tagName).split(' ')[0] + '>' + (el.className?.toString().split(' ')[0] || el.tagName.toLowerCase());
          const k = px + '|' + where;
          if (!rows.has(k)) rows.set(k, own.slice(0, 28));
        }
        const lbl = document.querySelector('.col:last-child .lbl'), parts = [...(lbl?.children || [])].map((c) => c.className + ':' + Math.round(c.getBoundingClientRect().height));
        return { rows: [...rows.entries()].sort((x, y) => parseFloat(x[0]) - parseFloat(y[0])), lbl: lbl ? Math.round(lbl.getBoundingClientRect().height) : null, parts, nowH: Math.round(document.querySelector('.now')?.getBoundingClientRect().height ?? 0), line: getComputedStyle(lbl || document.body).lineHeight };
      });
      console.log('--- ขนาดตัวอักษร (px | ที่ | ตัวอย่างข้อความ)'); for (const [k, t] of f.rows) console.log('  ' + k.replace('|', ' | ') + ' | ' + t);
      console.log('--- แถวป้ายใต้แท่ง (คอลัมน์วันนี้) สูงรวม', f.lbl, 'line-height', f.line, 'ส่วนประกอบ', f.parts.join(', '), 'วันนี้สูง', f.nowH);
    }
    const tag = `${state} ${w}x${h} s${scale}`;
    const probs = [];
    if (m.overflowX > 0) probs.push(`หน้าล้นแนวนอน ${m.overflowX}px`);
    if (m.hOverflow > 0) probs.push(`โครงล้น ${m.hOverflow}px`);
    if (m.small.length) probs.push('ตัวอักษร < 16px: ' + m.small.join(', '));
    if (m.taps.length) probs.push('แตะ < 48px: ' + m.taps.join(', '));
    if (new Set(m.lblH).size > 1) probs.push('แถวป้ายสูงไม่เท่ากัน ' + m.lblH);
    console.log(probs.length ? `✘ ${tag}` : `✓ ${tag}` + (m.areaW ? `  คอลัมน์ ${m.areaW}px แท่ง100% ${m.bar100 ?? '-'}px ป้ายสูง ${m.lblH[0] ?? '-'}px หน้าสูง ${m.pageH}px` : ''));
    probs.forEach(fail);
    await ctx.close();
  }
}
await browser.close();
process.exit(bad ? 1 : 0);
