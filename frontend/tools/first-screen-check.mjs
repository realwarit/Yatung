// ตรวจ "ของสำคัญต้องอยู่ในจอแรก" ด้วย API จำลอง (ไม่ต้อง login/docker) — ต้องมี ng serve (4200)
//   node tools/first-screen-check.mjs [--routes=/today,…] [--strict] [--sizes=375x667,360x640] [--scales=100,112,125]
// กติกา (8D): element ที่ติดป้าย data-first-screen="<ชื่อ>" ต้องมีขอบล่าง ≤ ความสูงจอ − ความสูงแถบเมนูล่าง − 8px
//   และต้องไม่ถูกปุ่มสแกนกลางที่ยื่นเหนือแถบบัง ; ป้ายเดียวกันหลาย element = ใช้ตัวที่ต่ำสุด
//   ก (100) และ ก+ (112) = ตัดสินผ่าน/ไม่ผ่าน · ก++ (125) = รายงานอย่างเดียว (ยอมให้เลื่อน)
//   ป้ายที่ยังไม่มีในหน้า = ข้าม (SKIP) ; ใส่ --strict ให้ถือเป็นไม่ผ่าน
// ตรวจเพิ่มทุกหน้า (ที่ ก ทุกขนาดจอ): ช่องกรอกทุกช่อง font-size ≥ 16px (iOS ซูมหน้าเองถ้าเล็กกว่า) · Mitr ไม่หนาเกิน 500 (ยกเว้น .num) · ไม่ล้นแนวนอน
import { chromium } from 'playwright';
import { FAKE_JWT, mockApi } from './lib/mock-app.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const args = process.argv.slice(2);
const val = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const strict = args.includes('--strict');
const sizes = val('sizes', '375x667,360x640').split(',').map((s) => s.split('x').map(Number));
const scales = val('scales', '100,112,125').split(',');
const SCALE_NAME = { 100: 'ก', 112: 'ก+', 125: 'ก++' };

// ป้ายที่แต่ละหน้าต้องมี (รายการตาม docs/day8d-plan.md D2/D3) ; auth:false = ไม่ login
const PAGES = [
  { route: '/today', names: ['progress', 'listen', 'take-first'] },
  { route: '/login', auth: false, names: ['fields', 'submit'] },
  { route: '/register', auth: false, names: ['fields', 'submit'] },
  { route: '/scan', names: ['ai-notice', 'tips', 'camera', 'gallery'] },
  { route: '/review/1', names: ['banner', 'save-bar'] },
  { route: '/medications', names: ['add', 'rows-3'] },
  { route: '/medications/new', names: ['save'] },
  { route: '/settings', names: ['slot-times'] },
  { route: '/overview', names: [] },
];
const only = val('routes', '').split(',').filter(Boolean);
const pages = PAGES.filter((p) => !only.length || only.includes(p.route));

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
let fail = 0, skip = 0, ok = 0, info = 0;
for (const [w, h] of sizes) {
  for (const scale of scales) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([s]) => { try { localStorage.setItem('yatung_font_scale_v2', s); localStorage.setItem('yatung_font_hint_off', '1'); } catch {} }, [scale]);
    for (const p of pages) {
      const page = await ctx.newPage();
      await mockApi(page);
      if (p.auth !== false) await page.addInitScript(([tok]) => { try { localStorage.setItem('yatung_token', tok); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); } catch {} }, [FAKE_JWT]);
      await page.goto(BASE + p.route);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
      await page.waitForTimeout(500);
      await page.evaluate(() => { document.querySelectorAll('*').forEach((e) => { if (e.scrollTop) e.scrollTop = 0; }); });
      const r = await page.evaluate((names) => {
        const H = window.innerHeight;
        const nav = document.querySelector('nav.bottom');
        const navR = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect() : null;
        const limit = H - (navR ? navR.height : 0) - 8;
        const fab = document.querySelector('.scan__btn')?.getBoundingClientRect();
        const items = names.map((n) => {
          const els = [...document.querySelectorAll(`[data-first-screen="${n}"]`)];
          if (!els.length) return { n, missing: true };
          const rects = els.map((e) => e.getBoundingClientRect());
          const bottom = Math.max(...rects.map((b) => b.bottom));
          const hitsFab = !!fab && rects.some((b) => b.left < fab.right && b.right > fab.left && b.top < fab.bottom && b.bottom > fab.top);
          return { n, bottom: Math.round(bottom), limit: Math.round(limit), hitsFab };
        });
        const inputs = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea, select')]
          .filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ s: e.tagName.toLowerCase() + (e.id ? '#' + e.id : ''), fs: parseFloat(getComputedStyle(e).fontSize) }));
        const mitr = [...document.querySelectorAll('body *')].filter((e) => {
          const cs = getComputedStyle(e);
          return cs.fontFamily.startsWith('Mitr') && Number(cs.fontWeight) > 500 && e.getBoundingClientRect().width > 0 && (e.textContent || '').trim();
        }).slice(0, 5).map((e) => e.tagName.toLowerCase() + '.' + [...e.classList].slice(0, 2).join('.') + ' w' + getComputedStyle(e).fontWeight);
        const doc = document.documentElement;
        const scrollers = [doc, document.body, ...document.querySelectorAll('.main, .yt-page')].filter((e) => e.scrollWidth > e.clientWidth + 1).length;
        return { items, inputs, mitr, scrollers };
      }, p.names);
      const tag = `${p.route} @${w}x${h} ${SCALE_NAME[scale]}`;
      const hard = scale !== '125';
      const lines = [];
      for (const it of r.items) {
        if (it.missing) { skip++; if (strict && hard) { fail++; lines.push(`✘ ${it.n}: ยังไม่ติดป้าย (strict)`); } else lines.push(`– ${it.n}: ยังไม่ติดป้าย`); continue; }
        const bad = it.bottom > it.limit || it.hitsFab;
        if (!hard) { info++; lines.push(`ⓘ ${it.n}: ล่าง ${it.bottom} / ขีด ${it.limit}${it.hitsFab ? ' ถูกปุ่มสแกนบัง' : ''}${bad ? ' (เลื่อนได้ ก++)' : ''}`); }
        else if (bad) { fail++; lines.push(`✘ ${it.n}: ล่าง ${it.bottom} > ขีด ${it.limit}${it.hitsFab ? ' / ถูกปุ่มสแกนบัง' : ''}`); }
        else { ok++; lines.push(`✓ ${it.n}: ล่าง ${it.bottom} ≤ ${it.limit}`); }
      }
      if (scale === '100') {
        const small = r.inputs.filter((x) => x.fs < 16);
        if (small.length) { fail++; lines.push(`✘ ช่องกรอกเล็กกว่า 16px: ${small.map((x) => `${x.s}=${x.fs}`).join(', ')}`); }
        if (r.mitr.length) { fail++; lines.push(`✘ Mitr หนาเกิน 500: ${r.mitr.join(', ')}`); }
      }
      if (r.scrollers) { fail++; lines.push(`✘ ล้นแนวนอน ${r.scrollers} ตัว`); }
      console.log(`${tag}\n   ${lines.join('\n   ') || '(ไม่มีป้าย)'}`);
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`\nสรุป: ผ่าน ${ok} · ไม่ผ่าน ${fail} · ข้าม (ยังไม่ติดป้าย) ${skip} · รายงาน ก++ ${info}`);
process.exit(fail ? 1 : 0);
