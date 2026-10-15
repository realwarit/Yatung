// ตรวจปุ่มอ่านออกเสียง (8B) ด้วย speechSynthesis จำลอง + API จำลอง (ไม่ต้อง login จริง ไม่แตะ backend ไม่เรียก LINE/Gemini)
//   node tools/tts-shots.mjs [--scale=100|112|125] [--sizes=390x844,1440x900] [state…]
// states: today (มีเสียงไทย) · today-novoice (ไม่มีเสียงไทย → ต้องไม่มีปุ่ม 🔊 เลย) · overview · settings · settings-novoice · medform
// วัด: ปุ่ม 🔊 สูง ≥ 48px (ใหญ่ ≥ 56px), ล้นแนวนอน, และกดปุ่มแล้ว speak ถูกเรียก (จำลอง) โดยไม่มีการเล่นเองตอนโหลดหน้า
// ผลภาพ → docs/screenshots/tts/ (ไม่ commit) ; ต้องมี ng serve (4200)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const args = process.argv.slice(2);
const val = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const scale = val('scale', '100');
const sizes = val('sizes', '390x844').split(',').map((s) => s.split('x').map(Number));
const only = args.filter((a) => !a.startsWith('--'));
const OUT = new URL('../../docs/screenshots/tts/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const FAKE_JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 1, email: 'x@example.test', exp: 4102444800 })}.sig`;
const ymd = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

const dose = (id, slot, hhmm, name, status, tts = null) => ({
  id, medication_id: id, name, tts_name: tts, strength: '500 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'after',
  scheduled_at: `${ymd} ${hhmm}:00`, status, taken_at: status === 'taken' ? `${ymd} ${hhmm}:05` : null, source: status === 'taken' ? 'app' : null, is_overdue: false,
});
const TODAY = {
  summary: { total: 3, taken: 1, pending: 2, missed: 0 },
  slots: [
    { slot: 'morning', time: '08:00', doses: [dose(1, 'morning', '08:00', 'Metformin', 'taken')] },
    { slot: 'evening', time: '18:00', doses: [dose(2, 'evening', '18:00', 'Amlodipine', 'pending', 'ยาความดัน'), dose(3, 'evening', '18:00', 'Simvastatin', 'pending')] },
  ],
};
const ADH = {
  range: { from: ymd, to: ymd, days: 7 }, overall: { taken: 18, missed: 2, pending_due: 1, due: 21, rate: 86 },
  days: Array.from({ length: 7 }, (_, i) => ({ date: ymd, label_th: `จ. ${i + 1} ต.ค.`, is_today: i === 6, taken: 3, missed: 0, pending_due: 0, upcoming: 0, due: 3, rate: 100 })),
  by_meal: [], by_medication: [], by_source: { app: 18, push: 0, line: 0, caregiver: 0, other: 0 }, streak_days: 3, generated_at: '',
};
const MED = {
  id: 1, name: 'Amlodipine', tts_name: 'ยาความดัน', strength: '5 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'after', as_needed: false,
  slots: ['morning'], indication: null, warnings: [], total_qty: 30, remaining_qty: 20, days_left: 20, refill_alert_days: 7, is_low: false,
  start_date: ymd, end_date: null, is_active: true, created_at: '', updated_at: '',
};
const STATES = {
  today: { path: '/today', voices: true, focus: '.aside' },
  'today-novoice': { path: '/today', voices: false },
  overview: { path: '/overview', voices: true },
  settings: { path: '/settings', voices: true, click: 'เสียงอ่าน' },   // D3: เสียงอ่านอยู่ใน sheet ของหน้ารวมตั้งค่า
  'settings-novoice': { path: '/settings', voices: false, click: 'เสียงอ่าน' },
  medform: { path: '/medications/1/edit', voices: true, focus: 'summary' },
};

// speechSynthesis จำลอง: บันทึกการ speak ไว้ใน window.__spoke (ไม่ออกเสียงจริง)
const FAKE_SPEECH = (withThai) => {
  const voices = withThai
    ? [{ name: 'Kanya', voiceURI: 'kanya', lang: 'th-TH', localService: true }, { name: 'Narisa', voiceURI: 'narisa', lang: 'th-TH', localService: true }, { name: 'Samantha', voiceURI: 'sam', lang: 'en-US', localService: true }]
    : [{ name: 'Samantha', voiceURI: 'sam', lang: 'en-US', localService: true }];
  window.__spoke = [];
  const synth = {
    speaking: false, pending: false, paused: false,
    getVoices: () => voices, addEventListener() {}, removeEventListener() {},
    speak(u) { window.__spoke.push({ text: u.text, rate: u.rate, lang: u.lang }); this.speaking = true; },
    cancel() { this.speaking = false; }, pause() {}, resume() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.rate = 1; this.lang = ''; this.voice = null; };
};

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
let bad = 0;
for (const [w, h] of sizes) {
  for (const [name, st] of Object.entries(STATES)) {
    if (only.length && !only.includes(name)) continue;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: 2 });
    await ctx.addInitScript(([s, tok]) => {
      try { localStorage.setItem('yatung_font_scale', s); localStorage.setItem('yatung_token', tok); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); } catch {}
    }, [scale, FAKE_JWT]);
    await ctx.addInitScript(FAKE_SPEECH, st.voices);
    const page = await ctx.newPage();
    const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
    await page.route('**/api/**', (route) => {
      const u = new URL(route.request().url()).pathname;
      if (u === '/api/me') return route.fulfill(json({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ', notify_both: false, push_subscribed: false }));
      if (u === '/api/doses/today') return route.fulfill(json(TODAY));
      if (u === '/api/medications') return route.fulfill(json([MED]));
      if (u === '/api/medications/1') return route.fulfill(json(MED));
      if (u === '/api/stats/adherence') return route.fulfill(json(ADH));
      if (u === '/api/settings/slot-times') return route.fulfill(json({ morning: '08:00', noon: '12:00', evening: '18:00', bedtime: '21:00' }));
      if (u === '/api/line/status') return route.fulfill(json({ linked: false, display_name: null }));
      if (u === '/api/caregivers') return route.fulfill(json({ caregivers: [] }));
      if (u === '/api/config') return route.fulfill(json({ demoMode: false }));
      if (u === '/api/push/public-key') return route.fulfill(json({ error: 'PUSH_NOT_CONFIGURED', details: 'x' }, 503));
      return route.fulfill(json({ error: 'NOT_MOCKED', details: u }, 404));
    });
    await page.goto(BASE + st.path);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1500);   // เผื่อรอบถามรายการเสียงซ้ำของ service

    if (st.click) { await page.getByRole('button', { name: st.click }).first().click(); await page.waitForTimeout(1200); }
    const spokeOnLoad = await page.evaluate(() => window.__spoke.length);
    if (st.focus) { await page.evaluate((sel) => { const el = document.querySelector(sel); const main = document.querySelector('.main'); if (el && main) main.scrollTop += el.getBoundingClientRect().top - 60; }, st.focus); await page.waitForTimeout(300); }
    const tag = `${name}-${w}x${h}${scale === '100' ? '' : '-s' + scale}`;
    await page.screenshot({ path: `${OUT}${tag}.png` });

    const m = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('app-tts-button .btn')];
      return {
        overflowX: document.documentElement.scrollWidth - innerWidth,
        count: btns.length,
        heights: btns.map((b) => Math.round(b.getBoundingClientRect().height)),
        names: btns.map((b) => b.getAttribute('aria-label')),
      };
    });
    const probs = [];
    if (spokeOnLoad > 0) probs.push('พูดเองตอนโหลดหน้า!');
    if (m.overflowX > 0) probs.push('ล้นแนวนอน ' + m.overflowX);
    if (!st.voices && m.count > 0) probs.push('ไม่มีเสียงไทยแต่ยังมีปุ่ม 🔊');
    if (st.voices && m.count === 0 && name !== 'medform') probs.push('ไม่พบปุ่ม 🔊');
    const minH = 48;
    if (m.heights.some((x) => x < minH)) probs.push('ปุ่มเตี้ยกว่า 48px ' + m.heights);

    // กดปุ่มแรกแล้วต้องมี speak (จำลอง)
    if (st.voices && m.count > 0) {
      await page.locator('app-tts-button .btn').first().click();
      const spoke = await page.evaluate(() => window.__spoke.slice());
      if (!spoke.length) probs.push('กดแล้วไม่ speak');
      else console.log('   อ่านว่า:', spoke.map((s) => s.text).join(' | '), '· rate', spoke[0].rate, spoke[0].lang);
    }
    console.log(`${probs.length ? '✘' : '✓'} ${tag}  ปุ่ม ${m.count} สูง ${m.heights.join(',')}${probs.length ? '  → ' + probs.join('; ') : ''}`);
    if (probs.length) bad++;
    await ctx.close();
  }
}
await browser.close();
process.exit(bad ? 1 : 0);
