// ภาพหน้าจอหน้า Review ทุกสถานะ ที่ 390×844 และ 1440×900 → docs/screenshots/review/
//   node tools/review-shots.mjs [--scale=125] [--sizes=375x812,768x1024,1440x900] [state…]
// ต้องมี ng serve (4200) + docker (db, nodered) ; สร้าง user สุ่ม + ผลสแกนตัวอย่างใน DB แล้วลบทิ้งตอนจบ (ไม่เรียก Gemini)
import { mkdirSync } from 'node:fs';
import { launch, newPage, login, api, BASE } from './lib/e2e.mjs';
import { SCENARIOS, insertDraft, makeUser, dropUser } from './lib/seed.mjs';

const args = process.argv.slice(2);
const scale = (args.find((a) => a.startsWith('--scale=')) ?? '--scale=100').slice(8);
const only = args.filter((a) => !a.startsWith('--'));
const sizeArg = args.find((a) => a.startsWith('--sizes='));
const sfx = scale === '100' ? '' : `-s${scale}`;
const SIZES = sizeArg ? sizeArg.slice(8).split(',').map((x) => x.split('x').map(Number)) : [[390, 844], [1440, 900]];
const OUT = new URL('../../docs/screenshots/review/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

const user = await makeUser('shots');
const browser = await launch();
try {
  const ids = {
    flags: insertDraft(user, SCENARIOS.flags()),
    clean: insertDraft(user, SCENARIOS.clean()),
    notlabel: insertDraft(user, SCENARIOS.notlabel()),
    typed: insertDraft(user, SCENARIOS.typed()),
    dup: insertDraft(user, SCENARIOS.dup()),
    saved: insertDraft(user, SCENARIOS.clean()),
    success: insertDraft(user, SCENARIOS.clean()),
    discarded: insertDraft(user, SCENARIOS.typed()),
  };
  // ยาที่มีอยู่แล้ว (เหลือ 5 เม็ด) เพื่อให้ "dup" เจอยาซ้ำ — สร้างหลังเตรียม draft อื่นเพื่อไม่ให้ draft อื่นพลอยเจอยาซ้ำ: ใช้ชื่อเฉพาะใน dup ได้ แต่ clean/typed/saved ก็ชื่อ Metformin
  // → สร้างยา Metformin เฉพาะตอนถ่าย dup แล้วหยุดยานั้นหลังถ่าย
  let metId = null;

  for (const [w, h] of SIZES) {
    const { ctx, page } = await newPage(browser, { width: w, height: h, scale });
    const token = await login(page, user.email, user.password);
    const call = api(page, token);
    const shot = async (name, { full = true, act } = {}) => {
      if (only.length && !only.includes(name)) return;
      await page.waitForTimeout(900);
      if (act) await act();
      await page.evaluate(() => { for (const e of document.querySelectorAll('*')) if (e.scrollTop) e.scrollTop = 0; });
      await page.waitForTimeout(250);
      const over = await page.evaluate(() => { const bad = []; for (const e of document.querySelectorAll('app-review-page *')) { const r = e.getBoundingClientRect(); if (r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(e).position !== 'absolute' && !e.closest('.sr-only')) bad.push(e.tagName.toLowerCase() + '.' + e.className); } return bad.slice(0, 3); });
      if (over.length) console.log('  ล้นจอ', name, w, over.join(' '));
      const base = `${OUT}${name}-${w}x${h}${sfx}`;
      await page.screenshot({ path: base + '.png' });
      if (!full) return;
      // แอปเลื่อนใน container ภายใน → เลื่อนลงสุดแล้วถ่ายอีกใบ
      const moved = await page.evaluate(() => {
        const el = [...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 8 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY))
          .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
        if (!el) return false;
        el.scrollTop = el.scrollHeight; return true;
      });
      if (moved) { await page.waitForTimeout(300); await page.screenshot({ path: base + '-bottom.png' }); }
    };
    const open = async (id) => { await page.goto(`${BASE}/review/${id}`); await page.waitForLoadState('networkidle').catch(() => {}); };

    await open(ids.flags); await shot('flags');
    if (w < 700) await shot('flags-sheet', { full: false, act: async () => { await page.getByRole('button', { name: 'ดูรูปซองยา' }).click(); await page.waitForTimeout(500); } });
    await open(ids.flags);
    await shot('flags-acked', { act: async () => {
      // แก้ช่องหนึ่ง (เลือกก่อน/หลังอาหารของ PARACETAMOL) + กด "ถูกต้องแล้ว" หนึ่งจุด → จุดที่เหลือลดลง
      await page.getByRole('radio', { name: 'หลังอาหาร' }).first().click();
      await page.getByRole('button', { name: 'ถูกต้องแล้ว' }).first().click();
    } });
    await open(ids.clean); await shot('clean');
    await open(ids.notlabel); await shot('notlabel');
    await open(ids.typed); await shot('typed');

    if (!metId) {
      const r = await call('POST', '/api/medications', { name: 'Metformin', strength: '500 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'after', as_needed: false, slots: ['morning', 'evening'], total_qty: 30, remaining_qty: 5 });
      metId = r.body.id;
    }
    await open(ids.dup); await shot('dup');
    await call('PATCH', `/api/medications/${metId}/stop`);

    // บันทึกสำเร็จ: ผ่านหน้าจอจริง (ตั้งค่าให้ครบแล้วกดบันทึก)
    await open(ids.success);
    await page.getByRole('button', { name: /บันทึก 1 รายการ/ }).click();
    await page.getByText(/บันทึกแล้ว/).first().waitFor({ timeout: 10000 });
    await shot('success', { full: false });

    // บันทึกไปแล้ว: confirm ผ่าน API แล้วเปิดลิงก์เดิม
    await call('POST', `/api/prescriptions/${ids.saved}/confirm`, { items: [{ action: 'create', medication: { name: 'ยาที่บันทึกแล้ว', dose_per_time: 1, unit: 'tablet', meal_relation: 'after', as_needed: false, slots: ['morning'], total_qty: 10 } }] });
    await open(ids.saved); await shot('saved', { full: false });
    for (const m of (await call('GET', '/api/medications?active=1')).body) await call('PATCH', `/api/medications/${m.id}/stop`);   // ไม่ให้ยาที่เพิ่งสร้างไปทำให้ขนาดถัดไปเจอ "ยาซ้ำ"
    await call('POST', `/api/prescriptions/${ids.discarded}/discard`);
    await open(ids.discarded); await shot('discarded', { full: false });

    // 125%: หน้ามี flag ต้องไม่ล้น/ซ้อน (ถ่ายเฉพาะเมื่อสั่ง --scale)
    await ctx.close();
    // draft ที่ใช้ไปแล้ว (success/saved/discarded/clean?) ต้องสร้างใหม่สำหรับขนาดถัดไป
    ids.success = insertDraft(user, SCENARIOS.clean());
    ids.saved = insertDraft(user, SCENARIOS.clean());
    ids.discarded = insertDraft(user, SCENARIOS.typed());
    metId = null;
  }
  console.log('บันทึกภาพที่', OUT);
} finally {
  await browser.close();
  dropUser(user);
}
