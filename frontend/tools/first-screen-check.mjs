// ตรวจ "ของสำคัญต้องอยู่ในจอแรก" ด้วย API จำลอง (ไม่ต้อง login/docker) — ต้องมี ng serve (4200)
//   node tools/first-screen-check.mjs [--stage=d2|all] [--routes=/today,…] [--strict] [--sizes=375x667,360x640] [--scales=100,112,125] [--banners=none,offline]
// กติกา (8D): element ที่ติดป้าย data-first-screen="<ชื่อ>" ต้องมีขอบล่าง ≤ ความสูงจอ − ความสูงแถบเมนูล่าง − 8px
//   และต้องไม่ถูกปุ่มสแกนกลางที่ยื่นเหนือแถบบัง ; ป้ายเดียวกันหลาย element = ใช้ตัวที่ต่ำสุด
//   ป้ายที่เป็นแถบปุ่มติดล่างจอ (position: sticky/fixed) = ตรวจว่าอยู่ในจอทั้งหมด (ขอบล่าง ≤ ความสูงจอ)
//   ก (100) และ ก+ (112) = ตัดสินผ่าน/ไม่ผ่าน · ก++ (125) = รายงานอย่างเดียว (ยอมให้เลื่อน)
//   ป้ายที่ยังไม่มีในหน้า = ข้าม (SKIP) ; ใส่ --strict ให้ถือเป็นไม่ผ่าน ; หน้าของช่วง D2 (--stage=d2 ค่าเริ่มต้น) ห้ามมีรายการ "ข้าม" — พบ = ไม่ผ่านเสมอ
// 8D ข้อ 11: ทุกหน้าตรวจ 2 แบบ — ไม่มี banner ด้านบน และมี banner 1 แถบ (ออฟไลน์ = ข้อความยาวที่สุดที่เกิดได้ทั้งในและนอก Shell ; ขยับทุกอย่างลงตาม --yt-banner-h) ; ทั้งสองแบบต้องผ่านที่ ก และ ก+
//   หน้าวันนี้ตรวจ 3 สถานะ : late (มีมื้อเลยเวลา) · before (ยังไม่ถึงมื้อแรก ต้องเห็นมื้อถัดไป) · done (กินครบ ต้องเห็นมาสคอต L)
// ตรวจเพิ่มทุกหน้า (ที่ ก ทุกขนาดจอ): ช่องกรอกทุกช่อง font-size ≥ 16px (iOS ซูมหน้าเองถ้าเล็กกว่า) · Mitr ไม่หนาเกิน 500 (ยกเว้น .num) · ไม่ล้นแนวนอน
import { chromium } from 'playwright';
import { FAKE_JWT, fakeThaiVoice, mockApi } from './lib/mock-app.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const args = process.argv.slice(2);
const val = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const strict = args.includes('--strict');
const stage = val('stage', 'd2');
const sizes = val('sizes', '375x667,360x640').split(',').map((s) => s.split('x').map(Number));
const scales = val('scales', '100,112,125').split(',');
const banners = val('banners', 'none,offline').split(',');
const SCALE_NAME = { 100: 'ก', 112: 'ก+', 125: 'ก++' };

// ป้ายที่แต่ละหน้าต้องมี (รายการตาม docs/day8d-plan.md D2/D3) ; auth:false = ไม่ login ; d3 = ยังไม่ถึงช่วงของหน้านั้น
const PAGES = [
  { route: '/today', scenarios: [
    { id: 'late', names: ['progress', 'listen', 'take-first'] },
    { id: 'before', names: ['progress', 'listen', 'next-slot'] },
    { id: 'done', names: ['progress', 'listen', 'cheer'] },
  ] },
  { route: '/login', auth: false, names: ['fields', 'submit'] },
  { route: '/register', auth: false, names: ['fields', 'submit'] },
  { route: '/scan', names: ['ai-notice', 'tips', 'camera', 'gallery'] },
  { route: '/review/1', names: ['banner', 'save-bar'] },
  { route: '/medications', names: ['add', 'rows-3'], d3: true },
  { route: '/medications/new', names: ['save'], d3: true },
  { route: '/settings', names: ['slot-times'], d3: true },
  { route: '/overview', names: [], d3: true },
];
const only = val('routes', '').split(',').filter(Boolean);
const pages = PAGES.filter((p) => (!only.length || only.includes(p.route)) && (stage === 'all' || !p.d3));

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
let fail = 0, skip = 0, ok = 0, info = 0;
for (const [w, h] of sizes) {
  for (const scale of scales) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([s]) => { try { localStorage.setItem('yatung_font_scale_v2', s); localStorage.setItem('yatung_font_hint_off', '1'); } catch {} }, [scale]);
    await fakeThaiVoice(ctx);   // มือถือจริงมีเสียงไทย → ปุ่ม 🔊 แสดง (ไม่มีเสียง = ปุ่มหาย ตรวจตำแหน่งไม่ได้)
    for (const p of pages) {
      for (const sc of p.scenarios ?? [{ id: null, names: p.names }]) {
        for (const banner of banners) {
          const page = await ctx.newPage();
          await mockApi(page, { today: () => sc.id ?? 'late' });
          // localStorage ใช้ร่วมกันทั้ง context: หน้า auth ต้องล้าง token ที่หน้าก่อนหน้าตั้งไว้ ไม่งั้น guestGuard พาไป /today
          if (p.auth === false) await page.addInitScript(() => { try { localStorage.removeItem('yatung_token'); localStorage.removeItem('yatung_user'); } catch {} });
          if (p.auth !== false) await page.addInitScript(([tok]) => { try { localStorage.setItem('yatung_token', tok); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); } catch {} }, [FAKE_JWT]);
          await page.goto(BASE + p.route);
          await page.waitForLoadState('networkidle').catch(() => {});
          await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
          await page.waitForTimeout(500);
          if (banner === 'offline') { await ctx.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline'))); await page.waitForTimeout(700); }
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
              const sticky = els.some((e) => /sticky|fixed/.test(getComputedStyle(e).position));   // แถบปุ่มติดล่างจอ: ตรวจว่าอยู่ในจอทั้งหมด ไม่ใช่เหนือแถบเมนู
              const hitsFab = !sticky && !!fab && rects.some((b) => b.left < fab.right && b.right > fab.left && b.top < fab.bottom && b.bottom > fab.top);
              return { n, bottom: Math.round(bottom), limit: Math.round(sticky ? H : limit), hitsFab, sticky };
            });
            const inputs = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea, select')]
              .filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ s: e.tagName.toLowerCase() + (e.id ? '#' + e.id : ''), fs: parseFloat(getComputedStyle(e).fontSize) }));
            const mitr = [...document.querySelectorAll('body *')].filter((e) => {
              const cs = getComputedStyle(e);
              return cs.fontFamily.startsWith('Mitr') && Number(cs.fontWeight) > 500 && e.getBoundingClientRect().width > 0 && (e.textContent || '').trim();
            }).slice(0, 5).map((e) => e.tagName.toLowerCase() + '.' + [...e.classList].slice(0, 2).join('.') + ' w' + getComputedStyle(e).fontWeight);
            const doc = document.documentElement;
            const scrollers = [doc, document.body, ...document.querySelectorAll('.main, .yt-page')].filter((e) => e.scrollWidth > e.clientWidth + 1).length;
            const bannerH = document.querySelector('[data-banner]')?.getBoundingClientRect().height ?? 0;
            return { items, inputs, mitr, scrollers, bannerH: Math.round(bannerH), bannerCount: document.querySelectorAll('[data-banner]').length };
          }, sc.names);
          const tag = `${p.route}${sc.id ? ' [' + sc.id + ']' : ''}${banner === 'offline' ? ' +banner' : ''} @${w}x${h} ${SCALE_NAME[scale]}`;
          const hard = scale !== '125';
          const lines = [];
          if (banner === 'offline' && r.bannerCount !== 1) { fail++; lines.push(`✘ ต้องมี banner 1 แถบพอดี (พบ ${r.bannerCount})`); }
          if (banner === 'offline' && r.bannerCount === 1) lines.push(`ⓘ banner สูง ${r.bannerH}px`);
          for (const it of r.items) {
            if (it.missing) {
              skip++;
              if ((strict || stage === 'd2') && hard) { fail++; lines.push(`✘ ${it.n}: ยังไม่ติดป้าย (หน้าช่วง D2 ห้ามข้าม)`); } else lines.push(`– ${it.n}: ยังไม่ติดป้าย`);
              continue;
            }
            const bad = it.bottom > it.limit || it.hitsFab;
            if (!hard) { info++; lines.push(`ⓘ ${it.n}: ล่าง ${it.bottom} / ขีด ${it.limit}${it.hitsFab ? ' ถูกปุ่มสแกนบัง' : ''}${bad ? ' (เลื่อนได้ ก++)' : ''}`); }
            else if (bad) { fail++; lines.push(`✘ ${it.n}: ล่าง ${it.bottom} > ขีด ${it.limit}${it.hitsFab ? ' / ถูกปุ่มสแกนบัง' : ''}`); }
            else { ok++; lines.push(`✓ ${it.n}: ล่าง ${it.bottom} ≤ ${it.limit}`); }
          }
          if (scale === '100' && banner === 'none') {
            const small = r.inputs.filter((x) => x.fs < 16);
            if (small.length) { fail++; lines.push(`✘ ช่องกรอกเล็กกว่า 16px: ${small.map((x) => `${x.s}=${x.fs}`).join(', ')}`); }
            if (r.mitr.length) { fail++; lines.push(`✘ Mitr หนาเกิน 500: ${r.mitr.join(', ')}`); }
          }
          if (r.scrollers) { fail++; lines.push(`✘ ล้นแนวนอน ${r.scrollers} ตัว`); }
          console.log(`${tag}\n   ${lines.join('\n   ') || '(ไม่มีป้าย)'}`);
          await ctx.setOffline(false);
          await page.close();
        }
      }
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`\nสรุป: ผ่าน ${ok} · ไม่ผ่าน ${fail} · ข้าม (ยังไม่ติดป้าย) ${skip} · รายงาน ก++ ${info}`);
process.exit(fail ? 1 : 0);
