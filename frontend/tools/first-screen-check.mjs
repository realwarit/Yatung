// ตรวจ "ของสำคัญต้องอยู่ในจอแรก" ด้วย API จำลอง (ไม่ต้อง login/docker) — ต้องมี ng serve (4200)
//   node tools/first-screen-check.mjs [--stage=d2|all] [--routes=/today,…] [--strict] [--sizes=375x667,360x640] [--scales=100,112,125] [--banners=none,offline,failed]  (failed = แถบ "โหลดเวอร์ชันใหม่ไม่สำเร็จ" 2 บรรทัด ผ่าน window.ng ของ ng serve)
// กติกา (8D): element ที่ติดป้าย data-first-screen="<ชื่อ>" ต้องมีขอบล่าง ≤ ความสูงจอ − ความสูงแถบเมนูล่าง − 8px
//   และต้องไม่ถูกปุ่มสแกนกลางที่ยื่นเหนือแถบบัง ; ป้ายเดียวกันหลาย element = ใช้ตัวที่ต่ำสุด
//   ป้ายที่เป็นแถบปุ่มติดล่างจอ (position: sticky/fixed) = ตรวจว่าอยู่ในจอทั้งหมด (ขอบล่าง ≤ ความสูงจอ)
//   ก (100) และ ก+ (112) = ตัดสินผ่าน/ไม่ผ่าน · ก++ (125) = รายงานอย่างเดียว (ยอมให้เลื่อน)
//   ป้ายที่ยังไม่มีในหน้า = ข้าม (SKIP) ; ใส่ --strict ให้ถือเป็นไม่ผ่าน ; หน้าของช่วง D2 (--stage=d2 ค่าเริ่มต้น) ห้ามมีรายการ "ข้าม" — พบ = ไม่ผ่านเสมอ
// 8D ข้อ 11: ทุกหน้าตรวจ 2 แบบ — ไม่มี banner ด้านบน และมี banner 1 แถบ (ออฟไลน์ = ข้อความยาวที่สุดที่เกิดได้ทั้งในและนอก Shell ; ขยับทุกอย่างลงตาม --yt-banner-h) ; ทั้งสองแบบต้องผ่านที่ ก และ ก+
//   หน้าวันนี้ตรวจ 3 สถานะ : late (มีมื้อเลยเวลา) · before (ยังไม่ถึงมื้อแรก ต้องเห็นมื้อถัดไป) · done (กินครบ ต้องเห็นมาสคอต L)
// D2.5: หน้าที่เนื้อหาน้อย (fill) ต้องไม่มีพื้นที่ว่างใต้เนื้อหาเกิน 20% ของความสูงจอ ที่ขนาด ก (ไม่นับหน้าที่เนื้อหายาวจนเลื่อน)
// C6.3 (หน้า auth บนมือถือ): ขนาดน้องยาตรงที่ AuthShell เลือก (data-size l/m/s) ต้องเท่ากับ "ใหญ่สุดที่การ์ดฟอร์มทั้งใบพอดีจอ" ที่คำนวณซ้ำด้วยการบังคับทีละขนาด ·
//   Login ที่ ก และ ก+ ต้องได้ L หรือ M · กล่องคำพูดต้องพอดี 1 บรรทัด · placeholder ของช่องกรอกทุกช่องต้องไม่ถูกตัด (ทุกหน้า ทุกขนาดตัวอักษร)
// ตรวจเพิ่มทุกหน้า (ที่ ก ทุกขนาดจอ): ช่องกรอกทุกช่อง font-size ≥ 16px (iOS ซูมหน้าเองถ้าเล็กกว่า) · Mitr ไม่หนาเกิน 500 (ยกเว้น .num) · ไม่ล้นแนวนอน
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { FAKE_JWT, fakeThaiVoice, mockApi } from './lib/mock-app.mjs';
import { loadScanImage } from './lib/child-overflow.mjs';

const SAMPLE = resolve(process.env.SCAN_SAMPLE ?? '../docs/sample-images/yatung-test-envelope-1.png');
const BASE = process.env.BASE ?? 'http://localhost:4200';
const args = process.argv.slice(2);
const val = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const strict = args.includes('--strict');
const stage = val('stage', 'd2');
const sizes = val('sizes', '375x667,360x640').split(',').map((s) => s.split('x').map(Number));
const scales = val('scales', '100,112,125').split(',');
const banners = val('banners', 'none,offline,failed').split(',');
const SCALE_NAME = { 100: 'ก', 112: 'ก+', 125: 'ก++' };

// ป้ายที่แต่ละหน้าต้องมี (รายการตาม docs/day8d-plan.md D2/D3) ; auth:false = ไม่ login ; d3 = ยังไม่ถึงช่วงของหน้านั้น
const PAGES = [
  { route: '/today', scenarios: [
    { id: 'late', names: ['progress', 'listen', 'take-first'] },
    { id: 'before', names: ['progress', 'listen', 'next-slot'] },
    { id: 'done', names: ['progress', 'listen', 'cheer'] },
  ] },
  { route: '/welcome', auth: false, names: ['start', 'mascot'] },
  { route: '/login', auth: false, names: ['fields', 'submit'], fill: '.content .yt-disclaimer' },
  { route: '/register', auth: false, names: ['fields', 'submit'], fill: '.content .yt-disclaimer' },
  { route: '/scan', names: ['ai-notice', 'tips', 'camera', 'gallery'] },
  // สแกนมีภาพแล้ว (D3 0.6): ปุ่มหลักอยู่ในจอแรก + แถบหมุน/ถ่ายใหม่/ลบ อยู่ในกรอบภาพ (ตรวจ toolsOut)
  { route: '/scan', id: 'image', names: ['ai-notice'], after: (page) => loadScanImage(page, SAMPLE) },
  { route: '/review/1', names: ['banner', 'save-bar'] },
  // บันทึกสำเร็จ (B2): กดยืนยันช่องที่ติด flag แล้วบันทึก → น้องยาตรง L + กล่องคำพูด จัดกลางแนวตั้ง ว่างใต้เนื้อหา ≤ 20%
  { route: '/review/1', id: 'saved', names: ['saved'], fill: '.state--done .state__btns', after: async (page) => {
    for (const b of await page.getByRole('button', { name: /ถูกต้องแล้ว/ }).all()) await b.click().catch(() => {});
    await page.getByRole('button', { name: /บันทึก/ }).last().click();
    await page.waitForSelector('.state--done', { timeout: 5000 });
    await page.waitForTimeout(500);
  } },
  { route: '/medications', names: ['add', 'say'] },   // D3 ช่วง 1
  { route: '/medications/new', names: ['save'], d3: true },
  { route: '/settings', names: ['say'], d3: true },
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
          if (banner === 'failed') { await page.evaluate(() => { window.ng.getComponent(document.querySelector('app-banner-host')).svc.update.state.set('failed'); }); await page.waitForTimeout(700); }
          if (banner === 'offline') { await ctx.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline'))); await page.waitForTimeout(700); }
          if (p.after) await p.after(page);
          await page.evaluate(() => { document.querySelectorAll('*').forEach((e) => { if (e.scrollTop) e.scrollTop = 0; }); });
          const r = await page.evaluate(([names, fillSel]) => {
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
            let free = null;
            if (fillSel) {
              const el = [...document.querySelectorAll(fillSel)].pop();
              const host = document.querySelector('app-auth-shell') ?? document.querySelector('.main') ?? document.scrollingElement;
              const scrolls = host && host.scrollHeight > host.clientHeight + 1;
              free = el && !scrolls ? Math.round(((H - el.getBoundingClientRect().bottom) / H) * 100) : (scrolls ? 'scroll' : null);
            }
            const vis = (e) => e.getBoundingClientRect().width > 0;
            const cv = document.createElement('canvas').getContext('2d');
            const placeholders = [...document.querySelectorAll('input[placeholder]')].filter(vis).map((e) => {
              const cs = getComputedStyle(e);
              cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
              return { s: e.id || e.name, w: Math.round(cv.measureText(e.placeholder).width), avail: Math.round(e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) };
            });
            let auth = null;
            const shell = document.querySelector('app-auth-shell');
            if (shell && getComputedStyle(shell.querySelector('.peek')).display !== 'none') {
              const c = shell.querySelector('.content');
              const cur = c.dataset.size;
              const fits = {};
              for (const z of ['l', 'm', 's']) { c.dataset.size = z; fits[z] = shell.querySelector('.card').getBoundingClientRect().bottom - shell.getBoundingClientRect().top <= shell.clientHeight - 4; }
              c.dataset.size = cur;
              const expected = ['l', 'm', 's'].find((z) => fits[z]) ?? 's';
              const bub = [...c.querySelectorAll('.peek__bubble')].find((e) => getComputedStyle(e).display !== 'none');
              const t = bub?.querySelector('.t');
              const lines = t ? Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)) : null;
              auth = { cur, expected, fits, lines, text: t?.textContent?.trim() };
            }
            // E2/G6: ปุ่มของหน้า scan/review/today ต้องอยู่บรรทัดเดียว (ย่อเป็นป้ายสั้นเมื่อแคบ) — ตรวจจากข้อความที่มองเห็นจริง
            const barBtns = [...document.querySelectorAll('app-review-bar button, ion-button.yt-btn, [mat-flat-button], [mat-stroked-button], .yt-all, .bar__next')].filter(vis).map((b) => {
              // นับเฉพาะข้อความที่มองเห็นจริง (ข้ามข้อความ sr-only/ถูกตัด/display:none)
              const tops = new Set(); const seen = [];
              const tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
              for (let t = tw.nextNode(); t; t = tw.nextNode()) {
                const el = t.parentElement; if (!(t.textContent || '').trim()) continue;
                const cs = getComputedStyle(el); const pr = el.getBoundingClientRect();
                if (cs.display === 'none' || cs.clipPath !== 'none' || pr.width <= 2 || pr.height <= 2) continue;
                const rg = document.createRange(); rg.selectNodeContents(t);
                for (const q of rg.getClientRects()) if (q.width > 2) tops.add(Math.round(q.top / 6));
                seen.push(t.textContent.trim());
              }
              return { s: seen.join(' '), lines: tops.size, over: !b.classList.contains('bar__next') && b.scrollWidth > b.clientWidth + 1 };   // .bar__next มี ::before ขยายพื้นที่แตะ
            });
            // G6: ตัวบอกขั้นตอน — เส้นเชื่อมยาว ≥ 12px, ห่างวงกลมทั้งสองข้าง ≥ 6px, ไม่ล้นแถว
            const stp = document.querySelector('app-step-dots .steps');
            let stepper = null;
            if (stp && vis(stp)) {
              const kids = [...stp.children].map((e) => ({ k: e.classList.contains('line') ? 'line' : 'step', r: e.getBoundingClientRect() }));
              const lines = kids.filter((k) => k.k === 'line');
              const gaps = []; for (let j = 0; j < kids.length - 1; j++) gaps.push(Math.round(kids[j + 1].r.left - kids[j].r.right));
              const dots = [...stp.querySelectorAll('.dot')].map((d) => d.getBoundingClientRect());
              const sr = stp.getBoundingClientRect();
              const minLine = Math.round(Math.min(...lines.map((l) => l.r.width)));
              const maxLine = Math.round(Math.max(...lines.map((l) => l.r.width)));
              const lineGap = Math.round(Math.min(...lines.map((l, j) => Math.min(l.r.left - dots[j].right, dots[j + 1].left - l.r.right))));
              stepper = { minLine, maxLine, lineGap, over: kids.some((k) => k.r.right > sr.right + 0.5 || k.r.left < sr.left - 0.5) || stp.scrollWidth > stp.clientWidth + 1, left: Math.round(sr.left), width: Math.round(sr.width) };
            }
            const fr = document.querySelector('.frame--image')?.getBoundingClientRect();
            const toolsOut = fr ? [...document.querySelectorAll('.frame--image .tool')].map((e) => e.getBoundingClientRect()).filter((b) => b.left < fr.left - 0.5 || b.right > fr.right + 0.5 || b.top < fr.top - 0.5 || b.bottom > fr.bottom + 0.5).length : null;
            const toolSize = fr ? [...document.querySelectorAll('.frame--image .tool')].map((e) => Math.round(e.getBoundingClientRect().height)) : [];
            return { toolsOut, toolSize, items, barBtns, stepper, inputs, mitr, placeholders, auth, scrollers, free, bannerH: Math.round(bannerH), bannerCount: document.querySelectorAll('[data-banner]').length };
          }, [sc.names, p.fill ?? null]);
          // G2: เลื่อนสุดแล้ว ข้อความสุดท้ายของหน้า (รวม disclaimer) ต้องไม่ถูกแถบเมนู/ปุ่มสแกน/แถบปุ่มติดล่างทับ
          const tail = await page.evaluate(() => {
            const sc = [document.scrollingElement, document.querySelector('.main'), document.querySelector('app-auth-shell'), document.querySelector('.yt-page')].filter(Boolean);
            sc.forEach((e) => { e.scrollTop = e.scrollHeight; });
            const root = document.querySelector('.yt-page');
            if (!root) return null;
            const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
            const covers = [document.querySelector('nav.bottom'), document.querySelector('.scan__btn'), ...root.querySelectorAll('*')].filter((e) => e && vis(e) && (/^(sticky|fixed)$/.test(getComputedStyle(e).position) || e.matches('nav.bottom, .scan__btn')));
            const coverR = covers.map((e) => e.getBoundingClientRect());
            const texts = [];
            const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            for (let t = tw.nextNode(); t; t = tw.nextNode()) {
              if (!(t.textContent || '').trim()) continue;
              const el = t.parentElement;
              if (!vis(el) || covers.some((c) => c.contains(el)) || el.closest('.cdk-visually-hidden, .sr-only, [aria-hidden=true]')) continue;
              const rg = document.createRange(); rg.selectNodeContents(t);
              for (const q of rg.getClientRects()) if (q.width > 1 && q.height > 1) texts.push({ q, s: t.textContent.trim().slice(0, 24) });
            }
            if (!texts.length) return null;
            const last = texts.reduce((a, b) => (b.q.bottom > a.q.bottom ? b : a));
            const hit = coverR.some((c) => last.q.left < c.right && last.q.right > c.left && last.q.top < c.bottom && last.q.bottom > c.top);
            return { s: last.s, bottom: Math.round(last.q.bottom), hit, H: window.innerHeight };
          });
          const tag = `${p.route}${p.id ? ' [' + p.id + ']' : ''}${sc.id ? ' [' + sc.id + ']' : ''}${banner !== 'none' ? ' +banner(' + banner + ')' : ''} @${w}x${h} ${SCALE_NAME[scale]}`;
          // Register: ก+ และ ก++ ยอมให้เลื่อน (ฟอร์ม 4 ช่อง ; ตามที่ D2 ตัดสิน) — รายงานอย่างเดียว
          const hard = scale !== '125' && !(p.route === '/register' && scale === '112');
          const lines = [];
          if (banner !== 'none' && r.bannerCount !== 1) { fail++; lines.push(`✘ ต้องมี banner 1 แถบพอดี (พบ ${r.bannerCount})`); }
          if (banner !== 'none' && r.bannerCount === 1) lines.push(`ⓘ banner สูง ${r.bannerH}px`);
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
          if (p.fill && scale === '100' && banner === 'none') {
            if (r.free === 'scroll') lines.push('ⓘ ว่างใต้เนื้อหา: หน้าเลื่อนได้ (เนื้อหายาวกว่าจอ)');
            else if (r.free === null) { fail++; lines.push('✘ ว่างใต้เนื้อหา: ไม่พบองค์ประกอบ ' + p.fill); }
            else if (r.free > 20) { fail++; lines.push(`✘ ว่างใต้เนื้อหา ${r.free}% > 20% ของความสูงจอ`); }
            else { ok++; lines.push(`✓ ว่างใต้เนื้อหา ${r.free}% ≤ 20%`); }
          }
          if (scale === '100' && banner === 'none') {
            const small = r.inputs.filter((x) => x.fs < 16);
            if (small.length) { fail++; lines.push(`✘ ช่องกรอกเล็กกว่า 16px: ${small.map((x) => `${x.s}=${x.fs}`).join(', ')}`); }
            if (r.mitr.length) { fail++; lines.push(`✘ Mitr หนาเกิน 500: ${r.mitr.join(', ')}`); }
          }
          for (const x of r.placeholders) {
            if (x.w > x.avail + 0.5) { fail++; lines.push(`✘ placeholder ถูกตัด ${x.s}: ต้องการ ${x.w}px มี ${x.avail}px`); }
          }
          if (r.auth) {
            const a = r.auth;
            if (a.cur !== a.expected) { fail++; lines.push(`✘ ขนาดน้องยาตรง ${a.cur.toUpperCase()} ≠ ที่ควรได้ ${a.expected.toUpperCase()} (พอดีจอ: ${JSON.stringify(a.fits)})`); }
            else { ok++; lines.push(`✓ ขนาดน้องยาตรง ${a.cur.toUpperCase()} (ใหญ่สุดที่พอดีจอ: ${JSON.stringify(a.fits)})`); }
            // กติกา L→M→S: จอเตี้ยมาก (เช่น 320×568 ที่ ก+) ฟอร์มเต็มจอจน M ไม่พอดี การได้ S จึงถูกต้อง ; ผิดเฉพาะเมื่อ M พอดีแต่ยังได้ S
            if (p.route === '/login' && scale !== '125' && a.cur === 's' && a.fits.m) { fail++; lines.push('✘ Login ก/ก+ ต้องได้ L หรือ M'); }
            if (a.lines !== 1) { fail++; lines.push(`✘ กล่องคำพูด ${a.lines} บรรทัด (ต้อง 1): ${a.text}`); }
          }
          if (r.stepper) {
            const t = r.stepper;
            if (t.minLine < 12 || t.lineGap < 6 || t.maxLine > 120.5 || t.over) { fail++; lines.push(`✘ stepper: เส้นสั้นสุด ${t.minLine}px (ต้อง ≥ 12) · ห่างวงกลม ${t.lineGap}px (ต้อง ≥ 6) · เส้นยาวสุด ${t.maxLine}px (≤ 120)${t.over ? ' · ล้นแถว' : ''}`); }
            else { ok++; lines.push(`✓ stepper: เส้น ${t.minLine}–${t.maxLine}px · ห่างวงกลม ${t.lineGap}px`); }
          }
          for (const b of r.barBtns) {
            if (b.lines > 1 || b.over) { fail++; lines.push(`✘ ปุ่มใน review bar ตัดบรรทัด/ล้น: "${b.s}" (${b.lines} บรรทัด)`); }
            else { ok++; lines.push(`✓ ปุ่ม review bar บรรทัดเดียว: "${b.s}"`); }
          }
          if (r.toolsOut !== null) {
            if (r.toolsOut || r.toolSize.some((x) => x !== 48)) { fail++; lines.push(`✘ แถบเครื่องมือรูป: ล้นกรอบ ${r.toolsOut} ปุ่ม · ความสูง ${r.toolSize.join('/')}px (ต้อง 48)`); }
            else { ok++; lines.push('✓ แถบเครื่องมือรูปอยู่ในกรอบภาพ ปุ่ม 48px'); }
          }
          if (tail) {
            if (tail.hit) { fail++; lines.push(`✘ ข้อความสุดท้ายถูกแถบเมนู/ปุ่มทับ: "${tail.s}" ล่าง ${tail.bottom}/${tail.H}`); }
            else { ok++; lines.push(`✓ ข้อความสุดท้ายไม่ถูกทับ (ล่าง ${tail.bottom}/${tail.H})`); }
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
