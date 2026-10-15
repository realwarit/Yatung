// ตรวจพฤติกรรมหน้าวันนี้ใน browser จริง (ข้อมูลจำลอง ไม่ต้อง login/docker) — ต้องมี ng serve (4200)
//   node tools/today-check.mjs
// ครอบคลุม : มื้อที่เปิด/พับ · "กินครบมื้อนี้" (เฉพาะมื้อที่เปิด, ส่ง id ถูกชุด, คำขอเดียว) · กินทีละตัว · กางมื้อถัดไป (ไม่มีปุ่มกินครบ) ·
//   ตัวนับ "อีก n นาที" เดินตามนาฬิกา (ปัดขึ้น ; 5 → 4 เมื่อผ่านไป 1 นาที ; ถึงเวลา → เปลี่ยนเป็น "ถึงเวลาแล้ว") · กินครบทั้งวัน (L) · ไม่เล่นเสียงเอง
import { chromium } from 'playwright';
import { FAKE_JWT, fakeThaiVoice, mockApi } from './lib/mock-app.mjs';

let bad = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✘'} ${name}${ok || !extra ? '' : '  → ' + extra}`); if (!ok) bad++; };

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));

async function open(scenario, { clock = false, width = 375 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 740 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([tok]) => { try { localStorage.setItem('yatung_font_scale_v2', '100'); localStorage.setItem('yatung_font_hint_off', '1'); localStorage.setItem('yatung_token', tok); localStorage.setItem('yatung_user', JSON.stringify({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ' })); } catch {} }, [FAKE_JWT]);
  await fakeThaiVoice(ctx);
  const page = await ctx.newPage();
  const calls = { take: [], many: [], speak: 0 };
  await page.addInitScript(() => { const s = window.speechSynthesis; if (s) { const sp = s.speak; s.speak = (...a) => { window.__spoke = (window.__spoke || 0) + 1; return sp.apply(s, a); }; } });
  await mockApi(page, { today: () => scenario, onTake: (id) => calls.take.push(id), onTakeMany: (ids) => calls.many.push(ids) });
  if (clock) await page.clock.install({ time: Date.now() });
  await page.goto('http://localhost:4200/today');
  await page.waitForSelector('app-slot-group', { timeout: 8000 });
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
  await page.waitForTimeout(400);
  return { ctx, page, calls };
}
const text = (page) => page.evaluate(() => document.body.innerText);

// ---------- late : มื้อกลางวันเลยเวลา (3 ยา) + เย็นอีก 3 ชม. + เช้ากินแล้ว ----------
{
  const { ctx, page, calls } = await open('late');
  const modes = await page.evaluate(() => [...document.querySelectorAll('app-slot-group')].map((e) => `${e.dataset.slot}:${e.dataset.mode}`));
  check('มื้อ: เช้า=done พับ · กลางวัน=open · เย็น=next พับ', modes.join() === 'morning:done,noon:open,evening:next', modes.join());
  check('ไม่เล่นเสียงเอง ตอนเปิดหน้า', (await page.evaluate(() => window.__spoke || 0)) === 0);
  const noonTakeBtns = page.locator('app-slot-group[data-slot=noon] button.take');
  check('มื้อที่เปิด: ปุ่ม "กินแล้ว" 3 ปุ่ม', (await noonTakeBtns.count()) === 3);
  check('มื้อที่เปิด: มีปุ่ม "กินครบมื้อนี้"', (await page.locator('app-slot-group[data-slot=noon] .yt-all-btn').count()) === 1);
  check('มื้อถัดไปที่พับ: ไม่มีปุ่ม "กินแล้ว" และไม่มี "กินครบมื้อนี้"', (await page.locator('app-slot-group[data-slot=evening] button.take, app-slot-group[data-slot=evening] .yt-all-btn').count()) === 0);
  check('มื้อถัดไป (พับ): หัวรูปแบบเดียวกับมื้อที่กาง "เย็น · HH:MM" + chip "มื้อถัดไป" + ชื่อยา + "อีก … ชม."', await page.evaluate(() => {
    const t = document.querySelector('app-slot-group[data-slot=evening]')?.innerText ?? '';
    return /เย็น · \d\d:\d\d/.test(t) && /อีก \d+ ชม/.test(t) && /มื้อถัดไป/.test(t) && !/มื้อถัดไป · /.test(t);
  }));
  check('มื้อที่กินครบ (พับ): แถวเดียว [✓] ชื่อ | เวลา | ˅ (˅ ไม่ลงบรรทัดใหม่)', await page.evaluate(() => {
    const f = document.querySelector('app-slot-group[data-slot=morning] .fold--done');
    if (!f) return false;
    const mid = (e) => { const b = e.getBoundingClientRect(); return b.top + b.height / 2; };
    const ic = f.querySelector('.ic'), ch = f.querySelector('.fch');
    return Math.abs(mid(ic) - mid(ch)) < 6 && ch.getBoundingClientRect().right <= f.getBoundingClientRect().right;
  }));
  check('มื้อที่เลยเวลา: chip "เลยเวลา 2 ชม."', /เลยเวลา 2 ชม\./.test(await page.locator('app-slot-group[data-slot=noon]').innerText()));
  check('ยาที่ยาวมาก: ตัดบรรทัดไม่ล้น (ไม่เลื่อนแนวนอน)', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));

  // กางมื้อถัดไป : ได้แถวยาพร้อมปุ่มกินแล้ว (กินล่วงหน้าตามเดิม) แต่ไม่มี "กินครบมื้อนี้"
  await page.locator('app-slot-group[data-slot=evening] button.fold').click();
  await page.waitForTimeout(250);
  check('กางมื้อถัดไป: มีปุ่ม "กินแล้ว" ของยา (พฤติกรรมเดิม)', (await page.locator('app-slot-group[data-slot=evening] button.take').count()) === 1);
  check('กางมื้อถัดไป: ไม่มี "กินครบมื้อนี้"', (await page.locator('app-slot-group[data-slot=evening] .yt-all-btn').count()) === 0);
  await page.locator('app-slot-group[data-slot=evening] .fold-btn').click();
  await page.waitForTimeout(200);
  check('พับกลับได้', (await page.locator('app-slot-group[data-slot=evening] button.take').count()) === 0);

  // กินทีละตัว
  await noonTakeBtns.first().click();
  await page.waitForTimeout(400);
  check('กดกินแล้วทีละตัว → POST /take ของยาตัวแรก (id 2)', calls.take.length === 1 && calls.take[0] === 2, JSON.stringify(calls.take));

  // กินครบมื้อนี้ (เหลือ 2 ตัว: id 3, 5)
  check('หลังกิน 1 ตัว ยังมี "กินครบมื้อนี้" (เหลือ 2 ตัว)', (await page.locator('app-slot-group[data-slot=noon] .yt-all-btn').count()) === 1);
  await page.locator('app-slot-group[data-slot=noon] .yt-all-btn').click();
  await page.waitForTimeout(500);
  check('กินครบมื้อนี้ → คำขอเดียว ส่งเฉพาะ id ที่ยังไม่กิน (3, 5)', calls.many.length === 1 && [...calls.many[0]].sort().join() === '3,5', JSON.stringify(calls.many));
  check('แจ้ง "บันทึก 2 รายการแล้วค่ะ"', /บันทึก 2 รายการแล้วค่ะ/.test(await text(page)));
  await ctx.close();
}

// ---------- ออฟไลน์ : กินครบมื้อนี้ กดไม่ได้ ----------
{
  const { ctx, page, calls } = await open('late');
  await ctx.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline'))); await page.waitForTimeout(400);
  await page.locator('app-slot-group[data-slot=noon] .yt-all-btn').click({ force: true }); await page.waitForTimeout(300);
  check('ออฟไลน์: แตะ "กินครบมื้อนี้" ไม่ส่งคำขอ', calls.many.length === 0);
  check('ออฟไลน์: แจ้ง "ต่ออินเทอร์เน็ตก่อนนะคะ" ครั้งเดียว', ((await text(page)).match(/ต่ออินเทอร์เน็ตก่อนนะคะ/g) ?? []).length === 1);
  await ctx.close();
}

// ---------- ตัวนับ "อีก n นาที" เดินตามนาฬิกา (ปัดขึ้น) ----------
{
  const { ctx, page } = await open('soon', { clock: true });
  const remain = async () => ((await page.locator('app-slot-group[data-mode=next]').innerText()).match(/อีก (\d+) นาที/) ?? [])[1] ?? null;
  const first = Number(await remain());
  check('ก่อนนอนอีก 5 นาที (ปัดขึ้น) ที่เริ่มต้น', first === 5 || first === 4, `ได้ ${first}`);
  await page.clock.runFor(60_000); await page.waitForTimeout(150);
  const second = Number(await remain());
  check('ผ่านไป 1 นาที → ลดลง 1 (นาฬิกาเดินจริง ไม่ค้างค่าตอนโหลด)', second === first - 1, `${first} → ${second}`);
  await page.clock.runFor(4 * 60_000); await page.waitForTimeout(250);
  const mode = await page.locator('app-slot-group').first().getAttribute('data-mode');
  check('ถึงเวลาแล้ว → มื้อเปลี่ยนเป็นเปิด + chip "ถึงเวลาแล้ว"', mode === 'open' && /ถึงเวลาแล้ว/.test(await page.locator('app-slot-group').first().innerText()), `โหมด ${mode}`);
  await ctx.close();
}

// ---------- กินครบทั้งวัน ----------
{
  const { ctx, page } = await open('done');
  const cheer = await page.locator('[data-first-screen=cheer]').boundingBox();
  check('กินครบทั้งวัน: น้องยาตรง L (กว้าง ≥ 100px) + ข้อความ', !!cheer && /วันนี้กินครบแล้ว เก่งมากเลยค่ะ/.test(await text(page)) && (await page.locator('[data-first-screen=cheer] app-mascot').boundingBox()).width >= 100);
  check('กินครบทั้งวัน: ไม่มีปุ่ม "กินครบมื้อนี้"', (await page.locator('.yt-all-btn').count()) === 0);
  await ctx.close();
}

await browser.close();
console.log(`\n${bad ? '✘ ไม่ผ่าน ' + bad : '✓ ผ่านทั้งหมด'}`);
process.exit(bad ? 1 : 0);
