// ตรวจหน้า Settings ด้วยข้อมูลจำลอง (ไม่ต้อง login จริง ไม่แตะ backend): node tools/settings-shots.mjs [--scale=125] [--sizes=390x844] [state…]
// clearance < 0 = ปุ่มสุดท้ายถูกปุ่มสแกน/แถบเมนูบัง
// states: linked, cards, unlinked, code, caregivers, demo   → docs/screenshots/settings/<state>-<WxH>[-s125].png
// ต้องมี ng serve (4200) ; ใช้ Edge/Chrome ในเครื่อง ; พิมพ์ผลวัด: ฟอนต์จริงของชื่อ LINE (CDP), ชนระหว่างเนื้อหา/แถบเมนู/ปุ่มสแกน, ✓ อยู่บรรทัดเดียวกับหัวข้อ, ล้นแนวนอน
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const args = process.argv.slice(2);
const val = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const scale = val('scale', '100');
const sizes = val('sizes', '390x844').split(',').map((s) => s.split('x').map(Number));
const only = args.filter((a) => !a.startsWith('--'));
const OUT = new URL('../../docs/screenshots/settings/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

// JWT จำลองที่ยังไม่หมดอายุ (frontend เช็กแค่ exp ไม่ตรวจลายเซ็น) ; API ถูก mock ทั้งหมด
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const FAKE_JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 1, email: 'x@example.test', exp: 4102444800 })}.sig`;
const NAME_LATIN = '𝐑𝐱𝐭𝐜𝐡𝐱𝐩𝐨𝐥_';   // ตัวอักษรตกแต่ง (Mathematical Bold) แบบที่พบในชื่อ LINE จริง — ต้องแสดงเป็นละตินปกติ (NFKC)
const CG = [
  { id: 1, name: 'คุณลูกสาว', relation: 'ลูกสาว', escalate_after_min: 60, line_linked: true, line_display_name: NAME_LATIN },
  { id: 2, name: 'คุณหลาน', relation: 'หลาน', escalate_after_min: 90, line_linked: false, line_display_name: null },
  { id: 3, name: 'คุณป้า', relation: null, escalate_after_min: 120, line_linked: true, line_display_name: 'สมหญิง ใจดี' },
];
const STATES = {
  linked: { status: { linked: true, display_name: NAME_LATIN }, caregivers: CG, demo: false, focus: '.ok' },
  cards: { status: { linked: true, display_name: NAME_LATIN }, caregivers: CG, demo: false, focus: '.cgs' },
  unlinked: { status: { linked: false, display_name: null }, caregivers: [], demo: false },
  code: { status: { linked: false, display_name: null }, caregivers: CG, demo: false, click: 'รับรหัสเชื่อม LINE' },
  caregivers: { status: { linked: true, display_name: NAME_LATIN }, caregivers: CG, demo: false, scrollEnd: true },
  demo: { status: { linked: true, display_name: NAME_LATIN }, caregivers: CG, demo: true, scrollEnd: true },
};

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
for (const [w, h] of sizes) {
  for (const [name, st] of Object.entries(STATES)) {
    if (only.length && !only.includes(name)) continue;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: 2 });
    await ctx.addInitScript(([s, tok]) => {
      try { localStorage.setItem('yatung_font_scale', s); localStorage.setItem('yatung_token', tok); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); } catch {}
    }, [scale, FAKE_JWT]);
    const page = await ctx.newPage();
    const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
    await page.route('**/api/**', (route) => {
      const u = new URL(route.request().url()).pathname, m = route.request().method();
      if (u === '/api/me') return route.fulfill(json({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' }));
      if (u === '/api/settings/slot-times') return route.fulfill(json({ morning: '08:00', noon: '12:00', evening: '18:00', bedtime: '21:00' }));
      if (u === '/api/line/status') return route.fulfill(json(st.status));
      if (u === '/api/line/link-code') return route.fulfill(json({ code: '482913', expires_at: '2026-10-09 10:10:00', expires_in: 590, oa_message_url: 'https://line.me/R/oaMessage/%40014rktvr/?482913' }));
      if (u === '/api/caregivers') return route.fulfill(json({ caregivers: st.caregivers }));
      if (u === '/api/config') return route.fulfill(json({ demoMode: st.demo }));
      if (u === '/api/demo/remind-now') return route.fulfill(json({ sent: 1, doses: 2, slot: 'morning', time: '08:00', resent: false }));
      return route.fulfill(json({ error: 'NOT_MOCKED', details: u }, 404));
    });
    await page.goto(BASE + '/settings');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(800);
    if (st.click) { await page.getByRole('button', { name: st.click }).click(); await page.waitForTimeout(900); }
    if (st.focus) { await page.evaluate((sel) => { const el = document.querySelector(sel); const main = document.querySelector('.main'); if (el && main) main.scrollTop += el.getBoundingClientRect().top - 60; }, st.focus); await page.waitForTimeout(300); }
    if (st.scrollEnd) {
      await page.evaluate(() => { const el = document.querySelector('.main'); if (el) el.scrollTop = el.scrollHeight; });
      await page.waitForTimeout(300);
    }
    const tag = `${name}-${w}x${h}${scale === '100' ? '' : '-s' + scale}`;
    await page.screenshot({ path: `${OUT}${tag}.png` });

    // ---- วัด ----
    const m = await page.evaluate(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, h: b.height }; };
      const main = document.querySelector('.main'), nav = document.querySelector('nav.bottom, .bottom'), scan = document.querySelector('.scan__btn');
      const out = { overflowX: document.documentElement.scrollWidth > innerWidth + 1, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) };
      if (main) { const lastBtn = [...main.querySelectorAll('button, a')].filter((e) => e.offsetParent).pop(); out.lastBtnBottom = lastBtn ? Math.round(r(lastBtn).bottom) : null; out.clearance = lastBtn && scan ? Math.round(r(scan).top - r(lastBtn).bottom) : null; out.mainBottom = r(main).bottom; out.mainScrollMax = main.scrollHeight - main.clientHeight; }
      if (nav) out.navTop = r(nav).top;
      if (scan) out.scanTop = r(scan).top;
      const ok = document.querySelector('.ok__t'); if (ok) { const ic = ok.querySelector('app-icon'), tx = ok.querySelector('span'); out.okIcon = r(ic).top; out.okTextTop = r(tx).top; out.okLines = Math.round(r(tx).h / parseFloat(getComputedStyle(tx).lineHeight)); }
      out.nameFonts = [...document.querySelectorAll('.line-name')].map((e) => getComputedStyle(e).fontFamily);
      return out;
    });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument');
    const fonts = [];
    for (const sel of ['.line-name', '.cg__line']) {
      const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: sel });
      for (const id of nodeIds) { const r = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: id }); fonts.push(sel + ': ' + r.fonts.map((f) => `${f.familyName}(${f.glyphCount})`).join(', ')); }
    }
    console.log(`\n[${tag}]`, JSON.stringify(m), '\n  ฟอนต์จริง:', fonts.join(' | '));
    await ctx.close();
  }
}
await browser.close();
