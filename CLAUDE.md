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
- **MySQL credentials:** node-red-node-mysql อ่าน user/password จาก credentials เท่านั้น (ไม่รองรับ `${ENV}`) →
  หลัง clone หรือเปลี่ยน `.env` ให้ `docker compose stop nodered && node node-red/init-credentials.js && docker compose start nodered`
  (สร้าง `flows_cred.json` ที่ถูก gitignore; ถ้าลืมจะเห็น `Access denied for user ''` ใน log)
- Auth: JWT HS256 payload `{ sub, email }`; subflow `verify-jwt` (tab 0) ตอบ 401 เองและใส่ `msg.user = { id, email }`;
  login ผิดเกิน 5 ครั้ง/5 นาที/email → 429 (flow context `loginFails`, หายเมื่อ restart Node-RED)
- node id ทุกตัวต้องไม่ซ้ำ, ทุก `http in` ต้องมี `http response` ปลายทาง
- library ใช้ผ่าน `global.get()`: `jwt`, `bcrypt`, `webpush`, `crypto`, `medicineValidator`, `prompts`
  (กำหนดใน `node-red/data/settings.js` → `functionGlobalContext`; `prompts` = `medicineSystem`, `medicineUser`, `medicineSchema`)
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
- ทดสอบ Day 3A: `DEMO_PASSWORD=… bash scripts/test-day3a.sh` (login ใหม่ในสคริปต์, user ที่ 2 สุ่ม, ลบข้อมูลทดสอบตอนจบ)
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

## กฎ dose_logs ที่ต้องจำ (tab 3/4/6)
- **สร้างรอบ:** POST/PUT ยา = `INSERT IGNORE … SELECT` เฉพาะรอบของวันนี้ที่ `scheduled_at > NOW()`; cron 00:05 (tab 6) สร้างทั้งวัน; รอบที่เวลาผ่านไปแล้วตอนเพิ่มยาไม่ถูกสร้าง
  → POST/PUT /api/medications ตอบ `skipped_slots_today: ["morning", …]` ให้ frontend แจ้ง "รอบเช้าของวันนี้ผ่านไปแล้ว จะเริ่มเตือนพรุ่งนี้"
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
  (`shell` โครงแอป, `today`, `medications` (+ฟอร์ม/dialog เติมยา), `overview` (placeholder วัน 8), `settings`, `scan`, `auth`)
- route หลัง login อยู่ใต้ `ShellComponent` (มือถือ = bottom nav 5 ช่อง, ≥1024px = sidebar): `/today` (หน้าเริ่มต้น), `/medications`, `/medications/new`, `/medications/:id/edit`, `/overview`, `/settings`; `/scan` (Ionic) อยู่นอก shell
- JWT แนบโดย `auth.interceptor`, ทุก route ใช้ `authGuard`; ฟอร์มยามี `unsavedChangesGuard` (`core/unsaved-changes.guard.ts`)
- หน้าวันนี้: สถานะรอบ (รอเวลา/ถึงเวลา/เลยเวลา) คำนวณฝั่ง client จากเวลาปัจจุบัน (เลยเวลา = > 30 นาที ตรงกับ `is_overdue`); สถานะหลัง take/undo ใช้ตาม response ของ API เท่านั้น
- ตัวกลางที่ใช้ซ้ำ: `app-stepper` (− / +), `app-segmented`, `app-time-picker`, `app-progress-ring`, `app-confetti`, `app-confirm-dialog`
- backend ตอบ error validation เป็นข้อความเดียว ไม่ระบุฟิลด์ → ฟอร์มยา map จากคำขึ้นต้นข้อความ (`FIELD_BY_MESSAGE` ใน `med-form.page.ts`); ถ้าแก้ข้อความใน `validate-medication.js` ต้องแก้ตารางนี้ด้วย
- dev server สำหรับ preview: `.claude/launch.json` (ชื่อ `frontend`, พอร์ต 4200)

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

## วิธีทำงาน
- จบงานแต่ละส่วนต้องทดสอบจริง: API ทดสอบด้วย `curl`, frontend ต้อง `ng build` ผ่าน
- ห้าม commit `.env` หรือ `flows_cred.json`
- ห้ามส่ง API key ไป frontend (OCR/LLM/LINE เรียกจาก Node-RED เท่านั้น)
