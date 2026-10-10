# CLAUDE.md — YaTung (ยาตรง)

## โปรเจกต์
โปรเจกต์จบวิชาพัฒนาเว็บแอป ระยะเวลา 10 วัน: แปลงรูปซองยาเป็นตารางกินยาด้วย Gemini multimodal (อ่านรูป + ตีความในครั้งเดียว),
เตือนผ่าน LINE, แจ้งญาติเมื่อไม่กดยืนยัน, dashboard adherence 7 วัน, เตือนยาใกล้หมด, TTS อ่านรายละเอียดยา

- เกณฑ์คะแนน: Angular, Node-RED, REST API, JWT, Docker, Ionic, PWA, Android Studio
  + ความรู้นอกเหนือที่สอน (Gemini multimodal, LINE Messaging API)
- นอกสโคป: ลายมือแพทย์, เชื่อม HIS, ปรึกษาแพทย์, ระบบ role หลายระดับ

## สภาพแวดล้อม
- Windows + PowerShell, Docker Desktop, Node 22, Angular 21, Ionic 9, Capacitor 8
- **Ionic 9:** import standalone components จาก `'@ionic/angular'` โดยตรง ห้ามใช้ `'@ionic/angular/standalone'`
- Ionic ใช้เฉพาะหน้า Scan (lazy route) หน้าอื่นใช้ Angular Material
- รันทั้งระบบ: `docker compose up -d --build` (เว็บ :8080, Node-RED 127.0.0.1:1880, Adminer 127.0.0.1:8081 ด้วย `--profile dev`, tunnel **ngrok** ด้วย `--profile tunnel` [inspector 127.0.0.1:4040]; 1880/3306/8081/4040 ผูก 127.0.0.1 เท่านั้น)
- dev frontend: `docker compose up -d db nodered` แล้ว `cd frontend && npx ng serve` (proxy `/api` → :1880 ผ่าน `proxy.conf.json`)
- Timezone ทุก service = Asia/Bangkok (MySQL `+07:00`)
- ตัวแปร env ดู `.env.example` (copy เป็น `.env`)

## Backend = Node-RED
- flows อยู่ที่ `node-red/data/flows.json` (`flowFilePretty`) — **ยังไม่มีไฟล์นี้ตอนเริ่ม Day 2**
- **กฎสำคัญ:** ก่อนแก้ `flows.json` ด้วยมือ ต้อง `docker compose stop nodered` ก่อนเสมอ
  แก้เสร็จค่อย `docker compose start nodered` แล้วเช็ก `docker compose logs nodered`
  (ถ้าแก้ตอน container รันอยู่ แล้วมีคนกด Deploy ใน editor ไฟล์จะถูกเขียนทับ)
- **MySQL credentials:** node-red-node-mysql อ่าน user/password จาก credentials เท่านั้น (ไม่รองรับ `${ENV}`) →
  หลัง clone หรือเปลี่ยน `.env` ให้ `docker compose stop nodered && node node-red/init-credentials.js && docker compose start nodered`
  (สร้าง `flows_cred.json` ที่ถูก gitignore; ถ้าลืมจะเห็น `Access denied for user ''` ใน log)
- Auth: JWT HS256 payload `{ sub, email }`; subflow `verify-jwt` (tab 0) ตอบ 401 เองและใส่ `msg.user = { id, email }`;
  login ผิดเกิน 5 ครั้ง/5 นาที/email → 429 (flow context `loginFails`, หายเมื่อ restart Node-RED)
- node id ทุกตัวต้องไม่ซ้ำ, ทุก `http in` ต้องมี `http response` ปลายทาง
- `lib/dose-check.js` / `lib/validate-llm-output.js` เป็นฟังก์ชันล้วน ทดสอบด้วย `node --test` ที่ `node-red/test/`
- library ใช้ผ่าน `global.get()`: `jwt`, `bcrypt`, `webpush`, `crypto`, `medicineValidator`, `prompts`, `scanService`, `prescriptionService`, `llmOutput`, `lineClient`, `lineService`, `caregiverService`, `reminderService`, `escalationService`, `lineEnv`
  (กำหนดใน `node-red/data/settings.js` → `functionGlobalContext`; `prompts` = `medicineSystem`, `medicineUserImage`, `medicineUserText`, `medicineSchema`, `medicineGeminiSchema`, `mockResponse`)
- env ใช้ `env.get('JWT_SECRET')` เป็นต้น
- **transaction:** node `mysql` ทำ transaction ไม่ได้ (1 query = 1 connection) → ใช้ `global.get('db')` (`lib/db.js`, pool `mysql2` อ่าน `DB_*` จาก env ไม่ผ่าน credentials; timezone +07:00, `dateStrings`, `decimalNumbers`)
  ```js
  const db = global.get('db');
  const rows = await db.query('SELECT … WHERE user_id = ?', [id]);
  await db.withTransaction(async (conn) => {                       // throw = ROLLBACK, จบปกติ = COMMIT
    const [rows] = await conn.query('SELECT … FOR UPDATE', [id]);  // conn.query คืน [rows, fields]
    await conn.query('UPDATE …', [/* params */]);
  });
  ```
  pool ถูกปิดเองเมื่อได้ SIGTERM/SIGINT (`db.close()`); function node ที่ใช้ DB เขียนเป็น `async` ได้เลย (`await` แล้ว `return msg`)
- logic ฝั่ง backend แยกเป็น `node-red/data/lib/*-service.js` (global: `medicationService`, `doseService`; รับ `(db, userId, …)` คืน `{status, body}`) function node ใน flow แค่เรียกแล้วใส่ `msg.statusCode/payload`;
  แก้ `lib/` หรือ `settings.js` ต้อง `docker compose restart nodered`. ข้อมูลที่ไม่ใช่ของ `msg.user.id` = 404 เสมอ (ไม่ใช่ 403)
- ทดสอบ Day 3A (รวมเคส stop/resume): `DEMO_PASSWORD=… bash scripts/test-day3a.sh` (login ใหม่ในสคริปต์, user ที่ 2 สุ่ม, ลบข้อมูลทดสอบตอนจบ)
- แบ่ง tab: 0-Middleware, 1-Auth, 2-AI-Scan, 3-Medications, 4-Doses, 5-Dashboard (ยังไม่มี จองไว้), 6-Scheduler (cron 00:05 สร้างรอบ / 03:00 ลบรูป + ปิดรอบค้างเป็น missed), 7-LINE (มีแล้ว ; cron 1 นาที = เตือน + เตือนซ้ำ + แจ้งญาติ), 8-Push (ยังไม่มี ทำ 7C), 9-Stock (ยังไม่มี ทำ 7B)
- **กฎการจัด flow (ใช้กับทุก tab):** ทุก endpoint มี `group` ครอบ (ชื่อ = `METHOD /path`; สี: เขียว = เขียนข้อมูล, ฟ้า = อ่านอย่างเดียว, แดง = error/catch, เหลืองน้ำตาล = cron/เรียกภายนอก)
  endpoint ที่มีหลายขั้นตอน (เช่น `POST /api/scan`) ให้มี group ย่อยแยกตามขั้นตอนซ้อนใน group นั้น; ทุก node ตั้งชื่อเป็นภาษาไทยที่อ่านแล้วรู้ว่าทำอะไร
  (ชื่อ `http in` ใช้ `METHOD /path`); ใส่ `g` ให้ node สมาชิกทุกตัว; ทุก tab มี `catch` + group "ข้อผิดพลาดที่ไม่คาดคิด → 500"
  (ถ้ามี `http request` ที่ต้องดัก timeout เอง ให้กำหนด `scope` ของ catch ทั่วไปไม่รวม node นั้น)
- **LINE (วันที่ 6A, tab 7-LINE; ค้นหาแผนเต็มที่ `docs/day6-plan.md`):**
  - `lib/line-client.js` (`createClient()` → global `lineClient`): `reply/push/getProfile/quotaStatus/canPush`; ใช้ `LINE_API_BASE` (ทดสอบชี้ `scripts/fake-line.js`), timeout 10 วินาที, push ใส่ `X-Line-Retry-Key` และลองใหม่ 1 ครั้งเมื่อ 5xx/429/เครือข่ายล่ม, บันทึก `notification_logs` ทุกครั้งที่รู้ user_id (reply ที่ไม่รู้ user ไม่บันทึกเพราะ user_id บังคับ), log ได้แค่ status/จำนวน (ห้าม token/secret/ข้อความ/userId เต็ม)
  - **โควตา:** `effective_cap = min(LINE_PUSH_MONTHLY_CAP [200], quota จริง)`; ยอดใช้ไปจาก LINE consumption (cache 5 นาที) ถ้าไม่ได้ให้นับ `notification_logs` (line_push สำเร็จเดือนนี้); `canPush(db, kind)`: kind=`escalation` ส่งได้ถึง cap, ชนิดอื่นหยุดที่ `cap − LINE_PUSH_RESERVE [30]` (กันไว้ให้แจ้งญาติวันที่ 7); reply ไม่นับโควตา
  - `POST /line/webhook`: `settings.js` **`httpAdminMiddleware`** (ไม่ใช่ httpNodeMiddleware — admin app ผูกที่ `/` และ parse JSON ก่อน route ของ http-in) ใช้ `express.raw` เก็บ **raw bytes** เป็น `req.body` (Buffer) เฉพาะ path นี้ก่อน body-parser.json → `lineService.verifySignature(raw, x-line-signature, LINE_CHANNEL_SECRET)` (HMAC-SHA256 base64, `timingSafeEqual`, ต้อง re-encode แล้วตรง header เป๊ะ) →
    ผิด/ไม่มี = 401 · ถูก = ตอบ 200 ทันทีแล้วค่อยประมวลผล (`parseBody` → `dropDuplicates` ด้วย `webhookEventId` อายุ 10 นาที ใน memory → `handleEvents`); Verify ของ LINE ส่ง events ว่าง = 200 ไม่ทำอะไร; ห้าม JSON.stringify body ซ้ำก่อนตรวจ
  - **รหัสเชื่อม 6 หลัก** (`lineService.issueCode`): `crypto.randomInt`, หมดอายุ 10 นาที (`users.line_link_code_expires_at` / `caregivers.link_code_expires_at`), ใช้ได้ครั้งเดียว (ส่งสำเร็จแล้วล้าง), ไม่ซ้ำกับรหัสที่ยังไม่หมดอายุทั้ง users+caregivers (ตรวจในโค้ด, ล้างรหัสหมดอายุก่อนออกใหม่), กันเดา: LINE userId เดียวกันผิด 5 ครั้ง/10 นาที (memory) → ตอบ "ผิดหลายครั้ง"
  - event: `follow` = ต้อนรับ 3 ขั้น · ข้อความเลข 6 หลัก (ตัด space/ขีด/เลขไทย) = เชื่อมผู้ป่วย (LINE ที่เชื่อมกับผู้ป่วยอื่นแล้ว → `conflict` ไม่เขียนทับ ไม่ใช้รหัสทิ้ง) หรือผู้ดูแล (LINE เดียวดูแลหลายผู้ป่วยได้ และเป็นทั้งผู้ป่วยและผู้ดูแลได้) · `unfollow` = ล้าง line_user_id/ชื่อ ทั้ง users และ caregivers · "วันนี้" = สรุปยาวันนี้ (reply) · อื่นๆ = เมนูช่วยเหลือ · `postback` เตรียม hook `deps.handlers.postback` ไว้ให้ 6B
  - API (JWT, เจ้าของเท่านั้น ไม่ใช่ = 404): `POST /api/line/link-code` → `{code, expires_at, expires_in, oa_message_url}` (`https://line.me/R/oaMessage/%40<basic id>/?<code>` ตรวจกับเอกสาร LINE แล้ว) · `GET /api/line/status` · `DELETE /api/line/link` · `GET|POST /api/caregivers` · `PATCH|DELETE /api/caregivers/:id` · `POST /api/caregivers/:id/link-code` (`caregiver-service.js`; name ≤100, relation ≤50, escalate_after_min 10–720 ค่าเริ่มต้น 60, ผู้ดูแลได้ไม่เกิน 10 คน)
  - `lib/labels-th.js` = ป้ายไทยฝั่ง backend (มื้อ/ก่อน-หลังอาหาร/หน่วย/`doseText`) ต้องตรงกับ `frontend/src/app/core/i18n/labels.ts`
  - **nginx ส่งต่อแค่ `/api/` กับ `= /line/webhook`** ส่วนที่เหลือเป็น SPA fallback → `GET /flows` ผ่าน nginx ได้ index.html **สถานะ 200** (ไม่ใช่ JSON) เทสจึงเช็กว่าเนื้อหา "ไม่ใช่ JSON ของ Node-RED"; ห้ามเปิด tunnel จนกว่าจะเปลี่ยน `NODE_RED_ADMIN_HASH`
  - migration: `db/migrations/NNN_*.sql` + `bash scripts/migrate.sh` (รันซ้ำได้ ไม่ต้อง `down -v`; MySQL 8.4 ไม่มี `ADD COLUMN IF NOT EXISTS` ใช้ stored procedure เช็ก information_schema) และต้องแก้ `db/init/01_schema.sql` ให้คอลัมน์ตรงกัน (เทสเทียบ SHOW COLUMNS)
  - ทดสอบ 6A: `node --test "node-red/test/*.test.js"` (line-service/line-client) + `bash scripts/test-day6.sh` (LINE ปลอม `scripts/fake-line.js`; recreate nodered 2 ครั้ง; สร้าง user สุ่มแล้วลบ) · `fake-line.js` ควบคุมผ่าน `POST /_config {mode:"500"|"429", failCount, quota, usage, profiles}` และดูคำขอที่ `GET /_requests`
  - frontend: `core/api/line.api.ts`, `features/settings/` → `line-section` (รับรหัส, poll `/api/line/status` ทุก 3 วินาที หยุดเมื่อเชื่อมแล้ว/หมดอายุ/ออกจากหน้า) · `link-code-panel` (รหัสตัวใหญ่ `.num`, นับถอยหลัง, ปุ่มเปิด LINE, QR จาก npm `qrcode` โหลดแบบ dynamic import, ใช้ซ้ำกับญาติ) · `caregivers-section` + `caregiver-form-dialog` + `caregiver-code-dialog`
- **LINE (วันที่ 6B):**
  - **cron ส่งเตือน** (tab 7, cron-plus `0 * * * * * *` เวลาไทย + inject "▶ รันตอนนี้") → `reminderService.run(db, lineClient, env)` (`lib/reminder-service.js`): เลือก dose `status=pending AND reminded_at IS NULL AND scheduled_at ≤ NOW() ≥ NOW()−30 นาที`, ยา `is_active=1 AND as_needed=0`, user มี `line_user_id` → จัดกลุ่ม (user, scheduled_at) = 1 ข้อความ/กลุ่ม (แบ่งก้อนละ ≤ 15 รายการ และ postback ≤ 300 ตัวอักษร) →
    **จอง `reminded_at` ก่อนส่ง** (`claim`: transaction + `SELECT … FOR UPDATE` คืนเฉพาะ id ที่จองได้ — รันซ้อนกัน 2 process ได้ 1 push) → push ล้มเหลว (หลัง retry) = บันทึกล้มเหลวแต่**ไม่คืน** reminded_at · โควตา (`canPush(db,'reminder')`) เต็ม = ไม่จอง ลองใหม่ได้ในหน้าต่าง 30 นาที · user ที่ยังไม่เชื่อม LINE ข้าม (วันที่ 7 ใช้ Web Push)
  - **Flex เตือน (ปรับใหม่ใน 6C ดูหัวข้อ "LINE (วันที่ 6C)" ด้านล่าง):** `lib/line-flex.js` = ระบบออกแบบ (สี/ส่วนประกอบ/quick reply/`buildReminder`) ; ปุ่มหลัก `#0f766e` "✓ กินแล้ว" (postback `a=take&d=<id,id>` + displayText "กินยามื้อ…แล้ว") + ปุ่ม "เปิดแอป" (uri `PUBLIC_BASE_URL/today`) ; รูปต้องเป็น https (ไม่ใช่ → ไม่ใส่รูป) — โฟลเดอร์รูป = `LINE_ASSET_BASE` (ว่าง = `${PUBLIC_BASE_URL}/line`), `LINE_MASCOT_URL` เดิมยังใช้เป็นท่ากระดิ่งได้ (nginx `location ~ ^/line/mascot(-bell|-cheer|-hello)?[.]png$` แคช 1 วัน)
  - **postback "กินแล้ว"** (`lineService.handlePostback` → `doseService.takeMany(db, userId, ids, 'line')` → `takeInTx` ตัวเดียวกับ `take()`): นับเฉพาะ dose ของผู้ป่วยที่ `line_user_id` ตรงผู้กด (ของคนอื่น/LINE ที่ไม่ใช่ผู้ป่วย = ข้ามเงียบๆ), pending/missed → taken + `source='line'` + หักสต็อก, กดซ้ำ → "บันทึกไว้แล้วค่ะ ✓" ไม่หักซ้ำ, สำเร็จ → "บันทึกแล้วค่ะ ✓ กินยา N รายการ เมื่อ HH:MM น."; data ยาวเกิน 300/ผิดรูปแบบ = ไม่ทำอะไร
  - **โหมดเดโม:** `GET /api/config` → `{ demoMode }` (สาธารณะ ไม่ต้อง JWT **ห้ามเพิ่ม field อื่น**) · `POST /api/demo/remind-now` (JWT; `DEMO_MODE≠true` = 404 เหมือนไม่มี endpoint) ส่งกลุ่ม pending ถัดไปของวันนี้ด้วย `sendGroup` ตัวเดียวกับ cron (ยังไม่เคยเตือนก่อน; ถ้าเตือนครบแล้ว = ส่งซ้ำโดยไม่จอง `resent:true`; ไม่สร้าง dose ปลอม) · 409 `LINE_NOT_LINKED` / `NO_PENDING_DOSE`, 429 `LINE_QUOTA`, 502 `LINE_PUSH_FAILED` · หน้า Settings แสดงการ์ด "โหมดเดโม" เมื่อ `demoMode=true` (`features/settings/demo-section.component.ts`)
  - `REMINDER_CRON=off` ปิดเฉพาะ cron อัตโนมัติ (เฉพาะทดสอบ; ไม่งั้นแย่ง dose กับ `test-day6b.sh`)
  - **editor/admin fail closed** (`lib/admin-auth.js` `resolveAdmin`): `NODE_RED_ADMIN_HASH` ว่าง/ไม่ใช่ bcrypt (`$2a|b|y$NN$…53 ตัว`) = `httpAdminRoot: false` (ปิด editor + admin API ทั้งหมด) + log เตือน (ไม่ log ค่า) · http-in (`/api/*`, `/line/webhook`) ยังทำงาน — จึงต้องมี raw-body middleware ทั้ง `httpAdminMiddleware` (ตอนมี admin) และ `httpNodeMiddleware` (ตอนไม่มี admin) · hash ตัวอย่าง demo1234 ใช้ได้แต่ log เตือน · raw-body middleware (`lib/raw-body.js`) จับเฉพาะ `POST` + path `/line/webhook` **exact** (case-sensitive, ไม่มี trailing slash) ที่เหลือ `next()` ทันที จึงไม่แตะ body parser/auth ของ route อื่น
  - ทดสอบ 6B: `node --test` (line-flex, reminder-service, admin-config) + `bash scripts/test-day6b.sh` (recreate nodered 5 ครั้ง; รวม fail closed, ขอบเขต middleware, รูปมาสคอตผ่าน nginx, ลำดับตัวแปร `.env.example`) · checklist LINE Console: `docs/line-console-checklist.md`
- **LINE (วันที่ 6C): ข้อความสวย อ่านง่าย + quick reply + rich menu + แก้ปัญหาจากการทดสอบ 6B**
  - **ข้อ 0.1 (เทสชนผู้ใช้จริง) — สาเหตุที่ตรวจพบ:** dose 18:00 ของผู้ใช้จริง (id 390) `reminded_at = NULL`, `notification_logs` ไม่มีแถวช่วง 18:00–18:30 → **cron ไม่ได้ทำงานกับ dose นั้นเลย** (ไม่ใช่ถูกจองแล้วส่งไปที่ LINE ปลอม) เพราะ `test-day6b.sh` recreate nodered ด้วย `REMINDER_CRON=off` ชั่วคราวจนหน้าต่างเตือน 30 นาทีหมด
    **แก้:** env `REMINDER_ONLY_EMAIL_SUFFIX` (ทดสอบตั้ง `@example.test`): `reminderService.run()` กับ `remindNow()` (ปุ่มเดโม) แตะเฉพาะ user ที่อีเมลลงท้ายด้วยค่านี้ (ว่าง = ทุกคน; ปุ่มเดโมของบัญชีอื่นตอบ 409 `TEST_MODE_ONLY`) → ผู้ใช้จริงไม่ถูกจอง `reminded_at` ไม่ถูกส่งไป LINE ปลอม และหลังเทสจบ cron จริงยังเตือนต่อได้ถ้ายังอยู่ในหน้าต่าง 30 นาที
    `test-day6.sh`/`6b`/`6c` ตั้งตัวกรองนี้เอง ; `scripts/lib/real-snapshot.sh` (`real_snapshot_take` ตอนเริ่ม / `real_snapshot_check` ใน cleanup) เทียบ dose_logs ของผู้ใช้จริง (status/reminded_at/taken_at/escalated_at) และจำนวน notification_logs ก่อน-หลัง — 6/6b/6c ไม่ตรง = ไม่ผ่าน (exit 1); day4/day5/ai-eval (ใช้ LINE จริง cron จริงยังทำงาน) ขึ้นเป็น "!" เตือนเฉยๆ เพราะ cron เตือนจริงอาจเปลี่ยน reminded_at ได้ตามปกติ
    ช่วงที่เทสรัน `REMINDER_CRON=off` ผู้ใช้จริงจะไม่ได้รับเตือน — อย่ารันเทสที่ recreate nodered ช่วงใกล้มื้อยา
  - **ข้อ 0.2 ปุ่มเดโม:** `remindNow` เลือกกลุ่ม pending ของวันนี้ที่ `scheduled_at` ใกล้ `NOW()` ที่สุด (ก่อนหรือหลัง, เท่ากัน = มื้อที่เร็วกว่า) ; response `{ sent, doses, slot, time, resent, state: soon|due|overdue, late_min, message }` — หน้า Settings แสดง `message` (เช่น "ส่งเตือนมื้อเย็น 18:00 น. (2 รายการ) เข้า LINE แล้วค่ะ · เลยเวลามา 2 ชม.")
  - **ไฟล์:** `lib/line-flex.js` (token สีตรงกับ `_tokens.scss`, `header/medList/progress/badge/button`, `quickReply(ctx)`/`withQuickReply`, `buildReminder`) · `lib/line-messages.js` (ข้อความ reply ทุกแบบ + ตัวอย่าง `samples()`/`buildPreviewPage`) · `lib/line-env.js` (global `lineEnv.pick(k => env.get(k))` ส่ง env เข้า lib จาก function node) · `labels-th.js` มี `SLOT_EMOJI` (เช้า 🌅 กลางวัน ☀️ เย็น 🌆 ก่อนนอน 🌙)
  - **กฎข้อความ (unit test บังคับ):** ทุก text/button มี `scaling: true` (property ของ Flex ตรวจจาก line-openapi แล้ว) · หัวข้อ ≥ lg ชื่อยา ≥ xl ข้อความรอง ≥ md · หัวข้อ header สั้น ≤ 26 ตัวอักษรฐาน บรรทัดเดียวบน 375px (รูปอยู่เหนือหัวข้อ ไม่ชิดข้าง) · **อิโมจิ ≤ 1 ตัวต่อบรรทัด วางต้นหรือท้ายบรรทัดเท่านั้น** (ตัวอ่านหน้าจอ; ✓ ไม่นับ) · altText ≤ 400 · bubble ≤ 30 KB · postback ≤ 300 · quick reply ป้าย ≤ 20 ตัวอักษร
  - **Flex เตือน:** หัวตามช่วง `late_min` (= `late_sec/60` จาก SQL): < 0 "ใกล้ถึงเวลากินยาแล้วนะคะ" + ป้าย "🌅 มื้อเช้า · 08:00 น. (อีก x)" (เฉพาะเดโม) · 0–29 "ถึงเวลากินยาแล้วนะคะ" · ≥ 30 หัวพื้นเหลือง "ยังไม่ได้กินยามื้อ…นะคะ" + "⏰ เลยเวลามา x ชม. y นาที" (เดโม/วันที่ 7) ; ท่า `mascot-bell` ; แสดงยา ≤ 6 รายการแล้ว "+ อีก n รายการ" (postback มี id ครบ)
  - **รูปมาสคอต:** `cd frontend && node tools/make-line-mascot.mjs` → `public/line/mascot-bell|cheer|hello.png` 512px พื้นใส (สีรูปทรงคัดลอกจาก `mascot.component` — แก้ที่นั่นต้องแก้ที่นี่) ; `mascot.png` เดิมไม่ถูกเขียนทับ (ใช้ `--legacy`) ; `demo-check.sh` ตรวจทุกไฟล์ผ่าน tunnel ด้วย UA `LineBotWebhook/2.0`
  - **reply (ไม่เสียโควตา):** ทุก reply แนบ quick reply ที่ข้อความสุดท้าย (ผู้ป่วย: 📋 ยาวันนี้ / 📱 เปิดแอป /today / ❓ ช่วยเหลือ · ยังไม่เชื่อม: 🔗 วิธีเชื่อมบัญชี ("วิธีใช้") / 📱 เปิดแอป /settings · ผู้ดูแลอย่างเดียว: ❓ ช่วยเหลือ) ; `lineService.whoIs()` แยกประเภทผู้ใช้ ; คำสั่ง: "วันนี้"/"ยาวันนี้" (Flex: ความคืบหน้า taken÷ทุกรอบรวม missed เหมือนวงกลมเว็บ, ป้าย ✅ กินแล้ว / ⏰ ยังไม่ได้กิน = pending ที่ `scheduled_at ≤ NOW()` หรือ missed / 🕒 รอเวลา, ชื่อยาที่ยังไม่กินใต้มื้อ — ใช้ `doseService.todayQuery(id, { withDue: true })` เพิ่มคอลัมน์ `is_due` เฉพาะ LINE), "วิธีใช้" (Flex เดียวกับ follow; เชื่อมแล้วเปลี่ยนเนื้อหา), "ช่วยเหลือ"/อื่นๆ (text)
  - **กดกินแล้ว:** สำเร็จ = Flex เล็กท่า cheer (ชื่อยา, เวลา, ความคืบหน้า, "มื้อถัดไป" = มื้อแรกที่ยังมียาไม่ได้กินและยังไม่ถึงเวลา, ครบ = "วันนี้กินครบทุกรายการแล้ว 🌟") · ซ้ำ = text "บันทึกไว้แล้วค่ะ" · หาไม่เจอ/ยาถูกหยุด/ของคนอื่น (ผู้ป่วยกด) = text "ไม่พบรายการยานี้แล้ว" (ไม่เผยของคนอื่น) · LINE ที่ไม่ใช่ผู้ป่วยกด = เงียบ
  - **`#ตัวอย่าง n` (เฉพาะ `DEMO_MODE=true` + ผู้ป่วยที่เชื่อมแล้ว; ไม่งั้น = เมนูช่วยเหลือ):** reply ทุกแบบ หน้าละ 2 แบบ (หัว text + ข้อความ = 4 ข้อความ ≤ 5) ข้อมูลสมมติในหน่วยความจำ ไม่เขียน DB ; ปุ่มกินแล้วในตัวอย่างเป็น `a=preview` → "นี่คือข้อความตัวอย่างค่ะ ยังไม่ได้บันทึกนะคะ" ; quick reply มีปุ่ม "➡️ #ตัวอย่าง n+1" ; ส่งออก JSON สำหรับ Flex Simulator: `node scripts/line-export-messages.mjs` → `docs/line-messages/*.json` (bubble) + `index.json`
  - **rich menu:** รูป `cd frontend && node tools/make-line-richmenu.mjs` → `docs/line-richmenu/richmenu.png` (2500×843; เรนเดอร์ด้วย Edge ผ่าน Playwright ฝัง Mitr 600 เป็น @font-face แล้วตรวจ `document.fonts` ว่าโหลดจริงก่อนถ่าย; ไอคอน SVG path ชุดเดียวกับเว็บ) · `node scripts/line-richmenu.mjs [--dry-run]` = validate → ลบเมนูชื่อเดียวกัน → สร้าง → อัปโหลด (`LINE_API_DATA_BASE`, ค่าเริ่มต้น `https://api-data.line.me`) → ตั้งเป็นค่าเริ่มต้นทุกคน (รันซ้ำไม่ซ้อน, selected=true, chatBarText "เมนูน้องยาตรง", 3 ช่อง: "วันนี้" / uri `/today` / "วิธีใช้")
  - **ตรวจกับ LINE จริงโดยไม่ส่งข้อความ:** `node scripts/line-validate.mjs` ส่งทุกแบบ + ทุกหน้า #ตัวอย่าง ไป `POST /v2/bot/message/validate/reply` และ `/validate/push` (ผ่านครบ = exit 0) ; `fake-line.js` มี endpoint validate/rich menu/api-data ตรวจขีดจำกัดเหมือนจริง (และตรวจ reply/push จริงด้วย)
  - **ทดสอบ 6C:** `node --test "node-red/test/*.test.js"` (line-flex, line-messages, reminder-service) + `bash scripts/test-day6c.sh` (LINE ปลอม; recreate nodered 3 ครั้ง; ต้อง `docker compose up -d --build frontend` ก่อน) ; เทส 6/6b ที่เคยตรวจข้อความ reply แบบเดิมอัปเดตให้ตรงข้อความใหม่แล้ว (`scripts/lib/fl-text.js` แปลง Flex เป็นข้อความให้ assert)
  - **`.env` / `.env.example`: ตัวแปรที่ถูกอ้างด้วย `${X}` ต้องประกาศก่อนตัวที่อ้าง** (`NGROK_DOMAIN` ก่อน `PUBLIC_BASE_URL` ก่อน `LINE_MASCOT_URL`) — Compose แทนค่าจากตัวแปรที่ประกาศก่อนหน้าเท่านั้น (ไม่งั้นได้ค่าว่าง)
  - **ngrok ฟรี:** image `ngrok/ngrok:3.39.11-alpine` (tag `3.39.11` เปล่าไม่มี) · เปิดลิงก์ด้วยเบราว์เซอร์ครั้งแรกเจอหน้าเตือน ต้องกด Visit Site; LINE ดึงรูป/ส่ง webhook ไม่เจอ (เช็กด้วย `demo-check.sh` ที่ UA ไม่ใช่เบราว์เซอร์; ถ้าได้ HTML ให้ตั้ง `LINE_MASCOT_URL` ไปโฮสต์อื่น)
- **LINE (วันที่ 7A): แจ้งญาติเมื่อลืมกินยา** (แผนเต็ม `docs/day7-plan.md`; migration `002_escalation.sql`)
  - **cron เดิมทุก 1 นาที (tab 7)** รัน 3 ขั้นตามลำดับ แต่ละขั้นอยู่ใน `try` ของตัวเอง: `reminderService.run` → `reminderService.runFollowup` → `escalationService.run` ; `REMINDER_CRON=off` ปิดทั้งสามขั้น (เฉพาะทดสอบ)
  - `lib/escalation-service.js` (global `escalationService`) เลือก dose (ต่อผู้ดูแล): `status IN (pending, missed)` · ยา `is_active=1 AND as_needed=0` · `scheduled_at ≤ NOW − escalate_after_min` **และ** `≥ NOW − (escalate_after_min + 60)` (กันส่งย้อนหลังเป็นกอง) · ผู้ดูแล `is_active=1` + เชื่อม LINE · ยังไม่มีแถว `dose_escalations` ของคู่ (dose, ผู้ดูแล) ;
    จัดกลุ่ม (ผู้ดูแล, ผู้ป่วย, scheduled_at) = 1 ข้อความ (แบ่งก้อน ≤ 15 รายการ และ postback ≤ 300) ; **จองก่อนส่ง**: transaction `SELECT … FOR UPDATE` แถว dose แล้ว `INSERT IGNORE dose_escalations` (UNIQUE dose_id+caregiver_id) ส่งเฉพาะ dose ที่ `affectedRows=1` (ผู้ป่วยกินไปแล้วระหว่างนั้นไม่ถูกจอง) + ตั้ง `dose_logs.escalated_at` (undo อ่านค่านี้) ;
    โควตา `canPush(db,'escalation')` ไปได้ถึง `effective_cap` เต็ม = `console.log('escalation_quota_skipped left=…')` ไม่จอง ไม่ส่ง (ลองใหม่ได้ในหน้าต่างเดิม) ; push ล้มเหลว = `dose_escalations.status='failed'` ไม่คืนการจอง ; `REMINDER_ONLY_EMAIL_SUFFIX` กรองผู้ป่วยเหมือน reminder
  - **ตาราง `dose_escalations`**: `sent_at, status(sent|failed), acknowledged_at (กดรับทราบ), confirmed_at (กดยืนยันว่ากินแล้ว), resolved_notified_at (ปิดเรื่องแล้ว)` ; หน้า Settings แสดง 5 รายการล่าสุดต่อผู้ดูแลจาก `GET /api/caregivers` → `recent_escalations[] { sent_at, scheduled_at, slot, time, doses, outcome: confirmed|acknowledged|none|failed }`
  - **Flex ญาติ** (`line-messages.js` `buildEscalation`): หัวพื้นเหลือง mascot-bell "คุณ{ชื่อแรก ≤10 ตัวอักษร}ยังไม่ได้กินยานะคะ" (หัวข้อ ≤ 26 ตัวอักษรฐาน) + ป้าย "🌆 มื้อเย็น 18:00 น. · เลยมา 1 ชม. 5 นาที" + รายการยา ≤ 6 + "ลองโทรถามคุณ…ได้นะคะ" ; ปุ่มหลัก "✓ ยืนยันว่ากินแล้ว" postback `a=cg_take&d=<dose ids>` ; ปุ่มรอง "รับทราบ" postback `a=cg_ack&e=<dose_escalations ids>` ; altText "⚠️ คุณ…ยังไม่ได้กินยามื้อ… · เลยมา …"
  - **ปุ่ม `cg_take`** (`escalationService.confirmTaken`): ต้องเป็น `caregivers.line_user_id` (active) ของผู้ป่วยเจ้าของ dose จริง — **ไม่มีสิทธิ์เลย = reply "ไม่พบสิทธิ์ผู้ดูแล" (ไม่เงียบ)** → `doseService.takeMany(db, patientId, ids, 'caregiver', {noHook:true})` (`takeInTx` ตัวเดียวกัน หักยา 1 ครั้ง) → ตั้ง `confirmed_at` → ปิดเรื่องให้ญาติคนอื่น ; reply บอกว่า "ผู้ป่วยกินไปก่อนหน้านี้แล้ว (บันทึกเมื่อ HH:MM น.)" หรือ "มีญาติยืนยันไว้แล้ว" เมื่อ dose taken อยู่แล้ว (ไม่หักซ้ำ, ตั้ง `acknowledged_at`)
  - **ปิดเรื่อง** (`notifyResolved`): `doseService.setAfterTaken(fn)` (ตั้งใน `settings.js`) เรียกหลัง COMMIT ของ `take()`/`takeMany()` ทุกช่องทาง (app/line/push/caregiver) → ส่ง "💚 คุณ…กินยามื้อ…แล้วค่ะ" (kind=escalation) ให้ผู้ดูแลที่ถูกแจ้งไว้ ครั้งเดียวต่อ (ผู้ดูแล, dose) จอง `resolved_notified_at` ก่อนส่ง ; ข้ามคนที่ `confirmed_at` ไม่ว่าง (กดยืนยันเอง) ; hook ล้มเหลวไม่ทำให้การบันทึกกินยาล้ม
  - **เตือนซ้ำผู้ป่วย** `REMINDER_FOLLOWUP_MIN` (ค่าเริ่มต้น 0 = ปิด ; ส่งผ่าน `lineEnv`): `reminderService.runFollowup` — dose pending ที่เคยเตือนปกติแล้ว (`reminded_at` ไม่ว่าง) `followup_at` ว่าง และ `N ≤ เลยเวลา ≤ N+30 นาที` → จอง `followup_at` แล้วส่ง Flex หัวเหลือง (`buildReminder(…, {followup:true})`) kind=reminder (งบเตือนปกติ)
  - **"วันนี้" ของผู้ดูแล**: `lineService.caregiverTodayFlex` → `buildCaregiverToday` Flex แบบย่อต่อผู้ป่วย (ความคืบหน้า + มื้อที่ยังไม่ครบ **ไม่แสดงชื่อยา**) ; LINE ที่เป็นทั้งผู้ป่วยและผู้ดูแลได้ 2 ข้อความ (ของตัวเอง + ผู้ที่ดูแล)
  - **เดโม** `POST /api/demo/escalate-now` (JWT, `DEMO_MODE≠true` = 404): กลุ่ม pending ของวันนี้ใกล้ `NOW()` ที่สุด แจ้งผู้ดูแลที่เชื่อม LINE ทุกคนทันที (ข้าม `escalate_after_min` ; การ์ดแสดง "เลยมา" ตามเวลาที่ผู้ดูแลตั้ง ; ยังจองก่อนส่ง) ·
    409 `NO_CAREGIVER_LINKED` / `NO_PENDING_DOSE` / `ALREADY_ESCALATED` (body `{quota_left, reserve}`) · body `{force:true}` ส่งซ้ำได้ (ไม่เพิ่มแถว, `resent:true`, log `escalate_force caregiver_id=… doses=…`) · 429 `LINE_QUOTA` · 502 · หน้า Settings: ปุ่ม "ทดลองแจ้งญาติตอนนี้" ถ้าได้ 409 ALREADY_ESCALATED แสดง dialog "แจ้งญาติไปแล้ว ส่งซ้ำไหม?" พร้อมโควตาสำรองที่เหลือ · inject "แจ้งญาติทดสอบ (demo user)" ใน tab 7
  - **ปิดรอบค้าง (tab 6, cron 03:00 + inject "▶ รันตอนนี้")**: `doseService.closeStaleDoses` ตั้ง `status='missed'` ให้ dose ที่ยัง `pending` และ `scheduled_at < CURDATE()` (รันซ้ำได้ ไม่แตะวันนี้/taken ; กินย้อนหลังได้ missed → taken จากทุกช่องทาง ; `REMINDER_ONLY_EMAIL_SUFFIX` กรองเฉพาะตอนรันเทส) — ก่อนหน้านี้ไม่มีโค้ดตั้ง missed เลย ทำให้ Dashboard (taken ÷ (taken+missed)) คำนวณผิด
  - **ช่องทางที่ยืนยัน (`dose_logs.source`)**: `app|line|push|caregiver` ; `GET /api/doses/today` ส่ง `source` ; เว็บแสดงผ่าน `sourceLabel()` (`core/i18n/labels.ts` mapping เดียว): `caregiver` = "ญาติยืนยันแล้ว", `push` = "จากการแจ้งเตือนบนเครื่อง", `line` = "ยืนยันทาง LINE", `app` = ไม่แสดง
  - **ทดสอบ 7A:** `node --test` (`escalation-service.test.js` + ขยาย line-flex/line-messages) + `bash scripts/test-day7a.sh` (LINE ปลอม ; recreate nodered 2 ครั้ง ; เคารพ `REMINDER_ONLY_EMAIL_SUFFIX` + `real-snapshot.sh` ซึ่งเทียบ `followup_at`, `source` และจำนวน `dose_escalations` ของผู้ใช้จริงเพิ่ม) · รัน lib ใน container โดยตรง: `docker compose exec -T nodered node -e "…require('/data/lib/escalation-service').run(db, createClient(), process.env)"`
- **แก้ frontend แล้ว container ไม่เปลี่ยน:** ต้อง `docker compose up -d --build frontend` (`demo-check.sh` เตือนถ้า image เก่ากว่าไฟล์ที่แก้ล่าสุดใน `frontend/` และเช็ก tunnel running + `PUBLIC_BASE_URL` มีโดเมน)
- API prefix `/api/*`, LINE webhook `/line/webhook` (nginx proxy ไว้แล้ว; body สูงสุด 10mb)
- error response รูปแบบเดียว: `{ error: "CODE", details: "ข้อความไทย" }`
- **AI pipeline (tab 2-AI-Scan)** — ไม่ใช้ OCR/Cloud Vision (ไม่มี billing) ส่งรูปให้ **Gemini ครั้งเดียว** ทั้งอ่านตัวหนังสือและตีความ (key เดียว = `LLM_API_KEY`)
  - `POST /api/scan` รับ `{image: base64}` หรือ `{text}` อย่างใดอย่างหนึ่ง → ตรวจ input (magic bytes JPEG/PNG/WEBP, ≤ 8 MB หลังถอด base64, ข้อความ 5–1000 ตัว; ผิด = 400 `VALIDATION`)
    → จำกัดการใช้ (4 ครั้ง/นาที, 15 ครั้ง/วัน/ผู้ใช้ ใน flow context `scanHits`; เกิน = 429 `RATE_LIMIT`) → บันทึกรูป `/data/uploads/<userId>/<ts>.<ext>` (`image_path` เก็บแบบ relative `uploads/…`)
    → node `http request` ยิง `generateContent` (header `x-goog-api-key` เท่านั้น, timeout 30 วินาที, `msg.requestTimeout`) → `scan_decide` (ดู retry) → ดึงข้อความ JSON (บล็อก/ว่าง = 422 `AI_NO_RESULT`)
    → `llmOutput.process` (parse → Ajv → ปิดเลขบัตร 13 หลัก/เบอร์โทรซ้ำฝั่ง server → business rules → `review_flags`; ล้มเหลว = 422 `AI_INVALID_JSON` / `AI_SCHEMA_MISMATCH`)
    → INSERT `prescriptions` (draft, `llm_model` = รุ่นที่ใช้จริง) → ตอบ `{ prescription_id, ocr_text, result, review_flags }` (= `ScanResponse`)
  - **API ตรวจผลสแกน (วันที่ 5, tab 2-AI-Scan, logic ใน `lib/prescription-service.js` → global `prescriptionService`; ทุกตัว JWT + เจ้าของเท่านั้น ไม่ใช่เจ้าของ/ไม่มี = 404):**
    - `GET /api/prescriptions/:id` → `{ prescription_id, status (draft|confirmed|discarded), input_type (image|text), has_image, ocr_text, result, review_flags (คำนวณใหม่จาก llm_json), existing_matches }`;
      `existing_matches` = `[{ index, medication_id, name, strength, remaining_qty }]` ยาที่ `is_active=1` ชื่อตรงกับยาในผลสแกน (ไม่สนตัวพิมพ์เล็กใหญ่/ช่องว่าง; คำนวณเฉพาะ draft)
    - `GET /api/prescriptions/:id/image` ส่งไฟล์รูปพร้อม Content-Type จริง + `Cache-Control: private, no-store` ; ไม่มีรูป/ถูกลบแล้ว = 404 (frontend ดึงเป็น blob ผ่าน HttpClient เพราะ `<img>` แนบ JWT ไม่ได้ แล้ว revoke object URL ตอนออกจากหน้า)
    - `POST /api/prescriptions/:id/confirm` body `{ items: [ {action:"create", medication:{…ฟอร์มเดียวกับ POST /api/medications}} | {action:"refill", medication_id, qty} ] }` (1–20 รายการ)
      ลำดับตรวจ: เจ้าของ (404) → status ต้อง draft (409 `ALREADY_DONE` พร้อม `status` ใน body) → ตรวจทุก item ด้วย `validate-medication.js` (400 `VALIDATION`, `details` ขึ้นต้น "รายการที่ N: " + `item_index` 0-based; `meal_relation: "unknown"` ไม่ผ่าน; refill ซ้ำยาตัวเดียวกัน = 400)
      → **transaction เดียว** (`medicationService.createInTx` / `refillInTx` ใช้ซ้ำของ POST /api/medications และ /refill; ยาเก็บ `prescription_id`; refill ยาของคนอื่น = 404 พร้อม rollback ทั้งหมด; `SELECT … FOR UPDATE` บนแถว prescription กันกดซ้ำสองแท็บ) → `status='confirmed', confirmed_at=NOW()` → **หลัง COMMIT** ลบรูป (ลบไม่สำเร็จไม่ทำให้ request ล้ม — cron 03:00 เก็บให้)
      → ตอบ `{ created:[{medication_id,name,skipped_slots_today}], refilled:[{medication_id,name,remaining_qty}] }`
    - `POST /api/prescriptions/:id/discard` → `status='discarded'` + ลบรูป ; ไม่ใช่ draft = 409 `ALREADY_DONE` ; ตอบ `{ prescription_id, status }`
  - **ชื่อ field ของ Gemini (generateContent, camelCase):** `systemInstruction`, `contents[].parts[]` (`inlineData{mimeType,data}` / `text`), `generationConfig{responseMimeType, responseJsonSchema, thinkingConfig}`;
    คำตอบ `candidates[0].content.parts[].text`, `promptFeedback.blockReason` — ห้ามเปลี่ยนไปใช้ Interactions API; ไม่ตั้ง `temperature` (ใช้ค่าเริ่มต้นตามคำแนะนำ Gemini 3); `maxOutputTokens: 4096` กันคำตอบยาวไม่หยุด (`finishReason = MAX_TOKENS` → 422 `AI_NO_RESULT` ไม่ retry); `thinkingConfig.thinkingLevel` ตามรุ่น (`scanService.thinkingLevelFor`): ชื่อรุ่นมี `lite` = `minimal`, รุ่นอื่น = `low` เพราะ `gemini-3.8-flash` ตอบ 400 "Thinking level MINIMAL is not supported for this model"; ตอน fallback ไปรุ่นอื่นต้องปรับระดับใหม่ (`bodyForModel`). ทำไมต้องลด thinking: ค่าเริ่มต้นทำให้ Lite ช้ามาก (ข้อความ PRN 32 วินาที, รูป 2 ค้างเกิน 60–250 วินาที) — เมื่อตั้ง minimal ทุกเคสของ Lite ใช้ 3–4 วินาที
  - **schema ที่ส่ง Gemini = `responseJsonSchema`** (JSON Schema ต้นฉบับ inline `$defs`/`$ref` แล้ว ตัด `$schema/$id` และ **`maxItems`**) จาก `scanService.toGeminiSchema()`; `type: ["x","null"]`, `enum`, `minimum/maximum`, `minLength/maxLength`, `additionalProperties` ใช้ได้ปกติ; Ajv ฝั่งเรายังบังคับ `maxItems` จากไฟล์ต้นฉบับ `prompts/medicine-parse.schema.json`
  - **บทเรียน 400 `INVALID_ARGUMENT` "Request contains an invalid argument." (ไม่ระบุ field, 7 ต.ค.):** สาเหตุ = **`maxItems` ใน schema** (ทดสอบด้วย gemini-3.5-flash-lite แบบแบ่งครึ่ง: ข้อความล้วน/systemInstruction/responseMimeType ผ่าน, schema เล็กผ่าน, schema เต็มไม่ผ่าน,
    ตัด enum/min/max ยังไม่ผ่าน, ตัดเฉพาะ `maxItems` ผ่านแม้ยังมี null/minLength/additionalProperties) ; `responseSchema` (OpenAPI subset) ก็ 400 เพราะมี `maxItems` เหมือนกัน
    ถ้าเจออีก: ดู log `gemini error <status>: {…}` (error body เต็ม) แล้วแบ่งครึ่ง schema ทีละ keyword กับรุ่น Lite; `scripts/fake-gemini.js` ตอบ 400 ถ้า body มี `maxItems`/`responseSchema`/`temperature`/`maxOutputTokens` เพื่อกันถอยหลัง
  - system prompt มีกฎ "Ambiguity": ช่วงค่า/ช่วงเวลากำกวม ("1–2 เม็ด", "ทุก 4–6 ชม.") ให้ใช้ค่าน้อยสุด ลด confidence ≤ 0.5 และบันทึกใน `unreadable_parts` ทันที ห้ามคิดวนหาคำตอบที่ถูกที่สุด
  - ปิด HN: โมเดลมักปิดชื่อแต่ลืม HN → `redactPii` ปิด `HN/AN/VN` + ตัวเลขฝั่ง server ด้วย
  - log `gemini error <status>: {…}` มี error body เต็ม (ช่วยได้จริง: บอกเหตุผล thinking level / 503 high demand)
  - **timeout:** เวลารวมของการยิง Gemini ต่อ 1 คำขอ ≤ **40 วินาที** (รวม retry/fallback): ครั้งแรก (รุ่นหลัก) `msg.requestTimeout` = 10 วินาที, ครั้งถัดไปใช้เวลาที่เหลือหลังหน่วง, เหลือไม่ถึง 8 วินาที = ไม่ลองใหม่ → 503 `AI_UNAVAILABLE`; frontend timeout 50 วินาที
    node `http request` เมื่อ timeout/เครือข่ายล่ม ส่ง msg ออก output ปกติโดย `statusCode` เป็น string (เช่น `ETIMEDOUT`) และยิง catch ด้วย → **อย่าต่อ catch node ไปที่ `scan_decide`** (จะตัดสินซ้ำสองรอบ) ให้ถือ `typeof statusCode !== 'number'` เป็น error
  - **retry/สลับรุ่น (งบ 1 ครั้ง/คำขอ):** 429 / 5xx (503) / timeout / เครือข่าย → **สลับไป `LLM_MODEL_FALLBACK` ทันที** (คนละรุ่น ไม่หน่วง); ถ้าไม่มีรุ่นสำรองที่ต่างรุ่น: 5xx/timeout → รุ่นเดิมเว้น 2 วินาที, 429 → ล้มเหลว (ห้ามซ้ำรุ่นเดิม) · 4xx อื่นไม่ retry · `finishReason=MAX_TOKENS` ไม่ retry (422) · ล้มเหลวทั้งหมด = 503 `AI_UNAVAILABLE`; ทุก HTTP request ถูก log เป็น `gemini_http model=… status=… ms=…`; `GEMINI_NO_RETRY=true` (เฉพาะทดสอบ) ปิดการลองใหม่เพื่อคุมจำนวน request
  - **circuit breaker ของรุ่นหลัก (8 ต.ค.):** รุ่นหลักล้มเหลว (timeout/เครือข่าย/429/5xx; 4xx อื่นไม่นับ) 2 ครั้งภายใน 5 นาที → เปิด 10 นาที ระหว่างนั้น `scan_prep` ยิง `LLM_MODEL_FALLBACK` ตรงๆ (ได้เวลาเต็ม 40 วินาที) ·
    ครบเวลา คำขอแรกลองรุ่นหลัก 1 ครั้ง (probe) สำเร็จ = ปิด, ล้มเหลว = เปิดต่อ · state ใน global context `geminiBreaker` (หายเมื่อ restart) · logic `breakerPlan/breakerRecord` ใน `lib/scan-service.js` ค่าคงที่ `BREAKER_*` ปรับที่หัวไฟล์ (env `GEMINI_BREAKER_OPEN_MS/WINDOW_MS` ใช้ทดสอบ) ·
    log `gemini_breaker open|close|probe|skip_primary` ; ไม่ใช้เมื่อ `GEMINI_NO_RETRY=true` หรือไม่มีรุ่นสำรองต่างรุ่น · test `node-red/test/breaker.test.js` + `test-day4.sh fake` · รายละเอียด/ผลวัด `docs/ai-test-report.md` หัวข้อ 12
  - **ปิดข้อมูลส่วนตัว:** `ocr_text`/`source_text` ที่เก็บใน DB ต้องแทนชื่อผู้ป่วย→`[ชื่อผู้ป่วย]` HN→`[HN]` เลขบัตร→`[เลขบัตร]` เบอร์→`[เบอร์โทร]` (ชื่อยา/โรงพยาบาลห้ามแทน) — prompt สั่งโมเดล + `redactPii` ซ้ำใน `lib/validate-llm-output.js`;
    ห้าม log API key, base64, `ocr_text` ทั้งก้อน (log ได้แค่ความยาว/เวลา/status)
  - **เก็บรูปเท่าที่จำเป็น:** `POST /confirm` (หลัง COMMIT) และ `POST /discard` เรียก `scanService.deleteUploadForPrescription` ทันที (ไฟล์ + `image_path = NULL`) · "สแกนใหม่" จากหน้า Review (อาจไม่ใช่ซองยา) = discard ก่อนไปหน้า Scan · cron 03:00 ใน tab 6 ลบไฟล์ > 7 วัน + `image_path = NULL` (กวาด draft ที่ผู้ใช้ทิ้งค้างไว้) · สแกนล้มเหลวลบรูปทันที
  - **`AI_MOCK=true`:** ข้าม Gemini ตอบ `prompts/mock-response.json` หลังรอ 2 วินาที ผ่าน extract + validator จริง, `llm_model = "mock"`, บันทึก prescriptions/รูปตามปกติ; ใส่ `[[mock:no_result|invalid_json|schema|unavailable]]` ในข้อความเพื่อจำลอง error
  - prompt/schema อยู่ `node-red/data/prompts/medicine-parse.{system.txt,user.image.txt,user.text.txt,schema.json}` (user.text แทน `{{USER_TEXT}}`); schema มี `ocr_text` (required, ≤ 4000)
  - **รุ่นที่ใช้จริง (ตัดสินใจ 7 ต.ค.):** `LLM_MODEL=gemini-3.5-flash-lite` (ตัวหลัก เร็ว 3–4 วินาที) · `LLM_MODEL_FALLBACK=gemini-3.1-flash-lite` (ตัวสำรอง 11–12 วินาที; รับ `thinkingLevel: minimal` + schema แล้ว ทดสอบจริงรูป 1–2) · **ไม่ใช้ `gemini-3.8-flash`** (minimal ไม่รองรับ, `low` ได้ 503 high demand ยังไม่เคยสำเร็จ) · สำรองสุดท้าย `AI_MOCK=true`; ขีดจริงของ Google ที่ใช้อยู่ 500 ครั้ง/วัน แต่แอปจำกัดผู้ใช้ละ 4 ครั้ง/นาที, 15 ครั้ง/วัน
  - รายงานผลทดสอบทั้งหมด (ใช้ทำสไลด์): `docs/ai-test-report.md` ; ทดสอบจริง: `scripts/test-day4.sh real` (7 เคสของตัวหลัก) / `fb` (รูป 1–2 กับตัวสำรอง, ≤ 2 request) — เรียกจริงเฉพาะเมื่อจำเป็น นับทุก request ใน `scripts/.day4-results/_*_calls` และหยุดทันทีเมื่อ 429
  - ทดสอบ Day 4: `DEMO_PASSWORD=… bash scripts/test-day4.sh mock|real|all` (mock = ไม่เปลืองโควตา; real นับ request ใน `scripts/.day4-results/_calls`, หยุดเมื่อ 429/ไม่ใช่ 200) · ผ่านหน้าเว็บ: `node tools/scan-e2e.mjs` (หน้า Scan) และ `node tools/review-e2e.mjs` (Scan→Review→บันทึก, ใช้กับ `AI_MOCK=true`)
  - **ขนาดยาขัดกัน — ป้องกัน 2 ชั้น (9 ต.ค.):** ซอง `yatung-test-envelope-6.png` ("Sig: 1 tab" vs "ครั้งละ ½ เม็ด") เคยได้ confidence 0.98 ไม่มี flag →
    ชั้น 1 prompt กฎ "Conflicting information" (ค่าน้อยสุด, `confidence.dose` ≤ 0.5, บันทึกค่าทั้งสองใน `unreadable_parts`) + `source_text` ต้องคัดลอกทุกบรรทัดวิธีกิน รวมอังกฤษ ห้ามตัด/แปล ·
    ชั้น 2 `lib/dose-check.js` (`doseConflictReason`) ใช้ใน `reviewFlags`: ดึงขนาดยาจาก `source_text` (½ ครึ่ง เลขไทย ทศนิยม เศษส่วน ช่วง "1–2" = 1 แบบ) ถ้าเจอ ≥ 2 แบบ → flag `dose_per_time` ("ซองเขียนขนาดยาไว้ 2 แบบ (1 และ ½) กรุณาตรวจ");
    นับเฉพาะที่ตามหลัง Sig/take/use/ครั้งละ/รับประทาน/กิน/ทาน หรือมีคำความถี่ (po bid …) — **ไม่นับ** Disp/#30/จำนวน/x30/Qty/mg/วันละ N ครั้ง ; flag `dose` (AI) กับ `dose_per_time` (server) นับเป็นช่องเดียว เหตุผลของ server ชนะ ;
    unit test: `node --test "node-red/test/*.test.js"` (ไม่ใช้ docker; ใช้ผลจริงใน `docs/ai-real-review/before-prompt-fix/`) · รายละเอียดก่อน/หลัง: `docs/ai-test-report.md` หัวข้อ 9
  - **AI eval (รันเองเมื่อแก้ prompt/schema/lib ฝั่ง AI — ไม่อยู่ในชุดทดสอบปกติ เรียก Gemini จริง ~11 request):** `bash scripts/ai-eval.sh` (ไม่ต้องใช้ `DEMO_PASSWORD` — สร้าง user สุ่มเองแล้วลบ; ต้องมี docker + `.env` ที่ `LLM_MODEL` เป็นรุ่น lite) ·
    ยิงซองทุกใบใน `docs/sample-images/` เทียบเฉลย `docs/ai-eval/expected.json` ทีละช่อง (ชื่อ ขนาด จำนวนต่อครั้ง มื้อ ก่อน/หลังอาหาร as_needed จำนวนทั้งหมด flag + ไม่มีชื่อ/HN/เบอร์ + จำนวนยา) → ตารางซอง ผ่าน/ไม่ผ่าน + คะแนน "N/M ช่อง" + เทียบรอบก่อน ·
    บันทึกทุกรอบที่ `docs/ai-eval/runs/<วันเวลา>.{md,json}` (commit เก็บไว้เทียบย้อนหลัง) · สคริปต์สร้าง nodered ใหม่ด้วย `GEMINI_NO_RETRY=true` (ไม่ retry/ไม่สลับรุ่น) เว้น 16 วินาทีต่อซอง (แอปจำกัด 4/นาที) หยุดทันทีเมื่อเจอ 429 ·
    ซองที่ได้ HTTP ไม่ใช่ 200 (เช่น 503 / ETIMEDOUT ช่วงแรกหลัง recreate) = "ไม่ได้ผล" ไม่นับคะแนน → รันซ้ำเฉพาะซองนั้น `bash scripts/ai-eval.sh <ไฟล์>…` · เพิ่มซองใหม่ = ใส่รูปใน `docs/sample-images/` + เพิ่มเฉลยใน expected.json (ช่องที่ไม่ใส่ = ไม่ตรวจ)
  - **ก่อนนอน ≠ ก่อนอาหาร (8 ต.ค.):** prompt มีกฎ "ก่อนนอน" = มื้อ (bedtime) ไม่ใช่ความสัมพันธ์กับอาหาร (ไม่มี ก่อน/หลัง/พร้อมอาหาร ชัดเจน → `any`) + server `bedtimeMealReason` ใน `lib/validate-llm-output.js`: `meal_relation=before` แต่ `source_text` มี "ก่อนนอน" และไม่มี "ก่อนอาหาร"/ac/before meal → flag `meal_relation` "ซองเขียน 'ก่อนนอน' ไม่ได้ระบุก่อนอาหาร กรุณาตรวจ" (เตือนอย่างเดียว ไม่แก้ค่า) · test: `node-red/test/bedtime-meal.test.js` · รายละเอียด `docs/ai-test-report.md` หัวข้อ 10
  - **หน่วยความแรง:** `normalizeStrength` ใน `lib/validate-llm-output.js` แปลง มก./มก/มิลลิกรัม→mg, มล./ซีซี/cc→ml, มคก./ไมโครกรัม→mcg, กรัม→g และตัวพิมพ์ใหญ่ (MG→mg) ฝั่ง server (ไม่แก้ prompt) · test `node-red/test/strength-unit.test.js`
  - **warm-up + เช็กก่อนนำเสนอ:** `lib/gemini-warmup.js` เรียก `models.get` 1 ครั้งตอน Node-RED เริ่ม (log `gemini_warmup … status=…`; ข้ามเมื่อ `AI_MOCK=true`) · `bash scripts/demo-check.sh` สรุป ✓/✗ (README หัวข้อ "ก่อนนำเสนอ") · timeout ช่วงแรก **ไม่ใช่ cold start** แต่ Gemini รุ่น 3.5-flash-lite ช้าเป็นช่วงๆ (ดู `docs/ai-test-report.md` หัวข้อ 12)
  - รูปทดสอบ (ข้อมูลสมมติ) `docs/sample-images/` สร้างด้วย `cd frontend && node tools/make-sample-images.mjs`
  - body สูงสุด 12mb (`apiMaxLength` + nginx `client_max_body_size 12m`) เพราะรูป 8 MB เป็น base64 ≈ 10.7 MB

## Database (MySQL 8.4, `db/init/01_schema.sql` + `02_seed.sql`)
- `users` (line_user_id, line_display_name, line_link_code, line_link_code_expires_at, tts_rate), `user_slot_times` (เวลามื้อต่อคน; trigger สร้าง default 08/12/18/21)
- `caregivers` (ญาติ, line_user_id, line_display_name, link_code, link_code_expires_at, escalate_after_min 10–720)
- `prescriptions` (1 scan = 1 แถว; image_path (ลบเมื่อ confirm/discard หรือ > 7 วัน), ocr_text (ปิดชื่อ/HN แล้ว), llm_json, llm_model, status draft/confirmed/discarded)
- `medications` (dose_per_time, unit, meal_relation, as_needed, warnings JSON, remaining_qty, refill_alert_days, refill_alerted_at)
- `medication_slots` (ยากินมื้อไหน: morning/noon/evening/bedtime)
- **`dose_logs` คือหัวใจ:** 1 แถว = ยา 1 ตัว × 1 รอบ, สถานะ pending → taken | missed,
  `UNIQUE(medication_id, scheduled_at)` ให้ cron สร้างซ้ำได้ (idempotent), มี source app/line/push/caregiver, reminded_at, followup_at (เตือนซ้ำ), escalated_at
- `dose_escalations` (วันที่ 7A: ประวัติแจ้งญาติ 1 แถว = (dose, ผู้ดูแล) UNIQUE ใช้จองก่อนส่ง)
- `push_subscriptions` (Web Push), `notification_logs` (ทุกข้อความที่ส่งออก)
- Views: `v_daily_adherence` (taken ÷ (taken+missed), ไม่นับ pending), `v_medication_supply` (days_left)
- แก้ schema → แก้ไฟล์ SQL แล้ว `docker compose down -v && docker compose up -d --build` (**ข้อมูลหาย**; init รันเฉพาะตอน volume ว่าง)
- บัญชีเดโม: `demo@yatung.app` / `demo1234`

## กฎ dose_logs ที่ต้องจำ (tab 3/4/6)
- **สร้างรอบ:** POST/PUT ยา = `INSERT IGNORE … SELECT` เฉพาะรอบของวันนี้ที่ `scheduled_at > NOW()`; cron 00:05 (tab 6) สร้างทั้งวัน; รอบที่เวลาผ่านไปแล้วตอนเพิ่มยาไม่ถูกสร้าง
  → POST/PUT /api/medications ตอบ `skipped_slots_today: ["morning", …]` ให้ frontend แจ้ง "รอบเช้าของวันนี้ผ่านไปแล้ว จะเริ่มเตือนพรุ่งนี้"
- **PATCH /api/medications/:id/stop:** `is_active=0, end_date=วันนี้` และลบ dose_logs ที่ `pending` ของยานั้น**ทั้งหมด** (ทั้งที่เลยเวลาแล้วและยังไม่ถึง; คง taken/missed เป็นประวัติ);
  `GET /api/doses/today` แสดงเฉพาะยา `is_active=1` ยกเว้น dose ที่ `taken` แล้ววันนี้ (ยังแสดงเป็นประวัติ)
- **PATCH /api/medications/:id/resume:** `is_active=1, end_date=NULL` + สร้างรอบวันนี้เฉพาะที่ `scheduled_at > NOW()` (SQL กลางเดิม) ตอบ `skipped_slots_today` เหมือน POST/PUT; ยาที่ใช้งานอยู่แล้ว = 200 ไม่สร้างซ้ำ
- **PUT /api/medications/:id:** ไม่ส่ง `remaining_qty` = คงค่าเดิม (POST: = total_qty); ลบ pending ที่ `scheduled_at > NOW()` แล้วสร้างของวันนี้ใหม่
- **take:** `taken` แล้ว = 409 `ALREADY_TAKEN`; รับ `missed` ได้ (กินช้า); `remaining_qty` ลดไม่ต่ำกว่า 0 (NULL = ไม่แตะ)
- **undo** (≤ 10 นาทีหลังกด; เกิน = 409 `UNDO_EXPIRED`, ไม่ใช่ taken = 409 `NOT_TAKEN`):
  `escalated_at IS NOT NULL` → กลับเป็น **missed** (กันแจ้งญาติซ้ำ) · `escalated_at IS NULL` → **pending**; ล้าง `taken_at/source`; คืน `remaining_qty` ไม่เกิน `total_qty`
  → `escalationService` ตั้ง `escalated_at` ครั้งแรกที่แจ้งผู้ดูแลคนใดก็ตาม ; กันแจ้งซ้ำด้วย UNIQUE(dose_id, caregiver_id) ใน `dose_escalations` (ไม่ใช่ `escalated_at`)
- **missed:** cron 03:00 (tab 6) ตั้ง `pending` ที่ `scheduled_at < CURDATE()` เป็น `missed` ; `take` รับ missed ได้ (กินย้อนหลัง) ; หน้าวันนี้แสดงเฉพาะรอบของวันนี้
- **PUT /api/settings/slot-times:** ต้อง HH:MM เรียง เช้า < กลางวัน < เย็น < ก่อนนอน; ย้ายทุก dose ของ**วันนี้**ที่ `status='pending' AND reminded_at IS NULL` ไปเวลาใหม่ (ไม่ว่าเวลาเดิมจะผ่านแล้วหรือไม่);
  dose ที่ `reminded_at` ไม่ว่างคงเวลาเดิม; ไม่สร้างรอบใหม่ให้มื้อที่เคยถูกข้าม
- งาน reminder (วัน 5–6) ต้องตั้ง `reminded_at` ตอนส่งเตือน เพราะกฎ slot-times พึ่งคอลัมน์นี้

## Frontend (`frontend/`)
- Angular 21 standalone, PWA (`ngsw-config.json`), Capacitor สำหรับ Android (`npx cap sync android`)
- โครง: `src/app/core/` (`api/` = interface + service ต่อ resource ตรงกับ response จริง, `auth/`, `i18n/` = label/pipe ไทย, `time.ts` = เวลาไทย UTC+7), `src/app/features/<name>/`
  (`shell` โครงแอป [มือถือ: แถบเมนูล่างเป็นพี่น้องในแนวตั้งของ `.main` ไม่ใช่ `position:fixed` จึงไม่บังเนื้อหา; header มือถือมีแต่โลโก้ ปรับขนาดตัวอักษรอยู่ในหน้าตั้งค่า], `today`, `medications` (+ฟอร์ม/dialog เติมยา), `overview` (placeholder วัน 8), `settings`, `scan`, `auth`)
- route หลัง login อยู่ใต้ `ShellComponent` (มือถือ = bottom nav 5 ช่อง, ≥1024px = sidebar): `/today` (หน้าเริ่มต้น), `/medications`, `/medications/new`, `/medications/:id/edit`, `/overview`, `/settings`, `/scan` (Ionic), `/review/:id` (หน้าตรวจผลสแกน Angular Material)
- **route data `hideBottomNav: true`** (ใช้กับ `/scan` และ `/review/:id`): `ShellComponent` อ่านจาก route ลึกสุด (`focusMode` signal) แล้วซ่อนแถบเมนูล่าง + แถบโลโก้ด้านบนบนมือถือ (หน้าโฟกัสงานเดียว); จอ ≥1024px ยังมี sidebar ตามปกติ หน้าใหม่ที่เป็นงานโฟกัสให้ใส่ `data: { hideBottomNav: true }`
- **หน้า Scan (`features/scan/`)**: `scan.page.ts` = logic (Camera, compressImage, ScanService, ลากวาง/paste, หมุนรูป, canDeactivate) · `ui/scan-stage` + `scan-capture|scan-text-input|scan-processing|scan-coach|scan-tips` = presentational (input/output ล้วน แยกเพื่อให้ `/dev/scan-states` ใช้ซ้ำและคุม scss ≤ 4kB) · `image-quality.ts` (เกณฑ์ `DARK_LUMINANCE`/`BRIGHT_LUMINANCE`/`MIN_LONG_SIDE` ปรับที่หัวไฟล์; เตือนเฉยๆ ไม่บล็อกการส่ง) · `text-insert.ts` (เติม chip ที่ cursor); ปุ่ม Ionic ใช้ class `.yt-btn` (`_ionic.scss`)
  - หลักปุ่ม: แต่ละ state มีปุ่มหลักสีทึบได้ปุ่มเดียว ไม่มีปุ่มหลัก disabled · พรีวิวเป็น object URL (revoke ทุกครั้งที่เปลี่ยน/ลบ/ออกจากหน้า) · `submitted=true` ก่อน navigate ไป `/review` เพื่อไม่ให้ canDeactivate ถาม · 422 = state error (น้อง worried), error อื่น (เน็ตหลุด/401/413/timeout/เปิดไฟล์ไม่ได้) = `ion-toast`
  - layout สองคอลัมน์ตัดด้วย container query ของ `app-scan-stage` (≥720px) ไม่ใช่ viewport; ปุ่ม `desktop` (อัปโหลด/ใช้กล้อง) ตัดจาก `matchMedia('(min-width:1024px) and (pointer:fine)')`
  - Ionic ถอด `aria-label` ออกจาก host `ion-button` ไปไว้ที่ปุ่มข้างใน → ทดสอบด้วย `getByRole('button', { name })` ไม่ใช่ selector `[aria-label]`
- **หน้า Review (`features/review/`, วันที่ 5)** — "AI เสนอ คนตรวจ แล้วค่อยบันทึก": โหลด `GET /api/prescriptions/:id` **เสมอ** (scan page ส่งแค่ id; refresh ได้ข้อมูลชุดเดียวกัน; ค่าที่แก้แล้วยังไม่บันทึกจะหายตอน refresh จึงมี `beforeunload` + `canDeactivate` ถามก่อนออก)
  - ไฟล์: `review.page` (state: loading/error/draft/done/confirmed/discarded) · `review-card.component` (การ์ดยา 1 ตัว) · `review-bar.component` (แถบล่างบันทึก/ทิ้ง) · `image-viewer.ts` (ซูมเต็มจอ `MatDialog` + `MatBottomSheet` บนมือถือ) · `review.model.ts` (**กฎทั้งหมดเป็นฟังก์ชันล้วน**: `reasonsFor`, `todoOf`, `flagsForUi`, `toConfirmItems`)
  - **กฎ review flag (ต้องตรวจครบก่อนบันทึก):** flag ของ backend → ช่องในฟอร์มผ่าน `FLAG_TO_FIELD` (`name`, `dose`/`dose_per_time`→`dose`, `slots`, `meal_relation`→`meal`; index −1 `is_medicine_label` = ทั้งหน้า) ·
    ช่องที่ถูก flag = ต้องตรวจจนกว่า **ค่าต่างจากที่ AI อ่านได้** หรือกด "ถูกต้องแล้ว" (แก้กลับเป็นค่าเดิม = กลับมาต้องตรวจอีก) ·
    ช่องที่ **ค่าว่าง** (`meal=unknown`, `dose=null`, ไม่มีมื้อ, ไม่มีชื่อ) กด "ถูกต้องแล้ว" ไม่ได้ ต้องเลือกค่าก่อน · flag −1: ซ่อนการ์ดจนกด "เป็นซองยาจริง ตรวจต่อ" (หรือ "สแกนใหม่" = discard + ไป /scan) ·
    ยาที่เลือก "เติมจำนวนให้ยาเดิม" (ค่าเริ่มต้นเมื่อเจอ `existing_matches`) ไม่ต้องตรวจช่องอื่น ตรวจแค่จำนวนที่เติม > 0 ·
    ปุ่ม "บันทึก N รายการเข้าตารางยา" ปิดจนเหลือ 0 จุด **แต่ต้องบอกเหตุผลเสมอ** (`blocker` + "ไปจุดถัดไป") ห้ามปิดปุ่มเฉยๆ ·
    409 ตอนกดบันทึก (อีกแท็บบันทึก/ทิ้งไปแล้ว) = แสดงสถานะ "บันทึกไปแล้ว/ถูกทิ้งแล้ว" ไม่ใช่ error
  - layout ตัดด้วย container query ของหน้า (≥ 56rem = 2 คอลัมน์ ซ้าย sticky: รูป + `ocr_text`; ต่ำกว่า = ปุ่ม "ดูรูปซองยา" เปิด bottom sheet; โหมดพิมพ์เอง = แสดงข้อความที่พิมพ์) — หน่วย rem จึงเปลี่ยนตามปุ่ม ก/ก+/ก++ (ที่ 125% จอคอมจะเป็นคอลัมน์เดียว)
  - ข้อจำกัดที่ตั้งใจ: ปุ่ม "ย้อนกลับ" ไป /scan โดยไม่ discard (draft ค้างอยู่ ถูกกวาดโดย cron 7 วัน)
- **error ของหน้า Scan:** `features/scan/scan-errors.ts` map code `AI_UNAVAILABLE | AI_NO_RESULT | AI_INVALID_JSON | AI_SCHEMA_MISMATCH` เป็นข้อความไทย (`VALIDATION`/`RATE_LIMIT` ใช้ `details` จาก backend) แสดงในสถานะ error ของน้องยาตรง (worried); error อื่นยังเป็น `ion-toast`; `scan.service` timeout 45 วินาที
- JWT แนบโดย `auth.interceptor`, ทุก route ใช้ `authGuard`; ฟอร์มยามี `unsavedChangesGuard` (`core/unsaved-changes.guard.ts`)
- หน้าวันนี้: สถานะรอบ (รอเวลา/ถึงเวลา/เลยเวลา) คำนวณฝั่ง client จากเวลาปัจจุบัน (เลยเวลา = > 30 นาที ตรงกับ `is_overdue`); สถานะหลัง take/undo ใช้ตาม response ของ API เท่านั้น
- ตัวกลางที่ใช้ซ้ำ: `app-stepper` (− / +), `app-segmented`, `app-time-row` (ตั้งเวลามื้อ ทีละ 15 นาที + dialog พิมพ์เอง), `appHoldRepeat` (directive กดค้างเปลี่ยนต่อเนื่อง ใช้กับปุ่ม −/+), `app-progress-ring`, `app-confetti`, `app-confirm-dialog`, `app-flow-steps` (ตัวบอกขั้นตอน ① ② ③)
- **`app-med-fields` (`shared/components/med-fields/`)** = ช่องกรอกยาชุดเดียวของหน้าเพิ่ม/แก้ไขยา **และ** หน้า Review (ห้ามคัดลอกฟอร์มไปไว้ที่อื่น): `model` ค่า `MedDraft` (two-way `[(draft)]`), input `times` `errors` `flags` (`{reason, canAck}` → พื้นเหลือง + ไอคอน + เหตุผล + ปุ่ม "ถูกต้องแล้ว", ผูก `aria-describedby`) `idPrefix` (กัน id ซ้ำเมื่อมีหลายการ์ด), output `edited` `ack`;
  `med-draft.ts` มี `MedDraft`, `previewText`, `toMedicationInput`, `fieldFromMessage` (map ข้อความ error ของ backend → ช่อง; ตัดคำนำหน้า "รายการที่ N: " ให้ — ถ้าแก้ข้อความใน `validate-medication.js` ต้องแก้ตารางนี้ด้วย)
- ระวัง: `<form (ngSubmit)>` ใช้ได้เมื่อ import `FormsModule` เท่านั้น — ถ้าไม่ import event ไม่ยิงเลย (กดบันทึกแล้วเงียบ) ให้ใช้ `(submit)="$event.preventDefault(); save()"`
- backend ตอบ error validation เป็นข้อความเดียว ไม่ระบุฟิลด์ → ฟอร์มยา map จากคำขึ้นต้นข้อความ (`FIELD_BY_MESSAGE` ใน `med-form.page.ts`); ถ้าแก้ข้อความใน `validate-medication.js` ต้องแก้ตารางนี้ด้วย
- dev server สำหรับ preview: `.claude/launch.json` (ชื่อ `frontend`, พอร์ต 4200)
- ตรวจหน้า Scan: `/dev/scan-states` (เฉพาะ ng serve, ข้อมูลจำลอง ไม่ต้อง login) · `cd frontend && node tools/scan-shots.mjs [--sizes=…] [--scale=125]` → `docs/screenshots/scan/state-*.png` · `node tools/scan-e2e.mjs` (login + ทดสอบอัปโหลด/ลากวาง/paste/หมุน/ลบ/สลับโหมด/error/canDeactivate/มือถือ; ต้องมี `DEMO_PASSWORD` + docker) · unit test: `npx ng test --watch=false` (ผ่านทั้งหมด)
- ตรวจหน้า Review (ไม่ใช้ `DEMO_PASSWORD` — สร้าง user สุ่ม + draft ตัวอย่างใน DB ผ่าน `tools/lib/seed.mjs` แล้วลบทิ้ง ไม่เรียก Gemini): `node tools/review-shots.mjs [--scale=125] [--sizes=…] [state…]` → `docs/screenshots/review/` (flags, clean, dup, notlabel, typed, success, saved, discarded, flags-acked, flags-sheet) ·
  `AI_MOCK=true docker compose up -d --force-recreate nodered` แล้ว `node tools/review-e2e.mjs` (สแกน→ตรวจ→แก้ช่องเหลือง→บันทึก/เติมยาเดิม/ทิ้ง/refresh/409/ออกโดยไม่บันทึก/125% บนมือถือ) · `node tools/med-form-e2e.mjs` (เพิ่มยา→แก้ไขยา→ค่าเดิมโหลดครบ) · `node tools/lib/e2e.mjs` = ตัวช่วยร่วม (login/api/check)
- ทดสอบ Day 5: `bash scripts/test-day5.sh` (AI_MOCK=true สร้าง user A/B เอง: 401/404/409/400+item_index, ยาซ้ำ, ดูรูป, confirm ล้มกลางทาง rollback, confirm พร้อมกัน 2 คำขอ, รูปถูกลบหลัง confirm/discard) · เรียก Gemini จริงกับซองทดสอบ: `AI_MOCK=false GEMINI_NO_RETRY=true docker compose up -d --force-recreate nodered; cd frontend && node tools/review-real-scan.mjs <ไฟล์ใน docs/sample-images>…` (≤ 4 ไฟล์, หยุดเมื่อไม่ใช่ 200, ผลลง `docs/ai-real-review/`)

## UI (ผู้ใช้หลักคือผู้สูงอายุ)
- ตัวหนังสือ ≥ 18px, ปุ่มสูง ≥ 56px, ข้อความภาษาไทยทั้งหมด
- สี primary `#0f766e`
- ต้องมี disclaimer "ไม่ใช่คำแนะนำทางการแพทย์"

## Design system (หน้าใหม่ทุกหน้าต้องทำตาม)
**ไฟล์:** `frontend/src/styles/` — `_tokens.scss` (CSS variables `--yt-*`), `_base.scss` (html/body, focus ring, reduced-motion, `.yt-enter`),
`_components.scss` (`.yt-field/.yt-label/.yt-control/.yt-error-text/.yt-alert/.yt-card/.yt-disclaimer`), `_material-theme.scss`, `_ionic.scss`;
รวมที่ `src/styles.scss`. คอมโพเนนต์กลางใน `src/app/shared/`: `app-icon` (SVG inline, ออฟไลน์ได้), `app-logo`, `app-font-size-toggle`, `app-mascot` (ดูหัวข้อ Mascot).
หน้า auth ใช้ `features/auth/auth-shell.component` ครอบ (จอ ≥ 960px แบ่ง 2 ฝั่ง)

**ฟอนต์** (npm `@fontsource/*` โหลดผ่าน `angular.json` → `styles`, ใช้ออฟไลน์/Capacitor ได้; โหลดเฉพาะน้ำหนักที่ใช้)
- หัวข้อ ปุ่ม ตัวเลขเด่น: `var(--yt-font-display)` = Mitr 500/600 · เนื้อความ ฟอร์ม: `var(--yt-font-body)` = Noto Sans Thai Looped 400/500/600
- ข้อความ "ก / ก+ / ก++" ในปุ่มปรับขนาดใช้ฟอนต์เนื้อความ (ก ของ Mitr หน้าตาคล้าย n)
- line-height ภาษาไทย ≥ 1.6 (`--yt-line-height` 1.7, `--yt-line-height-tight` 1.6) ห้ามต่ำกว่านี้
- ขนาดใช้ `rem` เท่านั้น (html = 18px × `--yt-font-scale`) → ขยาย 125% แล้วทั้งหน้าขยายตาม; หัวข้อหน้า `--yt-text-title` (32–40px)

**Token:** สี `--yt-primary(-dark/-deep/-soft)`, `--yt-accent` (ใช้น้อย เฉพาะจุดสำคัญ), `--yt-bg/surface/text/text-muted`,
`--yt-success/warning/danger` (+ `-soft` และ `--yt-on-*-soft`) · รัศมี `--yt-radius-sm 12 / field 16 / md 20 / lg 28 / pill` ·
เงา `--yt-shadow-sm/md/lg` (เขียวอมเทา ห้ามเงาดำ) · ระยะ `--yt-space-1..7` = 4/8/12/16/24/32/48 · ความสูงปุ่ม/ช่อง `--yt-tap` (≥ 56px)
- **ห้าม hardcode สี/ขนาดใน scss ของหน้า** ใช้ `var(--yt-*)`; ต้องการสีใหม่ → เพิ่มใน `_tokens.scss` (เช็ก contrast ก่อน)
- Material override ผ่าน `mat.theme` / `mat.theme-overrides` / `mat.*-overrides` ใน `_material-theme.scss` ห้ามไล่แก้ด้วย `::ng-deep`
- Ionic (หน้า Scan) ใช้ `--ion-*` จาก `_ionic.scss` ชุดเดียวกับ token; ถ้าเพิ่มสีใน Ionic ต้องมีค่า `-rgb` คู่กัน
- คอมโพเนนต์ที่มี scss ของตัวเอง: งบ 4kB/ไฟล์ (warning) 8kB (error)
- ระวัง: Ionic `structure.css` ตั้ง `body` เป็น `position:absolute; overflow:hidden` → หน้าที่ไม่ใช่ Ionic เลื่อนไม่ได้ ต้องทำหน้าให้เป็น scroll container เอง (ดู `auth-shell.component.scss` `:host { position: fixed; inset: 0; overflow-y: auto }`)
- ระวัง: selector `.parent > *` ใน component scss มี specificity สูงกว่า `.child` เพราะ Angular ใส่ attribute ให้ `*` → ใช้ `> :not(.x)`

**การเข้าถึง (ห้ามทำเสียเพื่อความสวย)**
- ข้อความทุกคู่สี contrast ≥ 4.5:1; ปุ่ม/ช่องกรอกสูง ≥ 56px; ขอบช่องกรอก ≥ 3:1 (`--yt-border-strong`)
- label อยู่เหนือช่องกรอกเสมอ (`.yt-label` + `.yt-control`) ห้าม floating label / placeholder แทน label
- focus ring: `outline: 3px solid var(--yt-primary)` + offset (ตั้งไว้ใน `_base.scss` แล้ว ห้ามปิด `outline` โดยไม่ทดแทน)
- error = ไอคอน + ข้อความ (`.yt-error-text`, `.yt-alert`) ไม่ใช้สีอย่างเดียว; ผูก `aria-invalid` / `aria-describedby`
- ปุ่มแสดงรหัสผ่านต้องมีข้อความ ("แสดงรหัส"/"ซ่อนรหัส") ไม่ใช่ไอคอนอย่างเดียว
- ปุ่ม ก / ก+ / ก++ (`FontScaleService`, key `yatung_font_scale` = 100/112/125) ต้องมีทุกหน้า (มุมบนขวา) และทุกหน้าต้องไม่ล้น/ซ้อนที่ 125% ที่ความกว้าง 375 / 768 / 1440
- animation ≤ 300ms, ใช้ `.yt-enter`; `prefers-reduced-motion` ปิด animation อัตโนมัติ (อย่าใส่ animation ที่ขัดกับกฎนี้)
- ไอคอนใหม่ → เพิ่มใน `shared/icon.component.ts` (ไม่พึ่ง CDN) ; ภาพประกอบวาดเอง ห้ามใช้ตัวการ์ตูน/โลโก้ที่มีลิขสิทธิ์

## Mascot — "น้องยาตรง"
แคปซูลตั้งตรง ครึ่งบน `--yt-mascot-top` (#14b8a6 อ่อนกว่า primary เล็กน้อย) ครึ่งล่างขาวนวล ตากลมโตมีไฮไลต์ แก้มชมพู แขนขาสั้นสีเดียวกับครึ่งบน
ออกแบบเองทั้งหมด ห้ามปรับให้คล้ายตัวการ์ตูน/มาสคอตที่มีอยู่ ห้ามใส่โลโก้แบรนด์อื่น

- คอมโพเนนต์: `shared/components/mascot/` → `<app-mascot mood="wave" [size]="160" />` (inline SVG ไฟล์เดียว ร่างกายร่วม เปลี่ยนเฉพาะหน้า/แขน/ของประกอบ)
- สีใช้ token `--yt-mascot-*` ใน `_tokens.scss`; animation: ลอยขึ้นลง, กะพริบตา ~5 วินาที, celebrate เด้งครั้งเดียว (ปิดทั้งหมดเมื่อ `prefers-reduced-motion`)
- a11y: ค่าเริ่มต้น `decorative=true` → `aria-hidden`; ถ้าสื่อความหมายตั้ง `[decorative]="false"` จะได้ `role="img"` + aria-label ไทยตาม mood (override ด้วย `[label]`)
- ตรวจดูทุก mood/ขนาด: `/dev/mascot` (เฉพาะ `ng serve`, ไม่มีใน production build)

| mood | ใช้เมื่อ |
|---|---|
| `wave` | หน้า Login / Register (พร้อมกรอบคำพูด) |
| `happy` | หน้าว่าง เช่น "ยังไม่มียาในตาราง" |
| `thinking` | AI กำลังอ่านซองยา (Scan ตอนรอผล) |
| `reminder` | แจ้งเตือนถึงเวลากินยา |
| `celebrate` | กดกินแล้ว / adherence 100% |
| `sleepy` | มื้อก่อนนอน |
| `worried` | error, ลืมกินยา, ยาใกล้หมด (Scan ตอนอ่านไม่สำเร็จ) |
| `watching` | โฟกัสช่องอีเมล/ชื่อในฟอร์ม auth (ตาเหลือบไปทางฟอร์ม) |
| `shy` | โฟกัสช่องรหัสผ่าน (มือปิดตา); `[peek]="true"` = แง้มนิ้วตอนกด "แสดงรหัส" |

- input เพิ่มเติม: `fluid` (ขยายเต็มกล่องที่ครอบ), `peek`, `grip` (มือเกาะขอบล่าง ใช้คู่ wrapper ที่ตัดภาพ — โหมดโผล่หน้าจากหลังการ์ดบนมือถือ)
- หน้า Login/Register: `auth-shell` รับ `[mood] [message] [peek]` จากหน้าที่ครอบ (logic: success→celebrate 600ms, busy→thinking, error ใหม่→worried, focus→watching/shy; Register รหัสอ่อน→worried แข็งแรง→happy)
  โครง: `auth-stage` (เวทีซ้ายจอ ≥ 960px) + `shared/components/speech-bubble`; กรอกอีเมล/รหัสผิด error ต้องมี `role="alert"` ในฟอร์มเสมอ (กรอบคำพูดเป็น aria-hidden)
- จอ ≥ 1024px: มาสคอตในเวทีเป็นปุ่ม (aria-label "คุยกับน้องยาตรง") กดแล้วเด้ง + พูดประโยคสุ่ม 8 ประโยค (ไม่ซ้ำติดกัน; ตอนฟอร์ม error/กำลังส่ง `chatty=false` ไม่เปลี่ยนข้อความ); `app-speech-bubble` พิมพ์ทีละตัวหลังจุด "..." 600ms (ข้อความเต็มอยู่ใน DOM เสมอ, reduced-motion = แสดงทันที)
- โทนสีหน้า auth: พื้นไล่ `--yt-bg-mint → --yt-bg-cream`; `--yt-peach`/`--yt-amber` ใช้เป็นจุดตกแต่งเล็กๆ เท่านั้น (ห้ามเป็นสีตัวหนังสือ/วางทับพื้นเขียว)

- ไอคอนแอป: `cd frontend && node tools/make-icons.mjs` (ใช้ `sharp`) สร้าง `public/favicon.svg|ico`, `public/icons/*` (any + maskable 192/512 + apple-touch), และ `frontend/resources/icon-only|icon-foreground|icon-background.png` 1024px
  สำหรับ `npx @capacitor/assets generate --android` ในวันที่ 9 — ถ้าแก้หน้า/สีมาสคอต ต้องแก้ค่าซ้ำใน `tools/make-icons.mjs` แล้วรันใหม่

## รอบเก็บงาน UI (Day 3C)
- **ไอคอนข้างข้อความ:** `app-icon` ขยับด้วย `--icon-optical-offset` (0.08em, `_tokens.scss`) เพราะฟอนต์ไทยเผื่อสระบน; ปุ่ม/ลิงก์ที่มี `app-icon` เป็นลูกตรงใช้ `inline-flex` + gap 0.5em + line-height 1 อัตโนมัติ (`:where(...):has(> app-icon)` ใน `_components.scss`); ปุ่มไอคอนล้วนตั้ง `--icon-optical-offset: 0` (หรือ class `.yt-icon-only`)
- **ตัวเลข:** เลข 0 ของ Mitr คล้าย Ø → `_base.scss` ประกาศ @font-face 'Mitr' ช่วง U+0030-0039 ดึงจาก Noto Sans Thai Looped (ทั้งแอปโดยไม่ต้องแก้ทีละจุด); ตัวเลขเด่น (เวลา จำนวน วงแหวน) ใช้ class `.num` (Noto 700 + tabular-nums)
- คอมโพเนนต์/class กลางที่เพิ่ม: `app-segmented [pill]`, `.yt-chip`, `.yt-choices/.yt-choice` (ตัวเลือกใหญ่ 2 ช่อง), `.yt-collapse` (ซ่อน/แสดงนุ่มๆ); `app-stepper` เป็น pill ใบเดียว
- ปุ่ม sticky ล่างบนมือถือ (ฟอร์มยา, บันทึกเวลา): `position: sticky; bottom: 0` ใน `.main` ของ shell (แถบเมนูล่างเป็นพี่น้องในแนวตั้ง จึงอยู่เหนือแถบพอดี); `.yt-page` เว้นล่างเผื่อปุ่มสแกนที่ยื่นขึ้นมา
- **ช่องว่างล่างหน้าบนมือถือ:** token `--yt-bottom-clearance` (`_tokens.scss`) = `--yt-nav-h` (4.4rem) + `--yt-scan-lift` (2.8rem, ส่วนที่ปุ่มกล้องยื่นเหนือแถบ) + `env(safe-area-inset-bottom)` — ใช้ใน `.yt-page` (padding ล่าง), `.yt-snack`; หน้าโฟกัส (ซ่อนแถบ) ShellComponent ใส่ class `.focus` ให้ใช้ระยะปกติ; shell ใช้ `height: 100dvh` · ตรวจ: `cd frontend && node tools/nav-clearance.mjs --scale=125` (ล็อกอินเดโมจริง วัดทุกหน้า 390/375px ต้องผ่านทุกหน้า)
- **ชื่อ LINE (`core/text.ts` `plainName`):** ชื่อบัญชี LINE มักเป็นตัวอักษรตกแต่ง (Mathematical Alphanumeric เช่น 𝐑𝐱𝐭𝐜𝐡…) ที่ฟอนต์ของแอปไม่มี → เบราว์เซอร์ใช้ฟอนต์สำรองของเครื่อง (Windows = **Cambria Math** ดูเป็น serif) → แสดงผ่าน `plainName()` (NFKC → ละตินปกติ) เสมอ; DB เก็บค่าเดิม · ตรวจ: `node tools/settings-shots.mjs --scale=125 --sizes=390x844 [linked|cards|unlinked|code|caregivers|demo]` (API จำลอง ไม่ต้อง login จริง; พิมพ์ฟอนต์จริงที่ใช้วาดผ่าน CDP)
- ตรวจด้วยภาพ: `cd frontend && node tools/shots.mjs [หน้า…] [--sizes=390x844,1440x900] [--scale=125]` (Playwright ใช้ Edge/Chrome ในเครื่อง ไม่ต้องโหลด chromium; ต้องมี `ng serve` และ `DEMO_PASSWORD` ใน env หรือ `.env`) → `docs/screenshots/day3/`; ซูมดูรายละเอียด `node tools/crop.mjs <png> x y w h`; หน้า `/dev/buttons` (เฉพาะ ng serve) แสดงปุ่มทุกแบบพร้อมเส้นกึ่งกลาง
- เนื้อไฟล์ใน repo เป็น CRLF → สคริปต์แก้ไฟล์ที่ match ข้อความหลายบรรทัดต้อง normalize `
` ก่อน

## วิธีทำงาน
- จบงานแต่ละส่วนต้องทดสอบจริง: API ทดสอบด้วย `curl`, frontend ต้อง `ng build` ผ่าน
- ห้าม commit `.env` หรือ `flows_cred.json`
- ห้ามส่ง API key ไป frontend (Gemini/LINE เรียกจาก Node-RED เท่านั้น)
