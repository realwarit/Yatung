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
- รันทั้งระบบ: `docker compose up -d --build` (เว็บ :8080, Node-RED :1880, Adminer :8081 ด้วย `--profile dev`, tunnel ด้วย `--profile tunnel`)
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
- library ใช้ผ่าน `global.get()`: `jwt`, `bcrypt`, `webpush`, `crypto`, `medicineValidator`, `prompts`, `scanService`, `prescriptionService`, `llmOutput`
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
- แบ่ง tab: 0-Middleware, 1-Auth, 2-AI-Scan, 3-Medications, 4-Doses, 5-Dashboard, 6-Scheduler, 7-LINE, 8-Push
- **กฎการจัด flow (ใช้กับทุก tab):** ทุก endpoint มี `group` ครอบ (ชื่อ = `METHOD /path`; สี: เขียว = เขียนข้อมูล, ฟ้า = อ่านอย่างเดียว, แดง = error/catch, เหลืองน้ำตาล = cron/เรียกภายนอก)
  endpoint ที่มีหลายขั้นตอน (เช่น `POST /api/scan`) ให้มี group ย่อยแยกตามขั้นตอนซ้อนใน group นั้น; ทุก node ตั้งชื่อเป็นภาษาไทยที่อ่านแล้วรู้ว่าทำอะไร
  (ชื่อ `http in` ใช้ `METHOD /path`); ใส่ `g` ให้ node สมาชิกทุกตัว; ทุก tab มี `catch` + group "ข้อผิดพลาดที่ไม่คาดคิด → 500"
  (ถ้ามี `http request` ที่ต้องดัก timeout เอง ให้กำหนด `scope` ของ catch ทั่วไปไม่รวม node นั้น)
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
  - **timeout:** เวลารวมของการยิง Gemini ต่อ 1 คำขอ ≤ **40 วินาที** (รวม retry/fallback): ครั้งแรก `msg.requestTimeout` = 20 วินาที, ครั้งถัดไปใช้เวลาที่เหลือหลังหน่วง, เหลือไม่ถึง 8 วินาที = ไม่ลองใหม่ → 503 `AI_UNAVAILABLE`; frontend timeout 50 วินาที
    node `http request` เมื่อ timeout/เครือข่ายล่ม ส่ง msg ออก output ปกติโดย `statusCode` เป็น string (เช่น `ETIMEDOUT`) และยิง catch ด้วย → **อย่าต่อ catch node ไปที่ `scan_decide`** (จะตัดสินซ้ำสองรอบ) ให้ถือ `typeof statusCode !== 'number'` เป็น error
  - **retry/สลับรุ่น (งบ 1 ครั้ง/คำขอ):** 429 / 5xx (503) / timeout / เครือข่าย → **สลับไป `LLM_MODEL_FALLBACK` ทันที** (คนละรุ่น ไม่หน่วง); ถ้าไม่มีรุ่นสำรองที่ต่างรุ่น: 5xx/timeout → รุ่นเดิมเว้น 2 วินาที, 429 → ล้มเหลว (ห้ามซ้ำรุ่นเดิม) · 4xx อื่นไม่ retry · `finishReason=MAX_TOKENS` ไม่ retry (422) · ล้มเหลวทั้งหมด = 503 `AI_UNAVAILABLE`; ทุก HTTP request ถูก log เป็น `gemini_http model=… status=… ms=…`; `GEMINI_NO_RETRY=true` (เฉพาะทดสอบ) ปิดการลองใหม่เพื่อคุมจำนวน request
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
  - รูปทดสอบ (ข้อมูลสมมติ) `docs/sample-images/` สร้างด้วย `cd frontend && node tools/make-sample-images.mjs`
  - body สูงสุด 12mb (`apiMaxLength` + nginx `client_max_body_size 12m`) เพราะรูป 8 MB เป็น base64 ≈ 10.7 MB

## Database (MySQL 8.4, `db/init/01_schema.sql` + `02_seed.sql`)
- `users` (line_user_id, line_link_code, tts_rate), `user_slot_times` (เวลามื้อต่อคน; trigger สร้าง default 08/12/18/21)
- `caregivers` (ญาติ, line_user_id, link_code, escalate_after_min 10–720)
- `prescriptions` (1 scan = 1 แถว; image_path (ลบเมื่อ confirm/discard หรือ > 7 วัน), ocr_text (ปิดชื่อ/HN แล้ว), llm_json, llm_model, status draft/confirmed/discarded)
- `medications` (dose_per_time, unit, meal_relation, as_needed, warnings JSON, remaining_qty, refill_alert_days, refill_alerted_at)
- `medication_slots` (ยากินมื้อไหน: morning/noon/evening/bedtime)
- **`dose_logs` คือหัวใจ:** 1 แถว = ยา 1 ตัว × 1 รอบ, สถานะ pending → taken | missed,
  `UNIQUE(medication_id, scheduled_at)` ให้ cron สร้างซ้ำได้ (idempotent), มี source app/line/push, reminded_at, escalated_at
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
  → งาน escalation (วัน 7) ต้องตั้ง `escalated_at` ทุกครั้งที่แจ้งญาติ และห้ามแจ้งซ้ำเมื่อ `escalated_at` ไม่ว่าง
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
- ตรวจด้วยภาพ: `cd frontend && node tools/shots.mjs [หน้า…] [--sizes=390x844,1440x900] [--scale=125]` (Playwright ใช้ Edge/Chrome ในเครื่อง ไม่ต้องโหลด chromium; ต้องมี `ng serve` และ `DEMO_PASSWORD` ใน env หรือ `.env`) → `docs/screenshots/day3/`; ซูมดูรายละเอียด `node tools/crop.mjs <png> x y w h`; หน้า `/dev/buttons` (เฉพาะ ng serve) แสดงปุ่มทุกแบบพร้อมเส้นกึ่งกลาง
- เนื้อไฟล์ใน repo เป็น CRLF → สคริปต์แก้ไฟล์ที่ match ข้อความหลายบรรทัดต้อง normalize `
` ก่อน

## วิธีทำงาน
- จบงานแต่ละส่วนต้องทดสอบจริง: API ทดสอบด้วย `curl`, frontend ต้อง `ng build` ผ่าน
- ห้าม commit `.env` หรือ `flows_cred.json`
- ห้ามส่ง API key ไป frontend (Gemini/LINE เรียกจาก Node-RED เท่านั้น)
