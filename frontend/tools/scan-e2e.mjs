// ทดสอบหน้า /scan ในเบราว์เซอร์จริง: node tools/scan-e2e.mjs
// ต้องมี ng serve + docker (nodered) และ DEMO_PASSWORD ใน env หรือ ../.env ; รูปทดสอบสร้างด้วย sharp
import { chromium } from 'playwright';
import sharp from 'sharp';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const env = { ...process.env };
try {
  for (const l of readFileSync(new URL('../../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^(\w+)=(.*)$/); if (m && !(m[1] in env)) env[m[1]] = m[2];
  }
} catch {}
const BASE = env.BASE ?? 'http://localhost:4200';
const OUT = new URL('../../docs/screenshots/scan/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

// รูปทดสอบ: ซองสังเคราะห์ 1600×1000 (ปกติ), 400×300 (เล็ก), 1600×1000 มืด
const svg = (w, h, bg) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${bg}"/><rect x="${w * .1}" y="${h * .15}" width="${w * .8}" height="${h * .7}" fill="#fff" opacity=".9"/><text x="${w * .15}" y="${h * .4}" font-size="${h / 10}" fill="#000">Metformin 500 mg</text><text x="${w * .15}" y="${h * .6}" font-size="${h / 14}" fill="#000">1 tab twice daily</text></svg>`);
const normal = await sharp(svg(1600, 1000, '#c8d4d0')).jpeg().toBuffer();
const small = await sharp(svg(400, 300, '#c8d4d0')).png().toBuffer();
const dark = await sharp(svg(1600, 1000, '#050505')).jpeg().toBuffer();
const darkDim = await sharp(dark).modulate({ brightness: 0.25 }).jpeg().toBuffer();

const results = [];
const check = (name, ok, extra = '') => { results.push([name, ok]); console.log(ok ? 'PASS' : 'FAIL', name, extra); };

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(BASE + '/login');
await page.locator('input[type=email], input[autocomplete=username]').first().fill(env.DEMO_EMAIL ?? 'demo@yatung.app');
await page.locator('input[type=password]').first().fill(env.DEMO_PASSWORD);
await page.keyboard.press('Enter');
await page.waitForURL('**/today', { timeout: 15000 });
await page.goto(BASE + '/scan');
await page.waitForSelector('app-scan-stage');
await page.waitForTimeout(800);

const previewSrc = () => page.locator('app-scan-capture .frame--image img').getAttribute('src').catch(() => null);
const hasImage = async () => (await page.locator('app-scan-capture .frame--image img').count()) > 0;
const info = () => page.locator('app-scan-capture .info').innerText().catch(() => '');

// ---- โครง: ไม่มี bottom nav บนมือถือ จะเช็กตอนท้าย; จอคอมมี sidebar ----
check('desktop: sidebar แสดง', await page.locator('aside.side').isVisible());
check('ไม่มีปุ่มหลักตอนยังไม่มีรูป (ไม่มีปุ่ม disabled)', (await page.locator('.act').count()) === 0 && (await page.locator('ion-button[disabled]').count()) === 0);
await page.screenshot({ path: OUT + 'e2e-01-empty-desktop.png' });

// ---- อัปโหลดด้วย file chooser ----
{
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'อัปโหลดรูปซองยา' }).click()]);
  await fc.setFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: normal });
  await page.waitForSelector('app-scan-capture .frame--image img');
  check('อัปโหลด: มีรูปพรีวิวเป็น blob URL', (await previewSrc())?.startsWith('blob:'), await info());
  check('อัปโหลด: ข้อมูลรูป 1600×1000', /1600×1000/.test(await info()));
  check('มีปุ่มหลักปุ่มเดียว', (await page.locator('.act ion-button').count()) === 1);
  check('รูปปกติ: ไม่มีคำเตือน', (await page.locator('app-scan-capture .yt-alert').count()) === 0);
  await page.screenshot({ path: OUT + 'e2e-02-uploaded-desktop.png' });
}

// ---- หมุนรูป ----
{
  const before = await info();
  await page.getByRole('button', { name: 'หมุนรูป 90 องศา' }).click();
  await page.waitForFunction((b) => document.querySelector('app-scan-capture .info')?.textContent !== b, before);
  check('หมุน 90°: ขนาดสลับเป็น 1000×1600', /1000×1600/.test(await info()), await info());
  await page.getByRole('button', { name: 'หมุนรูป 90 องศา' }).click();
  await page.waitForFunction(() => /1600×1000/.test(document.querySelector('app-scan-capture .info')?.textContent ?? ''));
  check('หมุน 180°: กลับเป็น 1600×1000', true);
}

// ---- สลับโหมดแล้วรูป/ข้อความยังอยู่ ----
{
  await page.getByRole('tab', { name: /พิมพ์เอง/ }).click().catch(() => page.locator('ion-segment-button[value=text]').click());
  await page.waitForSelector('app-scan-text-input');
  await page.locator('app-scan-text-input textarea').fill('Amlodipine 5 mg วันละ 1 ครั้ง');
  await page.locator('ion-segment-button[value=photo]').click();
  await page.waitForSelector('app-scan-capture');
  check('สลับกลับโหมดรูป: รูปยังอยู่', await hasImage());
  await page.locator('ion-segment-button[value=text]').click();
  await page.waitForSelector('app-scan-text-input textarea');
  check('สลับกลับโหมดพิมพ์: ข้อความยังอยู่', (await page.locator('app-scan-text-input textarea').inputValue()) === 'Amlodipine 5 mg วันละ 1 ครั้ง');
}

// ---- chip เติมที่ตำแหน่ง cursor + ใส่ตัวอย่าง ----
{
  const ta = page.locator('app-scan-text-input textarea');
  await ta.fill('AB');
  await ta.evaluate((el) => { el.focus(); el.setSelectionRange(1, 1); });
  await page.locator('ion-chip', { hasText: 'เช้า' }).click();
  await page.waitForTimeout(200);
  check('chip: เติมกลางข้อความและเว้นวรรค', (await ta.inputValue()) === 'A เช้า B', await ta.inputValue());
  await ta.fill('');
  await page.getByRole('button', { name: /ใส่ตัวอย่าง/ }).click();
  await page.waitForTimeout(300);
  check('ใส่ตัวอย่าง: เติมข้อความเต็ม', (await ta.inputValue()).startsWith('Metformin 500 mg'));
  check('ตัวนับใช้ .num', (await page.locator('.count.num').innerText()).includes('/ 1000'));
  await page.screenshot({ path: OUT + 'e2e-03-text-desktop.png' });
  await ta.fill('');
  await page.waitForTimeout(300);
  check('พิมพ์ < 5 ตัว: ไม่มีปุ่มหลัก', (await page.locator('.act').count()) === 0);
  await ta.fill('abcd');
  await page.waitForTimeout(300);
  check('พิมพ์ 4 ตัว: ยังไม่มีปุ่มหลัก', (await page.locator('.act').count()) === 0);
  await ta.fill('abcde');
  await page.waitForTimeout(300);
  check('พิมพ์ 5 ตัว: มีปุ่มหลัก', (await page.locator('.act ion-button').count()) === 1);
  await page.locator('ion-segment-button[value=photo]').click();
  await page.waitForSelector('app-scan-capture');
}

// ---- ลากวางไฟล์ (จำลอง DragEvent) ----
{
  const dropFile = (name, type, bytes) => page.evaluate(async ({ name, type, bytes }) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], name, { type }));
    const mk = (t) => new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true });
    window.dispatchEvent(mk('dragover'));
    await new Promise((r) => setTimeout(r, 150));
    const dragging = !!document.querySelector('.frame--empty.is-drag');
    const drop = mk('drop');
    document.body.dispatchEvent(drop);
    return { prevented: drop.defaultPrevented, dragging };
  }, { name, type, bytes: [...bytes] });

  // 1) ปล่อยไฟล์ที่ไม่ใช่รูป → toast ไทย
  await page.getByRole('button', { name: 'ลบรูป' }).click().catch(() => {});
  await page.waitForSelector('app-scan-capture .frame--empty', { timeout: 5000 }).catch(async () => { await page.screenshot({ path: OUT + 'e2e-debug.png' }); throw new Error('no frame--empty; url=' + page.url()); });
  let r = await dropFile('x.pdf', 'application/pdf', [1, 2, 3]);
  check('ลากวาง: preventDefault ระดับ window (กันเบราว์เซอร์เปิดไฟล์)', r.prevented);
  check('ลากวาง: กรอบเป็นเส้นประตอนลากเข้า', r.dragging);
  await page.waitForSelector('ion-toast', { timeout: 3000 }).catch(() => {});
  const toastText = await page.evaluate(() => document.querySelector('ion-toast')?.getAttribute('message') ?? document.querySelector('ion-toast')?.message ?? '');
  check('ลากวาง: ไฟล์ที่ไม่ใช่รูป → แจ้งเตือนภาษาไทย', /รองรับเฉพาะไฟล์รูป/.test(toastText), toastText);
  // 2) ปล่อยรูปจริง
  r = await dropFile('b.jpg', 'image/jpeg', normal);
  await page.waitForSelector('app-scan-capture .frame--image img', { timeout: 5000 }).catch(() => {});
  check('ลากวาง: รับรูปแล้วแสดงพรีวิว', await hasImage());
  // 3) ปล่อยไฟล์ใหม่ทับรูปเดิม + revoke URL เก่า
  const old = await previewSrc();
  await dropFile('c.png', 'image/png', small);
  await page.waitForFunction((o) => document.querySelector('app-scan-capture .frame--image img')?.getAttribute('src') !== o, old);
  check('ลากวางทับรูปเดิมได้ (รูปเล็กเปลี่ยนข้อมูล)', /400×300/.test(await info()), await info());
  check('รูปเล็ก: มีคำเตือน "รูปเล็กไป"', (await page.locator('app-scan-capture .yt-alert').allInnerTexts()).join().includes('รูปเล็กไป'));
  const revoked = await page.evaluate((u) => fetch(u).then(() => false).catch(() => true), old);
  check('revoke object URL เดิมเมื่อเปลี่ยนรูป', revoked);
  await page.screenshot({ path: OUT + 'e2e-04-dropped-small.png' });
}

// ---- Ctrl+V วางรูป / วางข้อความ ----
{
  const paste = (withImage, target) => page.evaluate(async ({ withImage, bytes, target }) => {
    const dt = new DataTransfer();
    if (withImage) dt.items.add(new File([new Uint8Array(bytes)], 'p.jpg', { type: 'image/jpeg' }));
    else dt.setData('text/plain', 'hello');
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    (target ? document.querySelector(target) : document.body).dispatchEvent(ev);
    return ev.defaultPrevented;
  }, { withImage, bytes: [...normal], target });

  await page.getByRole('button', { name: 'ลบรูป' }).click();
  await page.waitForSelector('app-scan-capture .frame--empty');
  check('paste ข้อความ (ไม่มีรูป): ไม่ preventDefault', (await paste(false)) === false);
  check('paste รูป: preventDefault แล้วรับรูป', (await paste(true)) === true);
  await page.waitForSelector('app-scan-capture .frame--image img');
  check('paste รูป: แสดงพรีวิว', await hasImage());
  // โหมดพิมพ์: ไม่รับรูป
  await page.locator('ion-segment-button[value=text]').click();
  await page.waitForSelector('app-scan-text-input textarea');
  check('paste รูปในโหมดพิมพ์: ไม่ preventDefault', (await paste(true, 'app-scan-text-input textarea')) === false);
  await page.locator('ion-segment-button[value=photo]').click();
}

// ---- รูปมืด/จ้า ----
{
  await page.getByRole('button', { name: 'ลบรูป' }).click();
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'อัปโหลดรูปซองยา' }).click()]);
  await fc.setFiles({ name: 'd.jpg', mimeType: 'image/jpeg', buffer: darkDim });
  await page.waitForSelector('app-scan-capture .frame--image img');
  const txt = (await page.locator('app-scan-capture .yt-alert').allInnerTexts()).join();
  check('รูปมืด: เตือน "รูปค่อนข้างมืด"', txt.includes('รูปค่อนข้างมืด'), txt);
  check('รูปมืด: ยังส่งได้ (มีปุ่มหลัก)', (await page.locator('.act ion-button').count()) === 1);
  await page.screenshot({ path: OUT + 'e2e-05-dark-warning.png' });
}

// ---- ส่งจริง (ไม่มี API วันที่ 4 → error) + state error ----
{
  await page.route('**/api/scan', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'UNREADABLE', details: 'AI อ่านซองยานี้ไม่ได้ ลองถ่ายให้ชัดขึ้น หรือพิมพ์เอง' }) }); });
  await page.locator('.act ion-button').click();
  await page.waitForSelector('app-scan-processing');
  check('กำลังประมวลผล: aria-busy บนการ์ด', (await page.locator('section.card').getAttribute('aria-busy')) === 'true');
  check('กำลังประมวลผล: segment ถูกปิด', await page.locator('ion-segment').evaluate((e) => e.disabled));
  await page.screenshot({ path: OUT + 'e2e-06-processing.png' });
  await page.waitForSelector('.side.is-error', { timeout: 8000 });
  check('422: แสดง state error (น้อง worried + ข้อความ)', (await page.locator('app-scan-coach .full').innerText()).includes('AI อ่านซองยานี้ไม่ได้'));
  check('error: ปุ่มหลักปุ่มเดียว "ลองถ่ายใหม่"', (await page.locator('.act ion-button').count()) === 2 && (await page.locator('.act ion-button').first().innerText()).includes('ลองถ่ายใหม่'));
  await page.screenshot({ path: OUT + 'e2e-07-error-desktop.png' });
  // พิมพ์ข้อมูลยาเอง: รูปเดิมยังอยู่ กลับมาได้
  await page.locator('.act ion-button').nth(1).click();
  await page.waitForSelector('app-scan-text-input');
  await page.locator('ion-segment-button[value=photo]').click();
  await page.waitForSelector('app-scan-capture');
  check('error → พิมพ์เอง → กลับโหมดรูป: รูปเดิมยังอยู่', await hasImage());
  // error ระดับระบบ → toast
  await page.unroute('**/api/scan');
  await page.route('**/api/scan', (route) => route.abort('failed'));
  await page.locator('.act ion-button').click();
  await page.waitForSelector('ion-toast', { timeout: 8000 });
  await page.waitForTimeout(400);
  const t2 = await page.evaluate(() => document.querySelector('ion-toast')?.message ?? '');
  check('เน็ตหลุด: แสดง ion-toast ด้านบน', /เชื่อมต่อเซิร์ฟเวอร์ไม่ได้/.test(t2), t2);
  check('เน็ตหลุด: กลับ idle พร้อมรูปเดิม (ส่งซ้ำได้)', (await hasImage()) && (await page.locator('.act ion-button').count()) === 1);
  await page.unroute('**/api/scan');
}

// ---- สำเร็จ → /review ไม่ถามยืนยัน ----
{
  const scan = { prescription_id: 99, ocr_text: 'Metformin 500 mg', result: { is_medicine_label: true, medications: [{ name: 'Metformin', strength: '500 mg', dose_per_time: 1, unit: 'tablet', slots: ['morning', 'evening'], meal_relation: 'after', as_needed: false, total_qty: 30, indication: null, warnings: [], source_text: '', confidence: { name: 1, dose: 1, slots: 1, meal_relation: 1 } }], unreadable_parts: ['ขอบซองขาด'], overall_note: null }, review_flags: [{ index: 0, field: 'dose', reason: 'ควรตรวจขนาดยา' }] };
  await page.route('**/api/scan', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(scan) }));
  await page.waitForTimeout(500);
  await page.locator('.act ion-button').click();
  await page.waitForURL('**/review/99', { timeout: 10000 });
  check('ส่งสำเร็จ: ไป /review/99 โดยไม่ถามยืนยัน', (await page.locator('mat-dialog-container').count()) === 0);
  await page.waitForSelector('.temp');
  check('Review: ป้ายทดสอบชั่วคราว + รายชื่อยา + flags', (await page.locator('.temp').innerText()).includes('ทำจริงวันที่ 5') && (await page.locator('.med h2').innerText()).includes('Metformin') && (await page.locator('.block').first().innerText()).includes('ควรตรวจขนาดยา'));
  await page.screenshot({ path: OUT + 'e2e-08-review.png' });
  await page.reload();
  await page.waitForSelector('.temp');
  check('Review หลังรีเฟรช: history.state ยังอยู่ จึงแสดงข้อมูลเดิม', (await page.locator('.med h2').count()) === 1);
  await page.goto(BASE + '/today');
  await page.goto(BASE + '/review/99');
  await page.waitForSelector('.empty');
  check('Review เปิดตรงๆ (ไม่มี state): "ไม่พบข้อมูล กรุณาสแกนใหม่"', (await page.locator('.empty').innerText()).includes('ไม่พบข้อมูล กรุณาสแกนใหม่'));
  await page.unroute('**/api/scan');
}

// ---- canDeactivate ----
{
  await page.goto(BASE + '/scan');
  await page.waitForSelector('app-scan-stage');
  await page.getByRole('link', { name: /วันนี้/ }).first().click();
  await page.waitForURL('**/today');
  check('ไม่มีอะไรให้ส่ง: ออกได้โดยไม่ถาม', true);
  await page.goto(BASE + '/scan');
  await page.waitForSelector('app-scan-stage');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'อัปโหลดรูปซองยา' }).click()]);
  await fc.setFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: normal });
  await page.waitForSelector('app-scan-capture .frame--image img');
  await page.getByRole('link', { name: /ยาของฉัน/ }).first().click();
  await page.waitForSelector('mat-dialog-container', { timeout: 3000 }).catch(() => {});
  check('มีรูปค้าง: ถามยืนยันก่อนออก', (await page.locator('mat-dialog-container').count()) === 1 && (await page.locator('mat-dialog-container').innerText()).includes('ออกจากหน้านี้เลยไหม'));
  await page.screenshot({ path: OUT + 'e2e-09-leave-dialog.png' });
  await page.getByRole('button', { name: 'อยู่ต่อ' }).click();
  await page.waitForTimeout(400);
  check('กด "อยู่ต่อ": ยังอยู่หน้า /scan พร้อมรูป', page.url().endsWith('/scan') && (await hasImage()));
}

// ---- มือถือ: ซ่อน bottom nav + sticky + ก++ ----
{
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  check('มือถือ: ซ่อน bottom nav บนหน้านี้', (await page.locator('nav.bottom').count()) === 0);
  check('มือถือ: ซ่อนแถบโลโก้', (await page.locator('header.top').count()) === 0);
  const sticky = await page.locator('.act').evaluate((e) => getComputedStyle(e).position);
  check('มือถือ: ปุ่มหลัก sticky', sticky === 'sticky', sticky);
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  check('มือถือ: ไม่มี scroll แนวนอน', noHScroll);
  await page.screenshot({ path: OUT + 'e2e-10-mobile-image.png' });
  // จอเตี้ยกว่าเนื้อหา: ปุ่ม sticky ต้องติดขอบล่างจอ (ก่อนเลื่อน)
  await page.setViewportSize({ width: 390, height: 600 });
  await page.waitForTimeout(400);
  await page.evaluate(() => { for (const e of document.querySelectorAll('*')) if (e.scrollTop) e.scrollTop = 0; });
  const box = await page.locator('.act ion-button').first().boundingBox();
  check('มือถือ: เนื้อหายาวกว่าจอ → ปุ่มหลักติดขอบล่างจอ', box && box.y + box.height > 600 - 40 && box.y + box.height <= 600, JSON.stringify(box));
  // เลื่อนลงสุด: disclaimer ไม่ถูกปุ่มบัง
  await page.evaluate(() => { for (const e of document.querySelectorAll('*')) if (e.scrollHeight > e.clientHeight + 8 && getComputedStyle(e).overflowY === 'auto') e.scrollTop = e.scrollHeight; });
  await page.waitForTimeout(300);
  const d = await page.locator('.yt-disclaimer').boundingBox();
  const a = await page.locator('.act').boundingBox();
  check('มือถือ: เลื่อนสุดแล้ว disclaimer ไม่ถูกปุ่ม sticky บัง', d.y >= a.y + a.height - 1 || d.y + d.height <= a.y + 1, JSON.stringify({ d, a }));
  await page.screenshot({ path: OUT + 'e2e-11-mobile-bottom.png' });
}

console.log('\n' + results.filter((r) => r[1]).length + '/' + results.length + ' passed');
await browser.close();
process.exit(results.every((r) => r[1]) ? 0 : 1);
