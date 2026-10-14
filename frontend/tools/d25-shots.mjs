// ภาพเทียบ D2.5 (ข้อมูลจำลอง ไม่ต้อง login/docker) — ต้องมี ng serve (4200)
//   node tools/d25-shots.mjs --tag=d2|d25 [--set=phase1|phase2]
// ถ่ายที่ 360×640 ขนาด ก / ก++ (และ 1366×768 สำหรับ phase2) → docs/screenshots/day8d/d25/<tag>/<ชื่อ>__<ขนาด>.png
// แล้วสร้างหัวข้อเทียบ "ก่อน 8D / D2 / D2.5" ลงใน docs/screenshots/day8d/index.html (ส่วนที่ล้อมด้วย <!--d25-->…<!--/d25-->)
// "ก่อน 8D" ใช้ภาพใน before/ (375×667 — ตอนนั้นไม่ได้ถ่ายที่ 360×640)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { FAKE_JWT, fakeThaiVoice, mockApi } from './lib/mock-app.mjs';

const args = process.argv.slice(2);
const val = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const tag = val('tag', 'd25');
const set = val('set', 'phase1');
const OUT = path.resolve('..', 'docs', 'screenshots', 'day8d');
const DIR = path.join(OUT, 'd25', tag);
fs.mkdirSync(DIR, { recursive: true });

const SCENES = {
  phase1: [
    { id: 'today-late', route: '/today', today: 'late', before: 'today' },
    { id: 'today-before', route: '/today', today: 'before' },
    { id: 'today-done', route: '/today', today: 'done' },
    { id: 'login', route: '/login', guest: true, before: 'login' },
    { id: 'register', route: '/register', guest: true, before: 'register' },
    { id: 'register-focus-pw', route: '/register', guest: true, focus: '#password' },
  ],
  phase2: [
    { id: 'today-late', route: '/today', today: 'late', before: 'today' },
    { id: 'scan', route: '/scan', before: 'scan' },
    { id: 'review', route: '/review/1', before: 'review-1' },
    { id: 'login', route: '/login', guest: true, before: 'login' },
  ],
};
const SIZES = set === 'phase2'
  ? [{ id: '360-a', w: 360, h: 640, scale: '100' }, { id: '360-aaa', w: 360, h: 640, scale: '125' }, { id: '1366', w: 1366, h: 768, scale: '100' }]
  : [{ id: '360-a', w: 360, h: 640, scale: '100' }, { id: '360-aaa', w: 360, h: 640, scale: '125' }];

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
for (const s of SIZES) {
  for (const sc of SCENES[set]) {
    const mobile = s.w < 768;
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
    await ctx.addInitScript(([k, tok, guest]) => {
      try {
        localStorage.setItem('yatung_font_scale_v2', k); localStorage.setItem('yatung_font_hint_off', '1');
        if (!guest) { localStorage.setItem('yatung_token', tok); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); }
      } catch {}
    }, [s.scale, FAKE_JWT, !!sc.guest]);
    await fakeThaiVoice(ctx);
    const page = await ctx.newPage();
    await mockApi(page, { today: () => sc.today ?? 'late' });
    await page.goto('http://localhost:4200' + sc.route);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
    await page.waitForTimeout(sc.guest ? 4200 : 700);   // หน้า auth: รอท่าโบกมือเริ่มต้นจบ
    if (sc.focus) { await page.locator(sc.focus).click(); await page.waitForTimeout(500); }
    await page.evaluate(() => { document.querySelectorAll('*').forEach((e) => { if (e.scrollTop) e.scrollTop = 0; }); });
    await page.screenshot({ path: path.join(DIR, `${sc.id}__${s.id}.png`) });
    await ctx.close();
  }
}
await browser.close();

// ---------- index.html : ก่อน 8D / D2 / D2.5 ----------
const idx = path.join(OUT, 'index.html');
let html = fs.existsSync(idx) ? fs.readFileSync(idx, 'utf8') : '<!doctype html><meta charset="utf-8"><title>8D</title>';
const tags = [['d2', 'D2'], ['d25', 'D2.5']].filter(([t]) => fs.existsSync(path.join(OUT, 'd25', t)));
const scenes = SCENES.phase2.concat(SCENES.phase1).filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i);
const fig = (src, cap) => (fs.existsSync(path.join(OUT, src)) ? `<figure><img src="${src}" style="height:640px" alt="${cap}"><figcaption>${cap}</figcaption></figure>` : '');
const block = `<!--d25--><h1>D2.5 — เทียบ ก่อน 8D / D2 / D2.5 (360×640)</h1><style>figure{display:inline-block;margin:0 12px 12px 0;vertical-align:top}</style>` +
  ['360-a:ขนาด ก', '360-aaa:ขนาด ก++', '1366:จอกว้าง 1366×768'].map((z) => {
    const [zid, zl] = z.split(':');
    const rows = scenes.map((sc) => {
      const cells = [];
      if (sc.before && zid !== '360-aaa') cells.push(fig(`before/${sc.before}__${zid === '1366' ? 'd-a' : 'm-a'}.png`, 'ก่อน 8D (375×667)'));
      if (sc.before && zid === '360-aaa') cells.push(fig(`before/${sc.before}__m-aaa.png`, 'ก่อน 8D ก++ (375×667)'));
      for (const [t, l] of tags) cells.push(fig(`d25/${t}/${sc.id}__${zid}.png`, l));
      return cells.join('') ? `<h3>${sc.id}</h3><div>${cells.join('')}</div>` : '';
    }).join('');
    return rows ? `<h2>${zl}</h2>${rows}` : '';
  }).join('') + '<!--/d25-->';
html = html.includes('<!--d25-->') ? html.replace(/<!--d25-->[\s\S]*<!--\/d25-->/, block) : html + block;
fs.writeFileSync(idx, html);
console.log(`ถ่ายแล้ว ${tag} (${set}) → ${DIR}`);
