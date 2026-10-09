# วันที่ 6 — LINE Official Account + ngrok + แจ้งเตือนกินยา + ปุ่ม "กินแล้ว"

> เอกสารนี้รวมทุกอย่างที่ตกลงกันแล้วสำหรับวันที่ 6 ไว้ในไฟล์เดียว:
> (1) ขอบเขตงาน (2) แผนที่ Claude Code เสนอและผ่านการอนุมัติแล้ว (3) คำตอบของคำถามที่ต้องตัดสินใจ
> ถ้าข้อไหนขัดกัน ให้ยึด **ส่วนที่ 3 → ส่วนที่ 2 → ส่วนที่ 1** ตามลำดับ

อ่าน CLAUDE.md ก่อน แล้วทำตาม convention เดิมทั้งหมด
- lib service เรียกผ่าน global.get และ function node ให้บาง
- ตั้งชื่อ node เป็นภาษาไทย และจัดเป็น group
- หยุด nodered ก่อนแก้ flows.json
- สร้าง tab ใหม่ ห้ามใช้เลข 5 เพราะจองไว้ให้ Dashboard

## ขั้นตอนการทำงาน
1. ~~เสนอแผน~~ ทำแล้ว แผนได้รับอนุมัติแล้ว (ส่วนที่ 2)
2. ทำ **6A** → รันเทสทั้งหมด (เทสเดิมทุกชุดต้องผ่านด้วย) → รายงานผล → commit
3. ทำ **6B** → รันเทสทั้งหมด → รายงานผล → commit
4. commit แยกตามช่วง ห้ามใส่ `.sessions.json` และ `screenshots/` ลงใน commit

---

# ส่วนที่ 1 — ขอบเขตงาน

## ด่านความปลอดภัย (ตรวจแล้ว)
- ตรวจชื่อตัวแปรใน .env แล้ว ครบ ห้ามแสดงค่าของตัวแปร
- NODE_RED_ADMIN_HASH ยังเป็นค่า demo1234 อยู่ **ผู้ใช้กำลังเปลี่ยนเอง** เริ่มเขียนโค้ดได้เลย แต่ห้ามเปิด tunnel จริงจนกว่าผู้ใช้จะยืนยันว่าเปลี่ยนแล้ว
- ห้าม log สิ่งต่อไปนี้: access token, channel secret, signature, raw body ของ webhook
- LINE userId ให้ log แค่ 6 ตัวท้าย
- ผูกพอร์ต 1880, 3306, 8081 ไว้ที่ 127.0.0.1 ส่วนพอร์ต 8080 คงไว้ตามเดิม
- nginx ต้อง proxy ออกไปแค่ /api และ /line/webhook ส่วน editor และ admin API ของ Node-RED ต้องเข้าผ่าน tunnel ไม่ได้ และต้องมีเทสยืนยัน

## 6A: โครงสร้างพื้นฐาน + webhook + เชื่อมบัญชี

### A1. ใช้ ngrok แทน cloudflared
- service `tunnel` ใช้ image `ngrok/ngrok:3.39.11` (profile tunnel) พร้อมคำสั่ง `http frontend:80 --url=https://${NGROK_DOMAIN}` และส่ง NGROK_AUTHTOKEN ผ่าน env
- เปิด inspector ไว้ที่ `127.0.0.1:4040`
- ตั้ง `PUBLIC_BASE_URL=https://${NGROK_DOMAIN}`
- แก้ .env.example ดังนี้
  - ลบ CF_TUNNEL_TOKEN และ OCR_API_KEY
  - เพิ่มตัวแปรต่อไปนี้พร้อมคอมเมนต์ภาษาไทย: NGROK_AUTHTOKEN, NGROK_DOMAIN, LINE_OA_BASIC_ID, LINE_API_BASE (ค่าเริ่มต้น https://api.line.me), LINE_PUSH_MONTHLY_CAP, LINE_PUSH_RESERVE, LINE_MASCOT_URL, DEMO_MODE

### A2. POST /line/webhook
- ตรวจ `x-line-signature` โดยคำนวณ HMAC-SHA256(raw body, channel secret) เป็น base64 แล้วเทียบด้วย `crypto.timingSafeEqual` ถ้าความยาวไม่เท่ากันต้องไม่ throw
- ใช้ raw bytes จริงเท่านั้น ห้าม JSON.stringify ซ้ำ (วิธีทำอยู่ในส่วนที่ 2)
- signature ผิดหรือไม่มี: ตอบ 401 และไม่ประมวลผล
- signature ถูก: ตอบ 200 ทันที แล้วค่อยประมวลผล
  - ปุ่ม Verify ใน LINE Console จะส่ง events ว่างมา ต้องได้ 200
- กัน event ซ้ำด้วย webhookEventId โดยเก็บไว้ใน global context อายุ 10 นาที (รองรับ redelivery)
- `lib/line-client.js` รวมฟังก์ชัน reply, push, getProfile, getQuota/consumption ไว้ที่เดียว
  - ใช้ LINE_API_BASE และ timeout 10 วินาที
  - push ใส่ header X-Line-Retry-Key (UUID) และ retry 1 ครั้งเมื่อเจอ 5xx หรือ 429
  - ทุกครั้งที่ส่ง ให้บันทึก notification_logs

### A3. เชื่อมบัญชีด้วยรหัส 6 หลัก (ผู้ป่วยและผู้ดูแล)
- **รหัส**
  - สร้างด้วย `crypto.randomInt`
  - อายุ 10 นาที และใช้ได้ครั้งเดียว
  - ห้ามซ้ำกับรหัสที่ยังไม่หมดอายุ ทั้งใน users และ caregivers (ตรวจในโค้ด)
- **กันเดารหัส:** LINE userId เดียวกันผิดได้ไม่เกิน 5 ครั้งใน 10 นาที
- **Endpoint** (ต้องมี JWT)
  - `POST /api/line/link-code` → `{ code, expires_at, oa_message_url }`
  - `GET /api/line/status` → `{ linked, display_name }`
  - `DELETE /api/line/link`
  - `GET|POST /api/caregivers` และ `PATCH|DELETE /api/caregivers/:id`
    - ฟิลด์: name, relation, escalate_after_min (10–720, ค่าเริ่มต้น 60)
  - `POST /api/caregivers/:id/link-code`
  - ถ้าไม่ใช่เจ้าของข้อมูล ให้ตอบ **404** ไม่ใช่ 403
- **oa_message_url:** เป็นลิงก์ที่เปิด LINE พร้อมพิมพ์รหัสรอไว้ให้แล้ว
  - รูปแบบ `https://line.me/R/oaMessage/{basic id โดยแปลง @ เป็น %40}/?{code}`
  - ตรวจรูปแบบนี้กับเอกสาร LINE ก่อนใช้
- **Event ที่ต้องจัดการ**
  - **follow:** reply ข้อความต้อนรับจากน้องยาตรง พร้อมวิธีเชื่อมบัญชี 3 ขั้น
  - **ข้อความที่เป็นตัวเลข 6 หลัก** (ตัด space และขีดออกก่อน):
    - ถ้าตรงกับรหัสผู้ป่วย
      - เชื่อม `users.line_user_id` แล้วเก็บชื่อจาก getProfile
      - reply ข้อความยินดี
      - ถ้า LINE นี้เชื่อมกับผู้ป่วยคนอื่นอยู่แล้ว ให้ตอบอธิบาย และห้ามเขียนทับ
    - ถ้าตรงกับรหัสผู้ดูแล
      - เชื่อม `caregivers.line_user_id`
      - reply ว่า "เชื่อมเป็นผู้ดูแลของคุณ {ชื่อ} แล้ว"
      - LINE เดียวดูแลผู้ป่วยหลายคนได้ และเป็นทั้งผู้ป่วยและผู้ดูแลพร้อมกันได้
    - ถ้าไม่ตรงหรือหมดอายุ: reply บอกให้ขอรหัสใหม่ในแอป
  - **unfollow:** ล้าง line_user_id ที่ตรงกันออกจากทั้ง users และ caregivers
  - **ข้อความอื่น:** reply เมนูช่วยเหลือ ถ้าพิมพ์ "วันนี้" ให้ reply สรุปยาของวันนี้ (ใช้ reply ทั้งหมด จึงไม่เสียโควตา)

### A4. หน้า Settings (Angular Material ใช้ design token เดิม และเหมาะกับผู้สูงอายุ)
- **ส่วน "เชื่อม LINE"**
  - **ยังไม่เชื่อม:**
    - ปุ่ม "รับรหัสเชื่อม LINE"
    - แสดงรหัสตัวใหญ่ด้วย class `.num` ในรูปแบบ "482 913"
    - นับถอยหลังเวลาที่เหลือ
    - ปุ่มใหญ่ "เปิด LINE แล้วกดส่ง" ลิงก์ไปที่ oa_message_url
    - QR ของ oa_message_url (ใช้ npm `qrcode`)
    - คำอธิบายขั้น 1-2-3 พร้อมลิงก์เพิ่มเพื่อน
  - **ระหว่างรอ:** poll `/api/line/status` ทุก 3 วินาที และหยุดเมื่อออกจากหน้าหรือรหัสหมดอายุ
  - **เชื่อมแล้ว:**
    - แสดงสถานะสำเร็จพร้อมน้องยาตรงดีใจ
    - แสดงชื่อ LINE ที่เชื่อม
    - ปุ่ม "ยกเลิกการเชื่อม" ที่มี dialog ยืนยัน
- **ส่วน "ญาติ/ผู้ดูแล"**
  - รายการผู้ดูแลพร้อมสถานะ LINE ของแต่ละคน และปุ่มเพิ่ม แก้ไข ลบ
  - ปุ่ม "ส่งรหัสให้ญาติ" แสดงรหัสและ QR แบบเดียวกับข้างบน พร้อมปุ่มคัดลอกข้อความเชิญที่มี oa_message_url

## 6B: แจ้งเตือนกินยา + ปุ่ม "กินแล้ว" + โหมดเดโม

### B1. cron ส่งเตือน (ทุก 1 นาที, TZ Asia/Bangkok)
- **เลือก dose ที่ตรงทุกเงื่อนไขนี้**
  - status='pending' และ reminded_at IS NULL
  - scheduled_at <= NOW() และ scheduled_at >= NOW() - 30 นาที
  - ยายัง active และไม่ใช่ as_needed
  - user มี line_user_id
- **จัดกลุ่ม:** ตาม (user_id, scheduled_at) แล้วส่ง 1 ข้อความต่อกลุ่ม
- **จองก่อนส่ง:**
  - รัน `UPDATE ... SET reminded_at=NOW() WHERE id IN (...) AND reminded_at IS NULL`
  - ส่งเฉพาะเมื่อ affectedRows > 0
- **ถ้า push ล้มเหลวหลัง retry:** บันทึกว่าล้มเหลว แต่ไม่ต้องคืนค่า reminded_at
- **user ที่ยังไม่เชื่อม LINE:** ข้ามไป (วันที่ 7 จะใช้ Web Push)
- **โควตา:** ใช้กติกาในส่วนที่ 3

### B2. Flex Message เตือนกินยา
อยู่ใน `lib/line-flex.js` เป็น pure function
- **altText:** "⏰ ถึงเวลากินยามื้อเช้าแล้ว (2 รายการ)"
- **ส่วนหัว**
  - รูปน้องยาตรงแบบ PNG จาก LINE_MASCOT_URL
  - ข้อความ "ถึงเวลากินยามื้อเช้าแล้วนะคะ" และ "08:00 น."
- **ส่วนเนื้อหา**
  - ชื่อยาและความแรงตัวใหญ่ (size xl ขึ้นไป)
  - บรรทัดรอง เช่น "ครั้งละ 1 เม็ด · หลังอาหาร"
  - ใช้ mapping ภาษาไทยเดียวกับฝั่งเว็บ
- **ส่วนท้าย**
  - ปุ่มหลักสี #0f766e "✓ กินแล้ว" เป็น postback พร้อม displayText "กินยามื้อเช้าแล้ว"
  - ปุ่มรอง "เปิดแอป" ลิงก์ไปที่ PUBLIC_BASE_URL/today
- **น้ำเสียง:** ใช้ "ค่ะ/นะคะ"

### B3. postback "กินแล้ว"
- **รูปแบบ data:** `a=take&d=<dose ids คั่นด้วย comma>` ยาวไม่เกิน 300 ตัวอักษร
- **สิทธิ์:** นับเฉพาะ dose ของ user ที่ line_user_id ตรงกับ event.source.userId ส่วน id ที่ไม่ใช่ของเขาให้ข้ามโดยไม่แจ้ง
- **การบันทึก:** ใช้ `takeInTx` ตัวเดียวกับปุ่มในแอป ซึ่งทำสิ่งต่อไปนี้ใน transaction
  - pending หรือ missed → taken
  - ใส่ taken_at และ source='line'
  - หัก remaining_qty
- **กดซ้ำ:** reply "บันทึกไว้แล้วค่ะ ✓" และห้ามหักยาซ้ำ
- **สำเร็จ:** reply คำชมสั้นๆ พร้อมจำนวนรายการและเวลา

### B4. โหมดเดโม
- **POST /api/demo/remind-now** (ต้องมี JWT)
  - ใช้ได้เฉพาะเมื่อ DEMO_MODE=true ไม่อย่างนั้นตอบ 404
  - หากลุ่ม pending dose ถัดไปของวันนี้ แล้วส่งด้วยฟังก์ชันเดียวกับ cron
  - ห้ามสร้าง dose ปลอม
  - ถ้าไม่มี dose เหลือ ให้ตอบ 409 พร้อมข้อความภาษาไทย
- **GET /api/config** → `{ demoMode }`
  - ถ้า demoMode เป็น true หน้า Settings แสดงปุ่ม "ทดลองส่งเตือนตอนนี้"
- **Node-RED:** inject node "ส่งเตือนทดสอบ (demo user)"

## เทส
- **scripts/fake-line.js**
  - รับ reply, push, profile, quota
  - เก็บ request ไว้ให้เทสดึงไปตรวจ
  - มีโหมดจำลอง 500 และ 429
- **scripts/test-day6.sh และ unit test** ตามรายการในส่วนที่ 2
- **เทสเดิมต้องผ่านทั้งหมด**

## ตอนจบแต่ละช่วง
- **อัปเดตเอกสาร:** CLAUDE.md, README (ส่วน LINE และ ngrok), demo-check.sh
  - demo-check.sh แสดง: tunnel, webhook, โควตา, DEMO_MODE
- **รายงาน:** ตารางเทสที่ผ่าน/ไม่ผ่าน และไฟล์ที่เปลี่ยน
- **ตอนจบ 6B:** ทำ checklist ภาษาไทยสำหรับผู้ใช้ใน LINE Developers Console
  1. ตั้ง Webhook URL เป็น `https://<NGROK_DOMAIN>/line/webhook`
  2. กด Verify
  3. เปิด Use webhook
  4. เพิ่มเพื่อน
  5. เชื่อมบัญชี
  6. ทดลองส่งเตือน
  7. กด "กินแล้ว"

---

# ส่วนที่ 2 — แผนที่ Claude Code เสนอ (อนุมัติแล้ว)

## สิ่งที่ค้นพบจากโค้ดเดิม
- Node-RED ใช้ `nodered/node-red:4.0` และไม่มี migration framework (db/init รันเฉพาะตอน volume ยังว่าง)
- notification_logs มี enum line_push/line_reply และ kind reminder/link/other อยู่แล้ว
- users.line_user_id เป็น UNIQUE ส่วน caregivers.line_user_id ไม่ unique
- รหัส 6 หลักเป็น UNIQUE แยกตามตาราง ความไม่ซ้ำข้ามตารางจึงต้องตรวจในโค้ด
- tab ที่มีอยู่คือ 0, 1, 2, 3, 4, 6 (tab 6 มี cron 00:05 และ 03:00)
- nginx proxy แค่ /api/ กับ /line/webhook (exact) ส่วน path อื่นเป็น SPA fallback
  - **ผลต่อการเทส:** `GET /flows` ผ่าน nginx จะได้ index.html สถานะ 200 เทสจึงต้องเช็กว่าเนื้อหา "ไม่ใช่ JSON ของ Node-RED" ไม่ใช่เช็กแค่สถานะ

## วิธีเก็บ raw body
- **ลำดับการทำงานของ http in:** httpNodeMiddleware → bodyParser.json → handler
  - ถ้า middleware อ่าน body เป็น Buffer และตั้ง `req._body = true` ไว้ก่อน ตัว json parser จะข้ามไป
- **settings.js:** เพิ่ม `httpNodeMiddleware` ที่ใช้ `express.raw({type:'*/*', limit:'1mb'})` เฉพาะ `POST /line/webhook`
- **function node:**
  - ตรวจ signature ด้วย `lineService.verifySignature(rawBuf, header, secret)`
  - จากนั้นจึง `JSON.parse(buf.toString('utf8'))`
- **เทสก่อนทำส่วนอื่น:** ยืนยันด้วย body ภาษาไทยที่มีช่องว่างและ escape แปลกๆ
- **แผนสำรอง:** ให้ middleware คำนวณ signature เองแล้วใส่ผลไว้ใน `req.lineSigOk`

## ไฟล์ — 6A
| ไฟล์ | งาน |
|---|---|
| docker-compose.yml | ใช้ ngrok/ngrok:3.39.11 แทน cloudflared, inspector ที่ 127.0.0.1:4040, ผูก 1880/3306/8081 กับ 127.0.0.1, เพิ่ม env ใหม่ (DEMO_MODE ค่าเริ่มต้น false) |
| .env.example | ลบ CF_TUNNEL_TOKEN และ OCR_API_KEY, เพิ่มตัวแปรใหม่พร้อมคอมเมนต์ไทย |
| db/migrations/001_line_linking.sql + scripts/migrate.sh | migration ที่รันซ้ำได้ |
| db/init/01_schema.sql | เพิ่มคอลัมน์ใหม่ให้ตรงกับ migration |
| node-red/data/lib/line-client.js | reply/push/getProfile/getQuota, timeout 10 วินาที, Retry-Key, retry 1 ครั้ง, notification_logs, ไม่ log ความลับ |
| node-red/data/lib/line-service.js | verifySignature, สร้างรหัส, parse รหัส, dedup event, กันเดารหัส, เชื่อม/ยกเลิก, ข้อความ reply |
| node-red/data/lib/caregiver-service.js | CRUD, link-code, เจ้าของเท่านั้น (ไม่ใช่เจ้าของตอบ 404) |
| node-red/data/settings.js | httpNodeMiddleware สำหรับ raw body, ลงทะเบียน lineClient, lineService, caregiverService เป็น global |
| node-red/data/flows.json | tab ใหม่ **7-LINE** (8-Push จองไว้ให้วันที่ 7) |
| scripts/fake-line.js | LINE ปลอม |
| scripts/test-day6.sh + node-red/test/line-*.test.js | เทส |
| frontend: core/api/line.api.ts, features/settings/* | ส่วนเชื่อม LINE และส่วนญาติ, dialog, ติดตั้ง qrcode และ @types/qrcode |
| scripts/demo-check.sh, README.md, CLAUDE.md | อัปเดต |

## ไฟล์ — 6B
| ไฟล์ | งาน |
|---|---|
| lib/line-flex.js | pure function สร้าง Flex และ altText, mapping ภาษาไทยให้ตรงกับเว็บ |
| lib/reminder-service.js | `run(db)` สำหรับ cron, `sendGroup()` ใช้ร่วมกับ demo, นับโควตา |
| lib/dose-service.js | แยก `takeInTx(conn, …, source)` ออกจาก `take()` และเพิ่ม `takeMany(db, userId, ids, 'line')` โดยพฤติกรรม API เดิมต้องไม่เปลี่ยน |
| frontend/public/line/mascot.png | 512px, export จาก SVG เดิมด้วย tools/make-line-mascot.mjs (sharp) |
| docker-compose.yml, flows.json | เพิ่ม env และ node ใน tab 7 |
| frontend Settings | ปุ่ม "ทดลองส่งเตือนตอนนี้" |

## Migration
- **คอลัมน์ใหม่**
  - `users.line_link_code_expires_at DATETIME NULL`
  - `users.line_display_name VARCHAR(100) NULL`
  - `caregivers.link_code_expires_at DATETIME NULL`
  - `caregivers.line_display_name VARCHAR(100) NULL`
- **วิธีเพิ่มคอลัมน์:** MySQL 8.4 ไม่มี `ADD COLUMN IF NOT EXISTS`
  - ใช้ stored procedure ชั่วคราวที่เช็ก information_schema ก่อน แล้ว drop ทิ้ง
  - รันซ้ำกี่ครั้งก็ได้
- **scripts/migrate.sh:** รันผ่าน `docker compose exec db mysql` จึงไม่ต้อง down -v
- **ไฟล์ init:** มีคอลัมน์ชุดเดียวกัน เทสยืนยันด้วยการเทียบ SHOW COLUMNS

## Endpoint ใหม่
- **6A**
  - `POST /line/webhook`
  - `POST /api/line/link-code`, `GET /api/line/status`, `DELETE /api/line/link`
  - `GET|POST /api/caregivers`, `PATCH|DELETE /api/caregivers/:id`, `POST /api/caregivers/:id/link-code`
- **6B**
  - `POST /api/demo/remind-now`, `GET /api/config`

## Tab 7-LINE
- **group ต่อ endpoint:** ทุก endpoint มี group ของตัวเอง รวมถึง group "ข้อผิดพลาดที่ไม่คาดคิด → 500"
- **webhook:** แบ่ง group ย่อยเป็น ตรวจ signature → ตอบ 200 → กัน event ซ้ำ → แยกประเภท event
- **6B:**
  - "cron ส่งเตือน ทุก 1 นาที" (cron-plus)
  - `POST /api/demo/remind-now`
  - inject "ส่งเตือนทดสอบ (demo user)"

## รายการเทส
- **unit (node --test)**
  - signature: ถูก / ผิด / ไม่มี / ความยาวต่างแล้วต้องไม่ throw / ภาษาไทย
  - ตัวสร้างรหัส
  - parse ข้อความรหัส
  - Flex: altText, postback ≤ 300 ตัวอักษร, ปุ่ม, mapping ไทย
- **test-day6.sh (6A)**
  - signature ทุกแบบ, body ไทย, Verify ที่ส่ง events ว่าง, redelivery
  - รหัส: ถูก / หมดอายุ / ใช้ซ้ำ / เดาผิดเกิน 5 ครั้ง / LINE ชนกับผู้ป่วยคนอื่น / ผู้ดูแล 1 คนดูแลหลายผู้ป่วย
  - unfollow
  - 404 เมื่อจัดการผู้ดูแลของคนอื่น
  - /flows และ /red ผ่าน nginx ต้องไม่ได้ Node-RED
- **6B**
  - 3 ยาในมื้อเดียวรวมเป็น 1 push
  - `reminderService.run()` 2 รอบพร้อมกัน (Promise.all) ต้องได้ 1 push
  - dose ที่เกิน 30 นาทีไม่ส่ง และยาที่หยุดแล้วไม่ส่ง
  - เมื่อถึง cap ต้องหยุด และ reserve ต้องถูกกันไว้
  - push ล้มเหลว (500/429) แล้ว reminded_at ไม่ถูกคืนค่า
  - postback: ของตัวเอง / ของคนอื่น / กดซ้ำ / remaining_qty ถูกต้อง
  - demo: เปิดและปิด
  - รอ cron จริง 1 รอบ
- **ชุดเดิมต้องผ่านทั้งหมด:** node --test, day3a, day4 mock+fake, day5, ng build, ng test

## ความเสี่ยงที่ต้องพิสูจน์ระหว่างทำ
- (ก) พฤติกรรม raw body ของ Node-RED 4.0 → พิสูจน์ด้วยเทสก่อนทำส่วนอื่น
- (ข) รูปแบบ oaMessage → เทียบกับเอกสาร LINE
- (ค) รูปใน Flex ที่โหลดผ่าน ngrok ฟรี → ถ้าไม่ขึ้น ให้เปลี่ยนไปใช้ LINE_MASCOT_URL

---

# ส่วนที่ 3 — คำตอบที่ตัดสินแล้ว

1. **/api/config** เปิดสาธารณะได้ (ไม่ต้องมี JWT) และส่งกลับแค่ `{demoMode}`
2. **โควตา push**
   - `effective_cap = min(LINE_PUSH_MONTHLY_CAP, quota จริงจาก getQuota)`
   - ยอดที่ใช้แล้วดึงจาก consumption ของ LINE ถ้าเรียกได้ (cache 5 นาที) ถ้าเรียกไม่ได้ให้นับจาก notification_logs
   - `LINE_PUSH_RESERVE` (ค่าเริ่มต้น 30) กันไว้ให้การแจ้งญาติในวันที่ 7
     - ข้อความเตือนปกติหยุดเมื่อใช้ไปถึง `effective_cap - RESERVE`
     - kind=escalation ส่งต่อได้จนถึง effective_cap
     - วางโครงนี้ไว้ใน reminder-service หรือ line-client ตั้งแต่วันนี้
   - `LINE_PUSH_MONTHLY_CAP` ค่าเริ่มต้น **200**
   - demo-check.sh แสดง: quota จริง / ใช้ไป / เหลือสำหรับเตือน / เหลือสำหรับแจ้งญาติ
3. ติดตั้ง **qrcode** ได้
4. **.env**
   - Claude Code เพิ่มตัวแปรที่ไม่ใช่ความลับให้ได้เลย: LINE_OA_BASIC_ID=@014rktvr, LINE_API_BASE, LINE_PUSH_MONTHLY_CAP, LINE_PUSH_RESERVE, LINE_MASCOT_URL, DEMO_MODE=true
   - ห้ามแตะความลับ
   - ห้ามลบ OCR_API_KEY และ CF_TUNNEL_TOKEN เพราะผู้ใช้จะลบเอง
5. **พอร์ต 8080** คงไว้ตามเดิม (เปิดให้ LAN เข้าได้)
6. **LINE_MASCOT_URL** ตั้งค่าผ่าน env ได้ ค่าเริ่มต้นคือ `${PUBLIC_BASE_URL}/line/mascot.png`
7. **NODE_RED_ADMIN_HASH** ผู้ใช้เปลี่ยนเอง ห้าม restart nodered ระหว่างที่ผู้ใช้กำลังทำ ถ้าต้อง restart ให้ถามก่อน
