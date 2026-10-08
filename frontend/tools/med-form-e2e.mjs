// ทดสอบหน้าเพิ่ม/แก้ไขยา (ใช้คอมโพเนนต์ app-med-fields): เพิ่มยา → แก้ไขยา → ค่าเดิมโหลดครบ → บันทึกแล้วค่าเปลี่ยน
// ต้องมี ng serve (4200) + docker (db, nodered) + DEMO_PASSWORD ; API ไม่มี DELETE → ตั้งชื่อ "E2E-ทดสอบ…" แล้วหยุดยาตอนจบ
import { launch, newPage, login, api, check, summary, BASE } from './lib/e2e.mjs';

const NAME = 'E2E-ทดสอบ ' + Date.now().toString().slice(-6);
const browser = await launch();
const { page } = await newPage(browser, { width: 1440, height: 1000 });
const token = await login(page);
const call = api(page, token);

console.log('เพิ่มยา');
await page.goto(BASE + '/medications/new');
await page.getByLabel('ชื่อยา').fill(NAME);
await page.getByRole('radio', { name: /กินตามเวลา/ }).click();
// ค่าเริ่มต้นคือมื้อเช้า → เพิ่มมื้อเย็น
await page.locator('.tile', { hasText: 'เย็น' }).click();
await page.getByRole('radio', { name: 'ก่อนอาหาร' }).click();
await page.getByRole('button', { name: 'เพิ่มปริมาณต่อครั้ง' }).click();        // 1 → 1.5
await page.locator('details.more summary').click();
await page.getByLabel(/ความแรง/).fill('250 mg');
await page.getByLabel(/ข้อบ่งใช้/).fill('ทดสอบ');
await page.getByLabel(/คำเตือน/).fill('ข้อแรก\nข้อสอง');
await page.getByLabel(/จำนวนยาทั้งหมด/).fill('30');
const text = await page.locator('.preview__text').innerText();
check('สรุปก่อนบันทึกถูกต้อง', /ทุกวัน.*เช้า.*เย็น.*ครั้งละ 1½ เม็ด ก่อนอาหาร/.test(text), text);
await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
await page.waitForURL('**/medications', { timeout: 10000 });

const list = await call('GET', '/api/medications');
const med = list.body.find((m) => m.name === NAME);
check('ยาถูกสร้าง', !!med);
check('ค่าที่บันทึก', med && med.strength === '250 mg' && med.dose_per_time === 1.5 && med.meal_relation === 'before'
  && med.total_qty === 30 && med.indication === 'ทดสอบ' && med.warnings.length === 2 && med.slots.join() === 'morning,evening', JSON.stringify(med));

console.log('แก้ไขยา: ค่าเดิมต้องโหลดครบ');
await page.goto(BASE + `/medications/${med.id}/edit`);
await page.getByLabel('ชื่อยา').waitFor();
await page.waitForFunction(() => document.querySelector('input')?.value);
check('ชื่อ', (await page.getByLabel('ชื่อยา').inputValue()) === NAME);
check('มื้อเช้า/เย็นถูกเลือก', (await page.locator('.tile[aria-pressed=true]').count()) === 2);
check('ก่อนอาหารถูกเลือก', (await page.getByRole('radio', { name: 'ก่อนอาหาร' }).getAttribute('aria-checked')) === 'true');
check('ข้อมูลเพิ่มเติมเปิดอยู่', await page.locator('details.more').evaluate((d) => d.open));
check('ความแรง', (await page.getByLabel(/ความแรง/).inputValue()) === '250 mg');
check('คำเตือน 2 บรรทัด', (await page.getByLabel(/คำเตือน/).inputValue()) === 'ข้อแรก\nข้อสอง');
check('จำนวนทั้งหมด', (await page.getByLabel(/จำนวนยาทั้งหมด/).inputValue()) === '30');
check('ปริมาณ 1½', /1½/.test(await page.locator('app-stepper output').innerText()));

console.log('แก้แล้วออกโดยไม่บันทึกต้องถาม → กลับไปแก้ → บันทึก');
await page.getByRole('radio', { name: 'หลังอาหาร' }).click();
await page.getByRole('button', { name: 'เพิ่มปริมาณต่อครั้ง' }).click();        // → 2
await page.getByRole('link', { name: 'ยาของฉัน' }).first().click();
check('มี dialog ถามก่อนออก', await page.getByRole('dialog').getByText('ออกโดยไม่บันทึก?').isVisible());
await page.getByRole('button', { name: 'กลับไปแก้ไข' }).click();
await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
await page.waitForURL('**/medications', { timeout: 10000 });
const after = (await call('GET', `/api/medications/${med.id}`)).body;
check('ค่าหลังแก้', after.meal_relation === 'after' && after.dose_per_time === 2, JSON.stringify(after));

console.log('validate: ไม่ใส่ชื่อ');
await page.goto(BASE + '/medications/new');
await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
await page.getByText('กรุณากรอกชื่อยา').waitFor({ timeout: 3000 }).catch(() => {});
check('ขึ้น error ใต้ช่องชื่อ', await page.getByText('กรุณากรอกชื่อยา').isVisible());
check('ช่องชื่อ aria-invalid + describedby', (await page.getByLabel('ชื่อยา').getAttribute('aria-invalid')) === 'true'
  && !!(await page.getByLabel('ชื่อยา').getAttribute('aria-describedby')));
await page.getByRole('radio', { name: /กินเมื่อมีอาการ/ }).click();
await page.waitForTimeout(400);
check('เลือกกินเมื่อมีอาการ → ไม่มีมื้อที่เลือก', (await page.locator('.tile[aria-pressed=true]').count()) === 0);

await call('PATCH', `/api/medications/${med.id}/stop`);
await browser.close();
process.exit(summary() ? 0 : 1);
