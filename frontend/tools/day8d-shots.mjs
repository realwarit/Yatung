// ภาพก่อน/หลังของงาน 8D (ข้อมูลจำลอง ไม่ต้อง login/docker) — ต้องมี ng serve (4200)
//   node tools/day8d-shots.mjs --tag=before|after [--routes=/today,…]
// ขนาด: 375×667 ก, 375×667 ก++, 1366×768 ก → docs/screenshots/day8d/<tag>/ ; แล้วสร้าง docs/screenshots/day8d/index.html เทียบก่อน/หลัง
// before = main เดิม (key เดิม 100/125) ; after = key ใหม่ yatung_font_scale_v2 (100/125 = ก/ก++)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { FAKE_JWT, mockApi } from './lib/mock-app.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const args = process.argv.slice(2);
const val = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const tag = val('tag', 'after');
const routes = val('routes', '/login,/register,/today,/scan,/review/1,/medications,/settings,/overview').split(',');
const OUT = path.resolve('..', 'docs', 'screenshots', 'day8d');
const SHOTS = [
  { id: 'm-a', w: 375, h: 667, scale: '100', label: '375×667 ก' },
  { id: 'm-aaa', w: 375, h: 667, scale: '125', label: '375×667 ก++' },
  { id: 'd-a', w: 1366, h: 768, scale: '100', label: '1366×768 ก' },
];
const slug = (r) => r.replace(/^\//, '').replace(/\//g, '-');
const authed = (r) => !['/login', '/register'].includes(r);

fs.mkdirSync(path.join(OUT, tag), { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
for (const s of SHOTS) {
  const mobile = s.w < 768;
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript(([sc, tok, key, auth]) => {
    try {
      localStorage.setItem(key, sc);
      if (auth) {
        localStorage.setItem('yatung_token', tok);
        localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' }));
      }
    } catch {}
  }, [s.scale, FAKE_JWT, tag === 'before' ? 'yatung_font_scale' : 'yatung_font_scale_v2', false]);
  for (const r of routes) {
    const page = await ctx.newPage();
    await mockApi(page);
    if (authed(r)) await page.addInitScript(([tok]) => { try { localStorage.setItem('yatung_token', tok); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); } catch {} }, [FAKE_JWT]);
    await page.goto(BASE + r);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
    await page.waitForTimeout(700);
    await page.evaluate(() => { document.querySelectorAll('*').forEach((e) => { if (e.scrollTop) e.scrollTop = 0; }); window.scrollTo(0, 0); });
    await page.screenshot({ path: path.join(OUT, tag, `${slug(r)}__${s.id}.png`) });
    await page.close();
  }
  await ctx.close();
}
await browser.close();

// index.html เทียบก่อน/หลัง
const dirs = ['before', 'after'].filter((d) => fs.existsSync(path.join(OUT, d)));
const allRoutes = [...new Set(dirs.flatMap((d) => fs.readdirSync(path.join(OUT, d)).map((f) => f.split('__')[0])))];
const cell = (d, r, s) => (fs.existsSync(path.join(OUT, d, `${r}__${s.id}.png`)) ? `<figure><img src="${d}/${r}__${s.id}.png" alt="${d} ${r} ${s.label}"><figcaption>${d}</figcaption></figure>` : '');
const html = `<!doctype html><meta charset="utf-8"><title>8D ก่อน/หลัง</title><style>body{font-family:system-ui;margin:16px;background:#f4f4f4}h2{margin:32px 0 8px}.row{display:flex;gap:16px;align-items:flex-start;margin-bottom:8px;overflow-x:auto}figure{margin:0}img{border:1px solid #bbb;background:#fff;max-height:760px}figcaption{font-size:13px;color:#555;text-align:center}</style>
<h1>ปรับดีไซน์ 8D — ก่อน / หลัง</h1>${allRoutes.map((r) => `<h2>${r.replace('-', '/')}</h2>${SHOTS.map((s) => `<h3>${s.label}</h3><div class="row">${dirs.map((d) => cell(d, r, s)).join('')}</div>`).join('')}`).join('')}`;
// ภาพน้องยาตรง M 56px ของหน้า Login ทุกท่า (tools/auth-mascot-check.mjs) + ท่า S 36px (ถ้ามี)
let extra = '';
const mjson = path.join(OUT, 'auth-mascot', 'index.json');
if (fs.existsSync(mjson)) {
  const items = JSON.parse(fs.readFileSync(mjson, 'utf8'));
  extra += `<h2>น้องยาตรง M 56px — หน้า Login ทุกท่า</h2><div class="row">${items.map((m) => `<figure><img src="auth-mascot/${m.name}.png" style="height:200px" alt="${m.label}"><figcaption>${m.label}</figcaption></figure>`).join('')}</div>`;
}
if (fs.existsSync(path.join(OUT, 'mascot-s-check.png'))) extra += '<h2>น้องยาตรง S 36px — ท่าที่อ่านออก</h2><div class="row"><figure><img src="mascot-s-check.png" alt="mascot S"></figure></div>';
fs.writeFileSync(path.join(OUT, 'index.html'), html + extra);
console.log(`ถ่ายแล้ว ${tag}: ${routes.length} หน้า × ${SHOTS.length} ขนาด → ${OUT}`);
