// ตรวจ "ล้นแนวนอน" ของสถานะที่เกิดทีหลังโหลดหน้า (8C) + ถ่ายภาพ ก (100%) ที่ 360px → docs/screenshots/day8/state-<ชื่อ>.png
//   สถานะ: offline-bar · offline-tap-once (แตะปุ่มที่กดไม่ได้ตอนออฟไลน์ → ข้อความครั้งเดียว) · kb-login/kb-med-form/kb-desktop-none (กลไก kb-open) · conn-expired · install-android · install-ios · font-hint (8D: ข้อความด้านบนเป็น yt-banner ครั้งละ 1 แถบ ตรวจทุกสถานะ)
//   node tools/state-check.mjs [--widths=320,360,375,412] [--scales=100,112,125] [--only=install-ios,…]   (ต้องมี ng serve 4200 ; ไม่ต้อง login/docker)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { FAKE_JWT, mockApi } from './lib/mock-app.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const args = process.argv.slice(2);
const val = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const widths = val('widths', '320,360,375,412').split(',').map(Number);
const scales = val('scales', '100,112,125').split(',');
const only = val('only', '').split(',').filter(Boolean);
const OUT = new URL('../../docs/screenshots/day8/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const fakePrompt = () => { const e = new Event('beforeinstallprompt'); e.prompt = async () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); };

// ctx = ตัวเลือกของ context ; run(page, {ctx, html}) เตรียมสถานะ ; shot = ถ่ายอะไร (ค่าเริ่มต้นทั้งจอ) ; expect = ข้อความที่ต้องเห็น
const STATES = [
  { name: 'offline-bar', run: async (p, c) => { await c.ctx.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event('offline'))); }, expect: 'ออฟไลน์|ไม่มีอินเทอร์เน็ต|ต่ออินเทอร์เน็ต' },
  { name: 'offline-tap-once', run: async (p, c) => {
      await c.ctx.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event('offline'))); await p.waitForTimeout(500);
      const hint = () => p.evaluate(() => (document.body.innerText.match(/ต่ออินเทอร์เน็ตก่อนนะคะ/g) ?? []).length);
      if (await hint() !== 0) c.issues.push('ข้อความ "ต่ออินเทอร์เน็ตก่อนนะคะ" แสดงก่อนผู้ใช้แตะปุ่ม (ต้องไม่มีใต้ทุกแถว)');
      const btns = p.locator('button.take[aria-disabled="true"]');
      if (await btns.count() < 2) { c.issues.push('ไม่พบปุ่ม "กินแล้ว" ที่ aria-disabled อย่างน้อย 2 ปุ่ม'); return; }
      // แตะครั้งแรก → ต้องเห็นข้อความภายใน 1 วินาที (poll ทันที ไม่รอจน snackbar หาย)
      await btns.nth(0).click({ force: true });
      const t0 = Date.now(); let n = 0;
      while (Date.now() - t0 < 1000 && (n = await hint()) < 1) await p.waitForTimeout(50);
      if (n < 1) c.issues.push('แตะปุ่มครั้งแรกแล้วไม่เห็นข้อความ "ต่ออินเทอร์เน็ตก่อนนะคะ" ภายใน 1 วินาที');
      // แตะซ้ำขณะข้อความยังอยู่ → ต้องเหลือ 1 (ไม่ซ้อน) ; ยืนยันก่อนว่าข้อความยังอยู่จริง ไม่ให้ผ่านเพราะหายไปแล้ว
      if (n >= 1) {
        await btns.nth(1).dispatchEvent('click');   // ไม่ใช้เมาส์: ข้อความที่แสดงอยู่อาจทับปุ่มที่สอง (ขึ้นกับเลย์เอาต์) แล้วคลิกไปโดนข้อความจนปิด await p.waitForTimeout(200);
        const after = await hint();
        if (after !== 1) c.issues.push('แตะซ้ำขณะข้อความยังอยู่ ต้องมีข้อความ 1 ข้อความพอดี (พบ ' + after + ')');
      }
      if (await p.locator('button.take[aria-disabled="true"]').count() < 2) c.issues.push('ปุ่มหายหลังแตะ');
    }, expect: '.' },   // ข้อความถูกตรวจใน run แล้ว (snackbar หายเองใน 5 วินาที จึงไม่เช็กซ้ำตอนท้าย)
  { name: 'conn-expired', run: async (p, c) => { c.html.on = true; await p.reload(); }, expect: 'หมดอายุ' },
  { name: 'install-android', run: async (p) => { await p.evaluate(fakePrompt); }, expect: 'ติดตั้ง' },
  { name: 'today-error-ref', route: '/today', st: { todayStatus: 502 }, expect: '[(]E-502[)]' },
  { name: 'settings-dev', route: '/settings', st: { demo: true }, seedLog: true, expect: 'ข้อมูลสำหรับผู้พัฒนา[\\s\\S]*E-304', shot: 'app-dev-info-section' },
  { name: 'font-hint', noFont: true, expect: 'ปรับขนาดตัวอักษรให้ใหญ่ขึ้นได้ที่ ตั้งค่า' },
  { name: 'banner-one-at-a-time', run: async (p, c) => { await c.ctx.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event('offline'))); await p.evaluate(fakePrompt); }, noFont: true, expect: 'ออฟไลน์', only1: true },
  { name: 'kb-login', route: '/login', guest: true, expect: 'เข้าสู่ระบบ', run: async (p, c) => {
      const on = () => p.evaluate(() => document.documentElement.classList.contains('kb-open'));
      await p.locator('#email').click(); await p.waitForTimeout(250);
      if (!await on()) c.issues.push('โฟกัสช่องอีเมลแล้วต้องมี kb-open');
      await p.locator('#password').click(); await p.waitForTimeout(40);
      if (!await on()) c.issues.push('ย้ายระหว่างช่อง kb-open ต้องไม่หลุด (กะพริบ)');
      await p.waitForTimeout(250);
      if (!await on()) c.issues.push('โฟกัสช่องรหัสผ่านแล้วต้องมี kb-open');
      const rect = await p.locator('button[type=submit]').boundingBox();
      const vh = p.viewportSize().height;
      if (!rect || rect.y + rect.height > vh) c.issues.push('ปุ่มยืนยันอยู่นอกจอตอนช่องกรอกโฟกัส');
      await p.locator('button[type=submit]').focus(); await p.waitForTimeout(250);
      if (await on()) c.issues.push('โฟกัสไปปุ่มแล้ว kb-open ต้องหลุด');
    } },
  { name: 'kb-med-form', route: '/medications/new', expect: 'บันทึก', run: async (p, c) => {
      const on = () => p.evaluate(() => document.documentElement.classList.contains('kb-open'));
      const nav = () => p.evaluate(() => { const n = document.querySelector('nav.bottom'); return n ? getComputedStyle(n).display : 'none'; });
      if (await nav() === 'none') c.issues.push('ก่อนโฟกัสต้องเห็นแถบเมนูล่าง');
      await p.locator('input[type=text]').first().click(); await p.waitForTimeout(250);
      if (!await on()) c.issues.push('โฟกัสช่องข้อความแล้วต้องมี kb-open');
      if (await nav() !== 'none') c.issues.push('มี kb-open แล้วแถบเมนูล่างต้องซ่อน');
      const save = p.getByRole('button', { name: /^บันทึก/ }).last();
      if (!await save.isVisible()) c.issues.push('ปุ่มบันทึก (แถบปุ่มติดล่าง) ต้องยังแสดงตอนคีย์บอร์ดเปิด');
      await p.locator('body').click({ position: { x: 2, y: 2 } }).catch(() => {}); await p.evaluate(() => document.activeElement?.blur()); await p.waitForTimeout(250);
      if (await on()) c.issues.push('ออกจากช่องแล้ว kb-open ต้องหลุด');
      if (await nav() === 'none') c.issues.push('ออกจากช่องแล้วแถบเมนูล่างต้องกลับมา');
    } },
  { name: 'kb-desktop-none', route: '/medications/new', widths: [1366], expect: 'บันทึก', run: async (p, c) => {
      await p.locator('input[type=text]').first().click(); await p.waitForTimeout(250);
      if (await p.evaluate(() => document.documentElement.classList.contains('kb-open'))) c.issues.push('จอ ≥ 1024px ต้องไม่ใส่ kb-open');
    } },
  ...['/login', '/register'].map((route) => ({ name: 'font-toggle' + route.replace('/', '-'), route, guest: true, noFont: true, height: 640, widths: [360], expect: 'รหัสผ่าน', run: async (p, c) => {
      // จำลองผู้ใช้จริง: เปิดที่ ก → กด ก++ → วัด → กด ก → วัด (ล้นขวาหลังสลับขนาด)
      const wide = () => p.evaluate(() => {
        const cw = document.documentElement.clientWidth;
        const sc = [document.documentElement, document.body, ...document.querySelectorAll('app-auth-shell, .main, .yt-page')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => `${e.tagName.toLowerCase()} scrollWidth ${e.scrollWidth} > ${e.clientWidth}`);
        const ov = [...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > cw + 0.5 && getComputedStyle(e).position !== 'fixed' && !e.closest('.bg, .cdk-visually-hidden, .cdk-live-announcer-element'); }).slice(0, 5).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 2).join('.')} right=${Math.round(e.getBoundingClientRect().right)}`);
        return [...sc, ...ov];
      });
      for (const [label, name] of [['ก++', 'ตัวอักษรขนาดใหญ่มาก'], ['ก+', 'ตัวอักษรขนาดใหญ่'], ['ก', 'ตัวอักษรขนาดปกติ'], ['ก++', 'ตัวอักษรขนาดใหญ่มาก'], ['ก', 'ตัวอักษรขนาดปกติ']]) {
        await p.getByRole('button', { name, exact: true }).click(); await p.waitForTimeout(400);
        for (const x of await wide()) c.issues.push(`หลังกด ${label}: ${x}`);
      }
    } })),
  { name: 'install-ios', ctxOpts: { userAgent: IOS_UA }, expect: 'หน้าจอโฮม|เพิ่ม' },
];

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
let bad = 0, total = 0;
for (const st of STATES.filter((s) => !only.length || only.includes(s.name))) {
  for (const scale of scales) {
    for (const w of st.widths ?? widths) {
      if (st.widths && scale !== '100') continue;   // สถานะกว้างเฉพาะ (จอคอม) ตรวจที่ ก ครั้งเดียว
      const ctx = await browser.newContext({ viewport: { width: w, height: st.height ?? 800 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...(st.ctxOpts ?? {}) });
      await ctx.addInitScript(([s, tok, noFont, guest]) => {
        try { if (!noFont) { localStorage.setItem('yatung_font_scale_v2', s); localStorage.setItem('yatung_font_hint_off', '1'); } if (!guest) { localStorage.setItem('yatung_token', tok); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); } } catch {}
      }, [scale, FAKE_JWT, !!st.noFont, !!st.guest]);
      const page = await ctx.newPage();
      const html = { on: false };
      await mockApi(page, { htmlMode: () => html.on, todayStatus: st.st?.todayStatus ? () => st.st.todayStatus : undefined, demoMode: () => !!st.st?.demo });
      if (st.seedLog) await page.addInitScript(() => { try { localStorage.setItem('yatung_errlog', JSON.stringify([{ t: '2026-10-13 17:40:01', route: '/today', code: 'E-304', endpoint: '/api/doses/today', status: 304 }, { t: '2026-10-13 17:41:12', route: '/medications', code: 'E-JS', endpoint: null, status: null }])); } catch {} });
      await page.goto(BASE + (st.route ?? '/today'));
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(600);
      const cx = { ctx, html, issues: [] };
      await st.run?.(page, cx);
      await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
      await page.waitForTimeout(900);
      const m = await page.evaluate((expect) => {
        const banners = document.querySelectorAll('[data-banner]').length;
        const bodyText = document.body.innerText;
        const scrollers = [document.documentElement, document.body, ...document.querySelectorAll('.main, .yt-page')]
          .filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')} scrollWidth ${e.scrollWidth} > ${e.clientWidth}`);
        const cw = document.documentElement.clientWidth;
        const over = [...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > cw + 0.5 || b.left < -0.5) && getComputedStyle(e).position !== 'fixed' && !e.closest('.bg, .cdk-visually-hidden, .cdk-live-announcer-element'); })
          .slice(0, 8).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 2).join('.')} right=${Math.round(e.getBoundingClientRect().right)}`);
        const small = [...document.querySelectorAll('button, a[href], [role=button]')].filter((e) => { const b = e.getBoundingClientRect(); const touch = e.classList.contains('yt-compact') ? parseFloat(getComputedStyle(e, '::before').height) : b.height; return b.width > 0 && getComputedStyle(e).visibility !== 'hidden' && touch < 47.5 && /ติดตั้ง|ปิด|แตะ|กด|รับ|เพิ่ม|อัปเดต|เชื่อมต่อ|ตั้งค่า/.test(e.innerText || e.getAttribute('aria-label') || '') && e.closest('app-install-card, app-banner-host'); }).map((e) => `${(e.innerText || '').trim().slice(0, 20)} สูง ${Math.round(e.getBoundingClientRect().height)}`);
        return { seen: new RegExp(expect).test(bodyText), scrollers, over, small, banners };
      }, st.expect);
      total++;
      const issues = [...cx.issues, ...(m.seen ? [] : [`ไม่พบข้อความ /${st.expect}/`]), ...(m.banners > 1 ? [`แสดง banner ${m.banners} แถบพร้อมกัน (ต้อง ≤ 1)`] : []), ...(st.only1 && m.banners !== 1 ? ['ต้องมี banner 1 แถบพอดี'] : []), ...m.scrollers, ...m.over, ...m.small.map((x) => `ปุ่มเตี้ย ${x}`)];
      if (issues.length) bad++;
      console.log(`${issues.length ? '✘' : '✓'} ${st.name} @${w}px ก${scale === '100' ? '' : scale === '112' ? '+' : '++'}${issues.length ? '\n    ' + issues.join('\n    ') : ''}`);
      if (w === 360 && scale === '100') {
        if (!st.shot) await page.evaluate(() => document.querySelectorAll('.main, .yt-page').forEach((e) => { e.scrollTop = 0; })).catch(() => {});   // หน้าวันนี้เลื่อนไปมื้อถัดไปเอง
        const target = st. shot ? page.locator(st.shot).first() : page;
        await target.screenshot({ path: `${OUT}state-${st.name}.png` }).catch((e) => console.log(`  (ถ่ายภาพ ${st.name} ไม่ได้: ${e.message.split('\n')[0]})`));
      }
      await ctx.close();
    }
  }
}
await browser.close();
console.log(`\n${total - bad}/${total} ผ่าน`);
process.exit(bad ? 1 : 0);
