// e2e หน้า Review (วันที่ 5) ผ่านหน้าเว็บจริง + Node-RED จริง ไม่เรียก Gemini:
//   สแกน (AI_MOCK) → Review → แก้ช่องเหลือง → ถูกต้องแล้ว → บันทึก → ยาเข้าตาราง / เติมยาเดิม / ทิ้ง / refresh / ออกโดยไม่บันทึก / 409
// ต้องมี ng serve (4200) + docker (db, nodered ที่ AI_MOCK=true):
//   AI_MOCK=true docker compose up -d --force-recreate nodered ; cd frontend && node tools/review-e2e.mjs
// สร้าง user สุ่ม + ผลสแกนตัวอย่างใน DB แล้วลบทิ้งตอนจบ
import { launch, newPage, login, api, check, summary, BASE } from './lib/e2e.mjs';
import { SCENARIOS, insertDraft, makeUser, dropUser, sql } from './lib/seed.mjs';

const user = await makeUser('e2e');
const browser = await launch();
let ok = false;
try {
  const { page } = await newPage(browser, { width: 1440, height: 1000 });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('dialog', (d) => d.accept());
  const token = await login(page, user.email, user.password);
  const call = api(page, token);
  const card = (n) => page.locator('app-review-card').nth(n);
  const saveBtn = () => page.getByRole('button', { name: /บันทึก \d+ รายการ/ });
  const open = async (id) => { await page.goto(`${BASE}/review/${id}`); await page.locator('app-review-card, .state, #not-label').first().waitFor({ timeout: 15000 }); };
  const meds = async () => (await call('GET', '/api/medications')).body;
  const stopAll = async () => { for (const m of (await call('GET', '/api/medications?active=1')).body) await call('PATCH', `/api/medications/${m.id}/stop`); };   // ยาที่เพิ่งสร้างต้องไม่ไปทำให้ draft ถัดไปเจอ "ยาซ้ำ"
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  // เวลามื้อของ user ทดสอบ = อนาคตทั้งหมด (ถ้ายังไม่เลย 23:30) เพื่อให้ dose ของวันนี้ถูกสร้างและโผล่หน้า "วันนี้"
  const now = new Date(Date.now() + 7 * 3600e3); const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const futureSlots = nowMin <= 23 * 60 + 30;
  if (futureSlots) {
    const s = Math.min(nowMin + 3, 23 * 60 + 36);
    await call('PUT', '/api/settings/slot-times', { morning: hhmm(s), noon: hhmm(s + 6), evening: hhmm(s + 12), bedtime: hhmm(s + 18) });
  }

  console.log('\n1) สแกน (mock) → Review → บันทึก → ยาเข้าตาราง/หน้าวันนี้');
  const mockProbe = await call('POST', '/api/scan', { text: 'Metformin 500 mg วันละ 2 ครั้ง หลังอาหาร เช้า-เย็น' });
  const isMock = mockProbe.status === 200 && /AI_MOCK/.test(mockProbe.body?.result?.overall_note ?? '');
  check('nodered อยู่โหมด AI_MOCK=true (ไม่เปลืองโควตา Gemini)', isMock, 'รัน: AI_MOCK=true docker compose up -d --force-recreate nodered');
  if (!isMock) throw new Error('ต้องใช้ AI_MOCK=true');
  await call('POST', `/api/prescriptions/${mockProbe.body.prescription_id}/discard`);

  await page.goto(BASE + '/scan');
  await page.waitForSelector('app-scan-stage');
  await page.locator('ion-segment-button[value=text]').click(); await page.waitForTimeout(150);
  await page.locator('app-scan-text-input textarea').fill('Metformin 500 mg วันละ 2 ครั้ง หลังอาหาร เช้า-เย็น');
  await page.locator('.act ion-button').click(); await page.waitForTimeout(150);
  await page.waitForURL('**/review/*', { timeout: 20000 });
  await card(0).waitFor();
  check('หน้า Review ไม่มีป้าย "หน้าทดสอบชั่วคราว"', (await page.getByText('หน้าทดสอบชั่วคราว').count()) === 0);
  check('ตัวบอกขั้นตอน: ② ตรวจข้อมูล เป็นขั้นปัจจุบัน', (await page.locator('app-flow-steps [aria-current=step]').innerText()).includes('ตรวจข้อมูล'));
  check('แสดงยา Metformin (ฟอร์มเดียวกับหน้าเพิ่มยา)', (await card(0).getByLabel('ชื่อยา').inputValue()) === 'Metformin');
  check('ตรวจครบแล้ว (mock ไม่มี flag)', (await card(0).locator('.badge').innerText()).includes('ตรวจครบแล้ว'));
  check('มีประโยคสรุปท้ายการ์ด', /ทุกวัน เช้า และ เย็น ครั้งละ 1 เม็ด หลังอาหาร/.test(await card(0).locator('.sum').innerText()));
  check('ข้อความจากรูป: มีกล่องพับ "ข้อความที่น้องอ่านได้" และโหมดพิมพ์เอง แสดงข้อความที่พิมพ์แทนรูป',
    (await page.locator('details.ocr').count()) === 1 && (await page.locator('.typed__t').innerText()).includes('Metformin 500 mg'));
  check('ปุ่มบันทึกใช้ได้ และเขียน "เข้าตารางยา"', await saveBtn().isEnabled() && /เข้าตารางยา/.test(await saveBtn().innerText()));
  await saveBtn().click(); await page.waitForTimeout(150);
  await page.getByText(/บันทึกแล้ว/).first().waitFor({ timeout: 10000 });
  check('ขั้น ③ บันทึกแล้ว 1 รายการ + รายชื่อยา', (await page.locator('.state').innerText()).includes('Metformin'));
  check('แสดงข้อความ "รอบ…ผ่านไปแล้ว" เฉพาะมื้อที่เลยเวลา', futureSlots ? !/ผ่านไปแล้ว/.test(await page.locator('.state').innerText()) : /ผ่านไปแล้ว/.test(await page.locator('.state').innerText()));
  let list = await meds();
  check('ยาใหม่อยู่ในตาราง (API)', list.some((m) => m.name === 'Metformin' && m.is_active));
  await page.getByRole('link', { name: 'ดูตารางยาวันนี้' }).click(); await page.waitForTimeout(150);
  await page.waitForURL('**/today');
  if (futureSlots) {
    await page.getByText('Metformin').first().waitFor({ timeout: 8000 });
    check('หน้าวันนี้มียาใหม่', true);
  } else console.log('  - ข้ามตรวจหน้าวันนี้ (เลย 23:30 แล้ว ทุกมื้อของวันนี้ผ่านไปแล้ว)');
  const firstMetId = list.find((m) => m.name === 'Metformin').id;

  console.log('\n2) มี flag: แก้ช่องเหลือง / ถูกต้องแล้ว / ไปจุดถัดไป');
  const idFlags = insertDraft(user, SCENARIOS.flags());
  await open(idFlags);
  check('3 การ์ด', (await page.locator('app-review-card').count()) === 3);
  check('กรอบคำพูดสรุป: 3 รายการ 4 จุด', (await page.locator('app-speech-bubble .full').innerText()).includes('3 รายการ') && (await page.locator('app-speech-bubble .full').innerText()).includes('4 จุด'));
  check('แสดง unreadable_parts + overall_note ทุกข้อ (3 ข้อ)', (await page.locator('.alerts li').count()) === 3);
  check('ป้ายหัวการ์ด: ตรวจอีก 2 จุด', (await card(0).locator('.badge').innerText()).replace(/\s+/g, ' ').includes('ตรวจอีก 2 จุด'));
  check('ช่องเหลืองมีไอคอน + เหตุผล (4 จุด)', (await page.locator('.flag').count()) === 4 && (await page.locator('.flag app-icon').count()) >= 4);
  const mealFlagId = await card(0).locator('.yt-field[id$="-meal"]').getAttribute('aria-describedby');
  check('ช่องก่อน/หลังอาหารผูก aria-describedby กับเหตุผล', !!mealFlagId && (await page.locator('#' + mealFlagId.split(' ').pop()).innerText()).includes('ไม่ระบุ'));
  check('ปุ่ม "ถูกต้องแล้ว" มีเฉพาะช่องที่มีค่า (ก่อน/หลังอาหารที่ว่าง และมื้อที่ว่าง กดผ่านไม่ได้) = 2 ปุ่ม', (await page.getByRole('button', { name: 'ถูกต้องแล้ว' }).count()) === 2);
  check('ปุ่มบันทึกปิด + บอกเหตุผลใต้ปุ่ม', await saveBtn().isDisabled() && (await page.locator('#why').innerText()).includes('ยังเหลือ 4 จุด'));
  check('แถบล่าง "เหลือ 4 จุด" (aria-live)', (await page.locator('.bar__why').getAttribute('role')) === 'status');
  await page.getByRole('button', { name: /ไปจุดถัดไป/ }).click(); await page.waitForTimeout(150);
  await page.waitForTimeout(500);
  check('ไปจุดถัดไป → โฟกัสอยู่ในการ์ดแรก', await page.evaluate(() => !!document.activeElement?.closest('app-review-card') && document.activeElement.closest('app-review-card') === document.querySelectorAll('app-review-card')[0]));
  await card(0).getByRole('radio', { name: 'หลังอาหาร' }).click(); await page.waitForTimeout(150);                                 // แก้ช่องว่างจริง
  check('เลือกก่อน/หลังอาหารแล้ว ช่องหายเหลือง (เหลือ 3 จุด)', (await card(0).locator('.flag').count()) === 1 && (await page.locator('#why').innerText()).includes('ยังเหลือ 3 จุด'));
  await card(0).getByRole('button', { name: 'ถูกต้องแล้ว' }).click(); await page.waitForTimeout(150);                              // dose ของ PARACETAMOL
  check('กด "ถูกต้องแล้ว" → การ์ดแรกตรวจครบ', (await card(0).locator('.badge').innerText()).includes('ตรวจครบแล้ว'));
  await card(1).getByRole('button', { name: 'เพิ่มปริมาณต่อครั้ง' }).click(); await page.waitForTimeout(150);                       // แก้ dose ของ AMLODIPINE (0.5 → 1)
  check('แก้ค่าจำนวนต่อครั้ง → ช่องหายเหลือง', (await card(1).locator('.flag').count()) === 0);
  await card(1).getByRole('button', { name: 'ลดปริมาณต่อครั้ง' }).click(); await page.waitForTimeout(150);                          // กลับเป็นค่าเดิม 0.5 → ต้องกลับมาเหลืองอีก (ยังไม่ได้ยืนยัน)
  check('แก้กลับเป็นค่าที่ AI อ่านได้ → กลับมาต้องตรวจ', (await card(1).locator('.flag').count()) === 1);
  await card(1).getByRole('button', { name: 'ถูกต้องแล้ว' }).click(); await page.waitForTimeout(150);                              // ยืนยันว่า ½ เม็ดถูก
  check('ยืนยัน ½ เม็ด → การ์ด 2 ตรวจครบ', (await card(1).locator('.badge').innerText()).includes('ตรวจครบแล้ว'));
  check('ยังบันทึกไม่ได้ (การ์ด 3 ไม่มีมื้อ)', await saveBtn().isDisabled() && (await page.locator('#why').innerText()).includes('SIMVASTATIN'));
  await card(2).locator('.tile', { hasText: 'เย็น' }).click(); await page.waitForTimeout(150);
  check('เลือกมื้อ → ตรวจครบทุกจุด ปุ่มบันทึกใช้ได้', await saveBtn().isEnabled() && (await page.locator('#why').count()) === 0);

  console.log('\n3) ลบการ์ด + เลิกทำ / เพิ่มยาที่น้องอ่านไม่เจอ');
  await card(1).getByRole('button', { name: 'ลบรายการนี้' }).click(); await page.waitForTimeout(150);
  check('ลบแล้วเหลือ 2 การ์ด', (await page.locator('app-review-card').count()) === 2);
  await page.getByRole('button', { name: 'เลิกทำ' }).click(); await page.waitForTimeout(150);
  check('เลิกทำ → กลับมา 3 การ์ดตามลำดับเดิม (AMLODIPINE อยู่ตัวที่ 2)', (await page.locator('app-review-card').count()) === 3 && (await card(1).getByLabel('ชื่อยา').inputValue()) === 'AMLODIPINE');
  check('ที่ตรวจไว้ไม่หาย (ยังบันทึกได้)', await saveBtn().isEnabled());
  await page.getByRole('button', { name: /เพิ่มยาที่น้องอ่านไม่เจอ/ }).click(); await page.waitForTimeout(150);
  check('เพิ่มการ์ดที่ 4 → ต้องใส่ชื่อก่อนบันทึก', (await page.locator('app-review-card').count()) === 4 && await saveBtn().isDisabled() && (await page.locator('#why').innerText()).includes('ชื่อยา'));
  await card(3).getByLabel('ชื่อยา').fill('ยาที่เพิ่มเอง');
  check('ใส่ชื่อแล้วบันทึกได้', await saveBtn().isEnabled());

  console.log('\n4) บันทึก 4 รายการ แล้วตรวจค่าที่เข้าตารางยา');
  await saveBtn().click(); await page.waitForTimeout(150);
  await page.getByText(/บันทึกแล้ว/).first().waitFor({ timeout: 10000 });
  check('ขั้น ③ แสดง 4 รายการ', (await page.locator('.done li').count()) === 4);
  list = await meds();
  const by = (n) => list.find((m) => m.name === n);
  check('PARACETAMOL: หลังอาหาร (ที่ผู้ใช้เลือก) + เมื่อมีอาการ + ไม่มีมื้อ', by('PARACETAMOL')?.meal_relation === 'after' && by('PARACETAMOL')?.as_needed === true && by('PARACETAMOL')?.slots.length === 0);
  check('AMLODIPINE: ½ เม็ด (ที่ผู้ใช้ยืนยัน)', by('AMLODIPINE')?.dose_per_time === 0.5);
  check('SIMVASTATIN: มื้อเย็นที่เลือก', by('SIMVASTATIN')?.slots.join() === 'evening');
  check('ยาที่เพิ่มเอง', !!by('ยาที่เพิ่มเอง'));
  const pres = sql(`SELECT status, image_path IS NULL FROM prescriptions WHERE id=${idFlags};`).split('\t');
  check('prescription = confirmed และรูปถูกลบ', pres[0] === 'confirmed' && pres[1] === '1');

  console.log('\n5) ยาซ้ำ: เติมจำนวนให้ยาเดิม / เพิ่มเป็นยาใหม่');
  await call('PATCH', `/api/medications/${firstMetId}/stop`);   // ล้างของรอบแรกก่อน
  const mk = await call('POST', '/api/medications', { name: 'Metformin', strength: '500 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'after', as_needed: false, slots: ['morning'], total_qty: 30, remaining_qty: 5 });
  const metId = mk.body.id;
  const idDup = insertDraft(user, SCENARIOS.dup());
  await open(idDup);
  check('เจอยาซ้ำ: "คุณมี Metformin 500 mg ในตารางแล้ว (เหลือ 5 เม็ด)"', /คุณมี\s*Metformin 500 mg\s*ในตารางแล้ว\s*\(เหลือ\s*5\s*เม็ด\)/.test((await card(0).locator('.match').innerText()).replace(/\s+/g, ' ')));
  check('ค่าเริ่มต้น = เติมจำนวน (ฟอร์มยุบเหลือช่องจำนวน ค่า = 60)', (await card(0).getByRole('radio', { name: /เติมจำนวน/ }).getAttribute('aria-checked')) === 'true' && (await card(0).getByLabel(/เติมกี่/).inputValue()) === '60' && (await card(0).getByLabel('ชื่อยา').count()) === 0);
  check('ประโยคสรุป: เติม 60 เม็ด (จะเหลือ 65 เม็ด)', /เติม 60 เม็ด.*จะเหลือ 65 เม็ด/.test(await card(0).locator('.sum').innerText()));
  await card(0).getByLabel(/เติมกี่/).fill('50');
  check('แก้จำนวนเติมได้ (จะเหลือ 55)', /จะเหลือ 55 เม็ด/.test(await card(0).locator('.sum').innerText()));
  await saveBtn().click(); await page.waitForTimeout(150);
  await page.getByText(/บันทึกแล้ว/).first().waitFor({ timeout: 10000 });
  const m1 = (await call('GET', `/api/medications/${metId}`)).body;
  check('เติมแล้ว remaining = 55, total = 80', m1.remaining_qty === 55 && m1.total_qty === 80, JSON.stringify([m1.remaining_qty, m1.total_qty]));
  check('ไม่สร้างยา Metformin ซ้ำ + สร้าง Losartan', (await meds()).filter((m) => m.name.toLowerCase() === 'metformin' && m.is_active).length === 1 && (await meds()).some((m) => m.name === 'Losartan'));

  const idDup2 = insertDraft(user, SCENARIOS.dup());
  await open(idDup2);
  await card(0).getByRole('radio', { name: /เพิ่มเป็นยาใหม่/ }).click(); await page.waitForTimeout(150);
  check('เลือก "เพิ่มเป็นยาใหม่" → ฟอร์มเต็มกลับมา', (await card(0).getByLabel('ชื่อยา').inputValue()) === 'metformin');
  check('ยังไม่มีอะไรต้องตรวจ (mock ไม่มี flag)', await saveBtn().isEnabled());
  await saveBtn().click(); await page.waitForTimeout(150);
  await page.getByText(/บันทึกแล้ว/).first().waitFor({ timeout: 10000 });
  check('สร้างเป็นยาใหม่ (Metformin 2 ตัว active)', (await meds()).filter((m) => m.name.toLowerCase() === 'metformin' && m.is_active).length === 2);

  console.log('\n6) ทิ้งผลสแกน / ออกโดยไม่บันทึก / refresh / 409');
  const idDis = insertDraft(user, SCENARIOS.clean());
  await open(idDis);
  const imgRel = sql(`SELECT image_path FROM prescriptions WHERE id=${idDis};`);
  await page.getByRole('button', { name: 'ทิ้งผลสแกนนี้' }).click(); await page.waitForTimeout(150);
  await page.getByRole('dialog').getByText('ทิ้งผลสแกนนี้?').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'กลับไปตรวจต่อ' }).click(); await page.waitForTimeout(150);
  check('ยกเลิกใน dialog → ยังอยู่หน้าเดิม', page.url().endsWith('/review/' + idDis));
  await page.getByRole('button', { name: 'ทิ้งผลสแกนนี้' }).click(); await page.waitForTimeout(150);
  await page.getByRole('dialog').getByRole('button', { name: 'ทิ้งผลสแกน' }).click(); await page.waitForTimeout(150);
  await page.waitForURL('**/scan', { timeout: 10000 });
  check('ทิ้งแล้วกลับหน้า Scan', true);
  check('status = discarded + รูปถูกลบ', sql(`SELECT status FROM prescriptions WHERE id=${idDis};`) === 'discarded' && !!imgRel && sql(`SELECT image_path IS NULL FROM prescriptions WHERE id=${idDis};`) === '1');
  await page.goto(`${BASE}/review/${idDis}`);
  await page.getByText('ผลสแกนนี้ถูกทิ้งแล้ว').waitFor();
  check('เปิดลิงก์ที่ทิ้งแล้ว → "ผลสแกนนี้ถูกทิ้งแล้ว" + ปุ่มสแกนใหม่', (await page.getByRole('link', { name: 'สแกนซองใหม่' }).count()) === 1);
  await page.goto(`${BASE}/review/${idFlags}`);
  await page.getByText('บันทึกไปแล้ว').first().waitFor();
  check('เปิดลิงก์ที่บันทึกแล้ว → "บันทึกไปแล้ว" + ปุ่มไปหน้ายาของฉัน', (await page.getByRole('link', { name: 'ไปหน้ายาของฉัน' }).count()) === 1);
  await page.goto(`${BASE}/review/99999999`);
  await page.getByText('ไม่พบข้อมูล กรุณาสแกนใหม่').waitFor();
  check('id ที่ไม่มี → ไม่พบข้อมูล', true);

  await stopAll();
  const idRef = insertDraft(user, SCENARIOS.flags());
  await open(idRef);
  await card(0).getByRole('radio', { name: 'ก่อนอาหาร' }).click(); await page.waitForTimeout(150);
  await page.reload();
  await card(0).waitFor();
  check('refresh: ข้อมูลของ AI ยังอยู่ครบ (3 การ์ด, flag เดิม; ค่าที่แก้ยังไม่บันทึกจึงกลับเป็นของ AI)', (await page.locator('app-review-card').count()) === 3 && (await page.locator('.flag').count()) === 4);
  check('refresh: รูปซองโหลดซ้ำได้', await page.locator('.pic__btn img').waitFor({ timeout: 8000 }).then(() => true).catch(() => false));

  const idLeave = insertDraft(user, SCENARIOS.clean());
  page.removeAllListeners('dialog');
  await open(idLeave);
  await page.getByRole('link', { name: 'ย้อนกลับ' }).click(); await page.waitForTimeout(150);
  check('ไม่ได้แก้อะไร → ออกได้ทันที (ไม่มี dialog)', page.url().endsWith('/scan'));
  await open(idLeave);
  await card(0).getByLabel('ชื่อยา').fill('Metformin แก้แล้ว');
  await page.getByRole('link', { name: 'ย้อนกลับ' }).click(); await page.waitForTimeout(150);
  check('แก้แล้วยังไม่บันทึก → มี dialog ถามก่อนออก', await page.getByRole('dialog').getByText('ออกโดยไม่บันทึก?').isVisible());
  await page.getByRole('button', { name: 'กลับไปตรวจต่อ' }).click(); await page.waitForTimeout(150);
  check('กลับไปตรวจต่อ → ยังอยู่หน้าเดิม และค่าที่แก้ยังอยู่', page.url().endsWith('/review/' + idLeave) && (await card(0).getByLabel('ชื่อยา').inputValue()) === 'Metformin แก้แล้ว');

  // 409: กดบันทึกซ้ำจากอีกแท็บ (สถานะเปลี่ยนไปแล้วระหว่างที่หน้านี้ยังเปิดอยู่) → แสดง "บันทึกไปแล้ว" ไม่ใช่ error
  await call('POST', `/api/prescriptions/${idLeave}/confirm`, { items: [{ action: 'create', medication: { name: 'อีกแท็บบันทึกแล้ว', dose_per_time: 1, unit: 'tablet', meal_relation: 'after', as_needed: false, slots: ['morning'] } }] });
  await saveBtn().click(); await page.waitForTimeout(150);
  await page.getByText('บันทึกไปแล้ว').first().waitFor({ timeout: 8000 });
  check('409 ตอนกดบันทึก → สถานะ "บันทึกไปแล้ว" (ไม่มีกล่อง error)', (await page.locator('.yt-alert--danger').count()) === 0);

  console.log('\n7) อาจไม่ใช่ซองยา');
  await stopAll();
  const idNot = insertDraft(user, SCENARIOS.notlabel());
  await open(idNot);
  check('แสดง "รูปนี้อาจไม่ใช่ซองยา" พร้อม 2 ปุ่ม และยังไม่แสดงการ์ดยา', (await page.locator('#not-label').count()) === 1 && (await page.locator('app-review-card').count()) === 0
    && (await page.getByRole('button', { name: 'เป็นซองยาจริง ตรวจต่อ' }).count()) === 1 && (await page.getByRole('button', { name: 'สแกนใหม่' }).count()) === 1);
  check('บันทึกไม่ได้ + บอกเหตุผล', await saveBtn().isDisabled() && (await page.locator('#why').innerText()).includes('ซองยา'));
  await page.getByRole('button', { name: 'เป็นซองยาจริง ตรวจต่อ' }).click(); await page.waitForTimeout(150);
  check('ตรวจต่อ → แสดงการ์ด (ชื่อยามั่นใจต่ำ ต้องตรวจ)', (await page.locator('app-review-card').count()) === 1 && (await card(0).locator('.flag').count()) === 1);
  await card(0).getByRole('button', { name: 'ถูกต้องแล้ว' }).click(); await page.waitForTimeout(150);
  check('ยืนยันชื่อแล้วบันทึกได้', await saveBtn().isEnabled());

  console.log('\n8) การเข้าถึง / ขนาดตัวอักษร 125% บนมือถือ');
  const idA11y = insertDraft(user, SCENARIOS.flags());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.setItem('yatung_font_scale', '125'));
  await open(idA11y);
  await page.reload(); await card(0).waitFor();
  const over = await page.evaluate(() => {
    const bad = [];
    for (const e of document.querySelectorAll('app-review-page *')) {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1) && !e.closest('.cdk-visually-hidden,.sr-only') && getComputedStyle(e).position !== 'absolute') bad.push(e.tagName + '.' + e.className);
    }
    return bad.slice(0, 5);
  });
  check('125% ที่ 390px ไม่มี element ล้นจอ', over.length === 0, over.join(' '));
  const small = await page.evaluate(() => [...document.querySelectorAll('app-review-card input:not([type=hidden]), app-review-page button.mat-mdc-button-base, app-review-card .tile, app-review-card [role=radio]')]
    .filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height < 55).map((e) => e.tagName + ' ' + Math.round(e.getBoundingClientRect().height)));
  check('ช่องกรอก/ปุ่มหลัก/ตัวเลือก สูง ≥ 56px', small.length === 0, small.slice(0, 5).join(', '));
  check('ตัวเลขใช้ class .num', (await page.locator('app-review-card .num').count()) > 0);
  await page.evaluate(() => localStorage.setItem('yatung_font_scale', '100'));

  ok = summary();
} catch (e) {
  console.error('\nล้มเหลว:', e.message);
  summary();
} finally {
  await browser.close();
  dropUser(user);
}
process.exit(ok ? 0 : 1);
