# CLAUDE.md — YaTung (ยาตรง)

## โปรเจกต์
โปรเจกต์จบวิชาพัฒนาเว็บแอป ระยะเวลา 10 วัน: แปลงรูปซองยาเป็นตารางกินยาด้วย OCR + LLM,
เตือนผ่าน LINE, แจ้งญาติเมื่อไม่กดยืนยัน, dashboard adherence 7 วัน, เตือนยาใกล้หมด, TTS อ่านรายละเอียดยา

- เกณฑ์คะแนน: Angular, Node-RED, REST API, JWT, Docker, Ionic, PWA, Android Studio
  + ความรู้นอกเหนือที่สอน (OCR, LLM, LINE Messaging API)
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
- node id ทุกตัวต้องไม่ซ้ำ, ทุก `http in` ต้องมี `http response` ปลายทาง
- library ใช้ผ่าน `global.get()`: `jwt`, `bcrypt`, `webpush`, `crypto`, `medicineValidator`, `prompts`
  (กำหนดใน `node-red/data/settings.js` → `functionGlobalContext`; `prompts` = `medicineSystem`, `medicineUser`, `medicineSchema`)
- env ใช้ `env.get('JWT_SECRET')` เป็นต้น
- แบ่ง tab: 0-Middleware, 1-Auth, 2-AI-Scan, 3-Medications, 4-Doses, 5-Dashboard, 6-Scheduler, 7-LINE, 8-Push
- API prefix `/api/*`, LINE webhook `/line/webhook` (nginx proxy ไว้แล้ว; body สูงสุด 10mb)
- error response รูปแบบเดียว: `{ error: "CODE", details: "ข้อความไทย" }`
- AI pipeline `POST /api/scan` รับ `{image: base64}` หรือ `{text}` → OCR → LLM → `lib/validate-llm-output.js`
  (parse → Ajv → business rules → `review_flags`; 2 outputs, ล้มเหลว = 422)
  prompt/schema อยู่ `node-red/data/prompts/medicine-parse.{system.txt,user.txt,schema.json}`
  (user template แทน `{{OCR_TEXT}}`) — ถ้า LLM API ปฏิเสธ schema ให้ลบ keyword ตรวจค่าออกเฉพาะสำเนาที่ส่ง LLM

## Database (MySQL 8.4, `db/init/01_schema.sql` + `02_seed.sql`)
- `users` (line_user_id, line_link_code, tts_rate), `user_slot_times` (เวลามื้อต่อคน; trigger สร้าง default 08/12/18/21)
- `caregivers` (ญาติ, line_user_id, link_code, escalate_after_min 10–720)
- `prescriptions` (1 scan = 1 แถว; ocr_text, llm_json, status draft/confirmed/discarded)
- `medications` (dose_per_time, unit, meal_relation, as_needed, warnings JSON, remaining_qty, refill_alert_days, refill_alerted_at)
- `medication_slots` (ยากินมื้อไหน: morning/noon/evening/bedtime)
- **`dose_logs` คือหัวใจ:** 1 แถว = ยา 1 ตัว × 1 รอบ, สถานะ pending → taken | missed,
  `UNIQUE(medication_id, scheduled_at)` ให้ cron สร้างซ้ำได้ (idempotent), มี source app/line/push, reminded_at, escalated_at
- `push_subscriptions` (Web Push), `notification_logs` (ทุกข้อความที่ส่งออก)
- Views: `v_daily_adherence` (taken ÷ (taken+missed), ไม่นับ pending), `v_medication_supply` (days_left)
- แก้ schema → แก้ไฟล์ SQL แล้ว `docker compose down -v && docker compose up -d --build` (**ข้อมูลหาย**; init รันเฉพาะตอน volume ว่าง)
- บัญชีเดโม: `demo@yatung.app` / `demo1234`

## Frontend (`frontend/`)
- Angular 21 standalone, PWA (`ngsw-config.json`), Capacitor สำหรับ Android (`npx cap sync android`)
- โครง: `src/app/core/` (api models, auth ที่จะเพิ่ม), `src/app/features/<name>/` (ตอนนี้มี `scan`)
- JWT แนบโดย `auth.interceptor` (ยังไม่สร้าง), route ใช้ `authGuard` (comment ไว้ใน `app.routes.ts`)

## UI (ผู้ใช้หลักคือผู้สูงอายุ)
- ตัวหนังสือ ≥ 18px, ปุ่มสูง ≥ 56px, ข้อความภาษาไทยทั้งหมด
- สี primary `#0f766e`
- ต้องมี disclaimer "ไม่ใช่คำแนะนำทางการแพทย์"

## วิธีทำงาน
- จบงานแต่ละส่วนต้องทดสอบจริง: API ทดสอบด้วย `curl`, frontend ต้อง `ng build` ผ่าน
- ห้าม commit `.env` หรือ `flows_cred.json`
- ห้ามส่ง API key ไป frontend (OCR/LLM/LINE เรียกจาก Node-RED เท่านั้น)
