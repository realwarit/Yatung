// ตรวจ "ล้นแนวนอน" ทุกหน้าหลักด้วย API จำลอง (ไม่ต้อง login จริง/ไม่ต้องมี docker) — ต้องมี ng serve (4200)
//   node tools/overflow-check.mjs [--widths=320,360,375,412] [--scales=100,112,125] [--routes=/today,/overview,…] [--probe]
// ผ่าน = scrollWidth <= clientWidth ทั้งของ <html>, <body> และตัวเลื่อนทุกตัวในหน้า (หน้าไม่เลื่อนไปทางซ้าย/ขวา)
// ไม่ผ่านจะแสดง selector ของ element ที่ right > clientWidth พร้อมความกว้าง ; --probe ปิด overflow-x:clip ชั่วคราวเพื่อหาต้นเหตุจริง
// ตั้งแต่ 8B: ทุกงาน UI ต้องวัดที่ 360px ด้วย (ไม่ใช่แค่ 375px) — ดู CLAUDE.md
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const args = process.argv.slice(2);
const val = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const widths = val('widths', '320,360,375,412').split(',').map(Number);
const scales = val('scales', '100,112,125').split(',');
const routes = val('routes', '/today,/overview,/medications,/settings,/scan').split(',');
const probe = args.includes('--probe');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const FAKE_JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 1, email: 'x@example.test', exp: 4102444800 })}.sig`;
const ymd = '2026-10-12';
const dose = (id, slot, hhmm, name, status) => ({
  id, medication_id: id, name, tts_name: null, strength: '500 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'after',
  scheduled_at: `${ymd} ${hhmm}:00`, status, taken_at: status === 'taken' ? `${ymd} ${hhmm}:05` : null, source: status === 'taken' ? 'line' : null, is_overdue: false,
});
const TODAY = { summary: { total: 3, taken: 1, pending: 2, missed: 0 }, slots: [
  { slot: 'morning', time: '08:00', doses: [dose(1, 'morning', '08:00', 'Metformin', 'taken')] },
  { slot: 'evening', time: '18:00', doses: [dose(2, 'evening', '18:00', 'Amlodipine', 'pending'), dose(3, 'evening', '18:00', 'ซิมวาสแตติน ชื่อยาที่ยาวมากเพื่อทดสอบการตัดบรรทัด', 'pending')] },
] };
const D = (date, label_th, taken, missed, pending_due, upcoming, is_today = false) => {
  const due = taken + missed + pending_due;
  return { date, label_th, is_today, taken, missed, pending_due, upcoming, due, rate: due ? Math.round((taken * 100) / due) : null };
};
const days = [D('2026-10-06', 'อ. 6 ต.ค.', 3, 0, 0, 0), D('2026-10-07', 'พ. 7 ต.ค.', 0, 0, 0, 0), D('2026-10-08', 'พฤ. 8 ต.ค.', 2, 1, 0, 0),
  D('2026-10-09', 'ศ. 9 ต.ค.', 1, 2, 0, 0), D('2026-10-10', 'ส. 10 ต.ค.', 3, 0, 0, 0), D('2026-10-11', 'อา. 11 ต.ค.', 2, 0, 1, 0), D('2026-10-12', 'จ. 12 ต.ค.', 0, 0, 2, 3, true)];
const sum = (k) => days.reduce((n, d) => n + d[k], 0);
const ADH = {
  range: { from: '2026-10-06', to: '2026-10-12', days: 7 },
  overall: { taken: sum('taken'), missed: sum('missed'), pending_due: sum('pending_due'), due: sum('due'), rate: Math.round((sum('taken') * 100) / sum('due')) },
  days, by_meal: [{ meal: 'morning', label_th: 'เช้า', due: 7, taken: 7, rate: 100 }, { meal: 'evening', label_th: 'เย็น', due: 7, taken: 4, rate: 57 }],
  by_medication: [
    { medication_id: 2, name: 'ซิมวาสแตติน ชื่อยาที่ยาวมากเพื่อทดสอบ', strength: '20 mg', is_active: true, due: 7, taken: 4, rate: 57 },
    { medication_id: 3, name: 'Metformin', strength: '500 mg', is_active: false, due: 6, taken: 6, rate: 100 },
  ],
  by_source: { app: 3, push: 1, line: 1, caregiver: 1, other: 0 }, streak_days: 1, generated_at: '',
};
const MED = { id: 1, name: 'Amlodipine', tts_name: null, strength: '5 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'after', as_needed: false, slots: ['morning', 'evening'],
  indication: 'ลดความดัน', warnings: ['อาจทำให้ง่วง'], total_qty: 30, remaining_qty: 4, days_left: 2, refill_alert_days: 7, is_low: true, start_date: ymd, end_date: null, is_active: true, created_at: '', updated_at: '' };

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
let bad = 0, total = 0;
for (const scale of scales) {
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([s, tok]) => {
      try { localStorage.setItem('yatung_font_scale', s); localStorage.setItem('yatung_token', tok); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); } catch {}
    }, [scale, FAKE_JWT]);
    const page = await ctx.newPage();
    const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
    await page.route('**/api/**', (route) => {
      const u = new URL(route.request().url()).pathname;
      if (u === '/api/me') return route.fulfill(json({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ', notify_both: false, push_subscribed: false }));
      if (u === '/api/doses/today') return route.fulfill(json(TODAY));
      if (u === '/api/medications') return route.fulfill(json([MED]));
      if (u === '/api/stats/adherence') return route.fulfill(json(ADH));
      if (u === '/api/settings/slot-times') return route.fulfill(json({ morning: '08:00', noon: '12:00', evening: '18:00', bedtime: '21:00' }));
      if (u === '/api/line/status') return route.fulfill(json({ linked: true, display_name: 'ผู้ทดสอบ' }));
      if (u === '/api/caregivers') return route.fulfill(json({ caregivers: [] }));
      if (u === '/api/config') return route.fulfill(json({ demoMode: false }));
      return route.fulfill(json({ error: 'NOT_MOCKED', details: u }, 404));
    });
    for (const r of routes) {
      await page.goto(BASE + r);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
      if (probe) await page.addStyleTag({ content: '*{overflow-x:visible!important}html,body{overflow-x:visible!important}' });
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const cw = document.documentElement.clientWidth;
        const sel = (el) => {
          let s = el.tagName.toLowerCase();
          if (el.id) s += '#' + el.id;
          const c = [...el.classList].slice(0, 3).join('.');
          if (c) s += '.' + c;
          const p = el.parentElement;
          return (p && p !== document.body ? p.tagName.toLowerCase() + (p.classList[0] ? '.' + p.classList[0] : '') + ' > ' : '') + s;
        };
        // ตัวเลื่อนที่ทำให้ "หน้า" เลื่อนซ้าย/ขวา: html, body และคอนเทนเนอร์หลักของ shell (ไม่นับแถบเลื่อนแนวนอนที่ตั้งใจทำ เช่น เคล็ดลับถ่ายรูป)
        const scrollers = [document.documentElement, document.body, ...document.querySelectorAll('.main, .yt-page')]
          .filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => `${sel(e)} scrollWidth ${e.scrollWidth} > clientWidth ${e.clientWidth}`);
        const main = document.querySelector('.main');
        if (main && main.scrollWidth > main.clientWidth + 1 && !scrollers.some((x) => x.includes('.main'))) scrollers.push(`.main scrollWidth ${main.scrollWidth} > clientWidth ${main.clientWidth}`);
        const over = [...document.querySelectorAll('body *')].filter((e) => {
          const b = e.getBoundingClientRect();
          return b.width > 0 && (b.right > cw + 0.5 || b.left < -0.5) && getComputedStyle(e).position !== 'fixed';
        }).slice(0, 12).map((e) => `${sel(e)}  right=${Math.round(e.getBoundingClientRect().right)} width=${Math.round(e.getBoundingClientRect().width)} (หน้ากว้าง ${cw})`);
        const pg = document.querySelector('.yt-page');
        return { scrollers, over, pageH: pg ? Math.round(pg.getBoundingClientRect().height) : 0 };
      });
      total++;
      const fail = m.scrollers.length > 0 || (probe && m.over.length > 0);
      if (fail) bad++;
      console.log(`${fail ? '✘' : '✓'} ${r} @${w}px ก${scale === '100' ? '' : scale === '112' ? '+' : '++'}${r === '/overview' ? ' [สูง ' + m.pageH + 'px]' : ''}${fail ? '\n    ' + [...m.scrollers, ...m.over].join('\n    ') : ''}`);
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`\n${total - bad}/${total} ผ่าน`);
process.exit(bad ? 1 : 0);
