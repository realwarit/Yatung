# วันที่ 7 — แจ้งญาติเมื่อลืมกินยา + เตือนยาใกล้หมด + Web Push

> เอกสารนี้รวมทุกอย่างที่ตกลงกันแล้วสำหรับวันที่ 7 ไว้ในไฟล์เดียว:
> (1) ขอบเขตงาน (2) แผนที่ Claude Code เสนอ (3) คำตอบของคำถามที่ต้องตัดสินใจ
> ถ้าข้อไหนขัดกัน ให้ยึด **ส่วนที่ 3 → ส่วนที่ 2 → ส่วนที่ 1** ตามลำดับ

---

# ส่วนที่ 1 — ขอบเขตงาน

Convention เดิมทั้งหมดยังใช้อยู่ (global.get, function node บาง, node ชื่อไทยจัดเป็น group, หยุด nodered ก่อนแก้ flows.json,
ห้าม log ความลับ/raw body/userId เต็ม/รูป base64/ocr_text, reply LINE ใช้ helper และกฎอิโมจิใน line-flex.js และ line-messages.js,
เทสต้องใช้ REMINDER_ONLY_EMAIL_SUFFIX และ real-snapshot เพื่อไม่แตะผู้ใช้จริง)
tab: escalation และยาใกล้หมดอยู่ใน 7-LINE หรือ tab ใหม่ (ให้เสนอ), Web Push อยู่ใน 8-Push, ห้ามใช้ tab 5

## 7A: แจ้งญาติเมื่อลืมกินยา
- cron (ใช้ตัวทุก 1 นาทีเดิมได้) หา dose ที่:
  - status pending หรือ missed
  - ยา active และไม่ใช่ as_needed
  - เลยเวลามาแล้วอย่างน้อย escalate_after_min ของผู้ดูแลแต่ละคน
  - ผู้ดูแลคนนั้นเชื่อม LINE แล้ว
  - ยังไม่เคยแจ้งผู้ดูแลคนนั้นสำหรับ dose นี้
- กันส่งย้อนหลังเป็นกอง: แจ้งเฉพาะ dose ที่ scheduled_at >= now − (escalate_after_min + 60 นาที)
  (เช่น ระบบล่มไปแล้วกลับมา ต้องไม่ส่งของเมื่อวานรัวๆ)
- เก็บประวัติการแจ้งต่อคู่ (dose, ผู้ดูแล) เช่นตาราง dose_escalations ที่ UNIQUE(dose_id, caregiver_id)
  ใช้วิธีจองก่อนส่ง (INSERT แล้วเช็ก affectedRows) และกันการรันซ้อนเหมือน reminder
  คอลัมน์: sent_at, status, acknowledged_at, resolved_notified_at
- จัดกลุ่มเป็น 1 ข้อความต่อ (ผู้ดูแล, ผู้ป่วย, scheduled_at)
- โควตา: kind=escalation ใช้ได้ถึง effective_cap ตามกติกาวันที่ 6 ถ้าโควตาหมด ให้ log และไม่ส่ง
- Flex สำหรับญาติ (ใช้ helper เดิม, หัวพื้นเหลือง, mascot-bell):
  - หัว "คุณ{ชื่อผู้ป่วย}ยังไม่ได้กินยานะคะ"
  - ป้าย "{อิโมจิมื้อ} มื้อ{มื้อ} {HH:MM} น. · เลยมา {x}"
  - รายการยา (ตัดที่ 6 รายการ)
  - บรรทัด "ลองโทรถามคุณ{ชื่อ}ได้นะคะ"
  - ปุ่มหลัก "✓ ยืนยันว่ากินแล้ว": postback → takeInTx ด้วย source='caregiver'
    ต้องตรวจว่า LINE นี้เป็นผู้ดูแลของผู้ป่วยคนนั้นจริง ไม่ใช่ให้ข้ามโดยไม่แจ้ง
    reply ต้องบอกด้วยว่าผู้ป่วยกินไปแล้วก่อนหน้าหรือเปล่า
  - ปุ่มรอง "รับทราบ": บันทึก acknowledged_at แล้ว reply ขอบคุณสั้นๆ
  - altText: "⚠️ คุณ{ชื่อ}ยังไม่ได้กินยามื้อ{มื้อ} · เลยมา {x}"
  - ถ้า dose_logs.source ยังไม่มีค่า 'caregiver' ให้เพิ่มใน migration และตรวจว่าเว็บแสดงผลได้
    (หน้าวันนี้ควรแสดง "ญาติยืนยันแล้ว")
- ปิดเรื่อง: ถ้าผู้ป่วยกินทีหลัง (จากทุกช่องทาง) หลังจากที่แจ้งญาติไปแล้ว ให้ push บอกญาติที่ถูกแจ้งไปแล้วหนึ่งครั้ง
  เช่น "💚 คุณ{ชื่อ}กินยามื้อ{มื้อ}แล้วค่ะ" kind=escalation ส่งแค่ครั้งเดียวต่อกลุ่ม
  ถ้ากดยืนยันโดยญาติคนนั้นเอง ไม่ต้องส่งให้คนนั้น
- เตือนซ้ำผู้ป่วย (ทางเลือก): env REMINDER_FOLLOWUP_MIN (ค่าเริ่มต้น 0 = ปิด)
  ถ้าตั้งค่าไว้ ให้ส่ง Flex แบบ "เลยเวลา" ไปหาผู้ป่วยหนึ่งครั้งเมื่อเลยเวลามาครบจำนวนนาทีนั้น ใช้ kind=reminder และงบเตือนปกติ
  ช่องทางตามกฎข้อ 7C
- "วันนี้" สำหรับ LINE ที่เป็นผู้ดูแล: reply สรุปยาวันนี้ของผู้ป่วยแต่ละคนที่ดูแลอยู่ (แบบย่อ)
  ใช้ helper ความคืบหน้าเดิม และไม่แสดงข้อมูลอื่นนอกจากยาของวันนี้
- หน้า Settings ส่วนญาติ: แสดงประวัติการแจ้งล่าสุด 5 รายการต่อผู้ดูแล (เวลา, มื้อ, รับทราบ/ยืนยัน/ไม่มีการตอบ)
- โหมดเดโม: POST /api/demo/escalate-now (JWT, เฉพาะ DEMO_MODE) แจ้งญาติทันทีสำหรับกลุ่ม pending ที่ใกล้เวลาปัจจุบันที่สุด
  ข้าม escalate_after_min แต่ยังจองก่อนส่งเหมือนเดิม ไม่มีกลุ่มให้ตอบ 409
  หน้า Settings มีปุ่ม "ทดลองแจ้งญาติตอนนี้"
- #ตัวอย่าง: เพิ่มหน้าใหม่สำหรับข้อความของญาติทุกแบบ

## 7B: เตือนยาใกล้หมด
- คำนวณ "พอใช้อีกกี่วัน" ด้วยสูตรเดียวกับเว็บ (ใช้ฟังก์ชันกลางร่วมกัน ห้ามเขียนสูตรซ้ำ)
- ใกล้หมด = พอใช้ ≤ LOW_STOCK_DAYS (env, ค่าเริ่มต้น 7) ยกเว้น as_needed ให้ใช้ remaining_qty ≤ LOW_STOCK_QTY_PRN (ค่าเริ่มต้น 5)
- แจ้งครั้งเดียวต่อรอบที่ยาใกล้หมด: เก็บ low_stock_notified_at ต่อยา และล้างค่าเมื่อเติมยาจนพ้นเกณฑ์
- cron วันละครั้ง เวลา LOW_STOCK_NOTIFY_AT (ค่าเริ่มต้น 09:00 Asia/Bangkok) ส่ง 1 ข้อความต่อผู้ป่วยรวมยาทุกตัวที่ใกล้หมด
  kind=low_stock ใช้งบเตือนปกติ ช่องทางตามกฎข้อ 7C
- Flex (mascot-hello, หัวสีปกติ):
  - หัว "ยาใกล้หมดแล้วนะคะ"
  - บรรทัดต่อยา "{ชื่อยา} · เหลือ {n} {หน่วย} · พอใช้ {d} วัน"
  - "อย่าลืมไปรับยาหรือซื้อเพิ่มนะคะ"
  - ปุ่ม "เติมยาในแอป" (ไป /meds)
- ในเว็บ: ตรวจว่าหน้ายาของฉันและหน้าวันนี้แสดงสถานะใกล้หมดอยู่แล้วหรือยัง ถ้ายัง ให้เพิ่มป้ายสีเหลืองให้สอดคล้องกัน
- เดโม: POST /api/demo/low-stock-now (JWT, DEMO_MODE) ส่งทันทีโดยไม่สนเวลาและ low_stock_notified_at
  แต่ต้องมียาที่ใกล้หมดจริง ไม่มีให้ตอบ 409

## 7C: Web Push (tab 8-Push)
- backend: npm web-push ใน Node-RED
  env VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (ความลับ), VAPID_SUBJECT (mailto ที่เป็นอีเมลสมมติ)
  - ทำ scripts/gen-vapid.mjs ให้ผู้ใช้รันเอง: สร้างคีย์แล้วเขียนลง .env ถ้ายังไม่มี และแสดงเฉพาะ public key
    Claude Code ห้ามรันสคริปต์นี้กับ .env จริง และห้ามอ่าน private key
  - เพิ่มลง .env.example ตามกฎลำดับตัวแปร
- ตาราง push_subscriptions: user_id, endpoint (UNIQUE), p256dh, auth, user_agent แบบย่อ, created_at, last_success_at, fail_count
- endpoint:
  - GET /api/push/public-key (สาธารณะ)
  - POST /api/push/subscribe (JWT, upsert ตาม endpoint ถ้า endpoint นี้เคยเป็นของ user อื่น ให้ย้ายมาเป็นของ user ปัจจุบัน)
  - DELETE /api/push/subscribe (JWT)
  - POST /api/push/test (JWT, ส่งไปทุก subscription ของตัวเอง)
- ส่ง: TTL เหมาะกับเตือนกินยา (เช่น 1 ชม.), urgency high
  ถ้าได้ 404 หรือ 410 ให้ลบ subscription, ถ้า error อื่นให้เพิ่ม fail_count
  ทุกครั้งบันทึก notification_logs ด้วย channel ใหม่ เช่น web_push (เพิ่ม enum ใน migration)
  Web Push ไม่นับโควตา LINE
- payload ห้ามมีชื่อยาหรือข้อมูลสุขภาพ:
  - title "⏰ ถึงเวลากินยามื้อ{มื้อ}แล้ว"
  - body "{n} รายการ · แตะเพื่อดูและบันทึก"
  - ใช้ icon และ badge จากไอคอนหน้าน้องยาตรง
- action "✓ กินแล้ว" บน notification:
  - service worker ไม่มี JWT จึงใช้ action token ที่เซ็นด้วย HMAC ฝั่งเซิร์ฟเวอร์
  - token ผูก user_id และ dose ids มีอายุ 12 ชม.
  - endpoint POST /api/push/take รับ token แล้วเรียก takeMany(..., 'web_push')
  - กดซ้ำได้ผลเหมือน LINE คือไม่หักยาซ้ำ
  - แตะตัว notification → เปิด /today
  ถ้าเบราว์เซอร์ไม่รองรับ action buttons ให้แตะแล้วเปิด /today อย่างเดียว
- กฎเลือกช่องทาง (ใช้กับเตือนปกติ, เตือนซ้ำ และยาใกล้หมด ส่วนแจ้งญาติใช้ LINE อย่างเดียว):
  - เชื่อม LINE → ส่ง LINE
  - ไม่ได้เชื่อม LINE แต่มี subscription → ส่ง Web Push
  - users.notify_both (ค่าเริ่มต้น false) → ส่งทั้งสองทาง
  ทุกช่องทางต้องผ่านการจองก่อนส่งตัวเดียวกัน ห้ามมีช่องทางไหนทำให้ส่งซ้ำ
- frontend:
  - ใช้ @angular/service-worker (SwPush) ทำ manifest และ service worker เท่าที่จำเป็นสำหรับ push
    ไอคอนใช้หน้าน้องยาตรงบนพื้นเขียว (ขนาด 192/512 แบบ maskable และ apple-touch-icon)
    ส่วนงาน PWA ที่เหลือ (offline, install prompt) เก็บไว้วันที่ 8
  - ตรวจว่า ngsw รองรับ notification action ที่เรียก API ได้หรือไม่ (ตรวจกับเอกสาร Angular 21)
    ถ้าไม่รองรับ ให้เสนอวิธีอื่น เช่น ให้ action เปิด /today?take=<token> แล้วแอปเรียก API เอง
  - Settings ส่วนใหม่ "แจ้งเตือนบนเครื่องนี้" แสดงสถานะ 5 แบบ:
    ไม่รองรับ / ต้องเพิ่มลงหน้าจอโฮมก่อน (iPhone ที่ไม่ได้เปิดแบบ standalone, มีวิธีทำ 1-2-3 พร้อมไอคอนปุ่มแชร์)
    / ยังไม่เปิด / เปิดแล้ว / ถูกบล็อก (บอกวิธีเปิดใน Settings ของเครื่อง)
    - ปุ่ม "เปิดการแจ้งเตือน" ต้องขอสิทธิ์ตอนผู้ใช้กดเท่านั้น
    - ปุ่ม "ทดลองส่งแจ้งเตือน"
    - ถ้าเชื่อม LINE แล้ว มีสวิตช์ "ส่งทั้ง LINE และแจ้งเตือนบนเครื่อง"
  - ออกแบบให้ผู้สูงอายุใช้ได้ ใช้ design token เดิม และผ่าน nav-clearance
- ความเสี่ยงที่ต้องพิสูจน์:
  - (ก) หน้าเตือนของ ngrok กับการโหลด ngsw-worker.js และ manifest โดยเฉพาะบน iPhone ที่เปิดจากหน้าจอโฮม
    (cookie อาจแยกจาก Safari) ถ้ามีปัญหา ให้เสนอทางแก้
  - (ข) ngsw กับ notification action ตามข้างบน
  - (ค) nginx ต้องไม่ cache ngsw-worker.js และ ngsw.json แบบยาว และ CSP/headers ต้องไม่บล็อก service worker

## เทส
- fake push service: scripts/fake-push.js รับ POST จาก web-push, เก็บ request และจำลอง 201, 404, 410, 500 ได้
  ใช้ subscription ปลอมที่สร้างคีย์ถูกต้องในเทส
- unit:
  - เลือกช่องทาง
  - เซ็นและตรวจ action token (หมดอายุ / ผิด user / ถูกแก้ไข)
  - payload ไม่มีชื่อยา
  - สูตรพอใช้กี่วันใช้ฟังก์ชันกลาง
  - เกณฑ์ใกล้หมดรวม PRN
  - Flex ของญาติและยาใกล้หมด (altText, กฎอิโมจิ, postback ≤ 300)
- test-day7.sh:
  - escalation: ผู้ดูแล 2 คนตั้งเวลาไม่เท่ากันต้องได้คนละเวลา / ไม่แจ้งซ้ำ / run พร้อมกัน 2 รอบได้ 1 ข้อความ
    / ไม่ส่งย้อนหลังเกินหน้าต่าง / ยาหยุดแล้วและ PRN ไม่แจ้ง / ผู้ป่วยกินก่อนถึงเวลาแจ้งแล้วไม่แจ้ง
    / ยืนยันโดยญาติ (สิทธิ์ถูกและผิด, กินไปแล้ว) / รับทราบ / ปิดเรื่องเมื่อผู้ป่วยกินทีหลัง
    / โควตา: เตือนปกติหยุดที่ cap−reserve แต่ escalation ยังส่งได้ถึง cap
  - follow-up: ปิด / เปิด
  - low stock: ถึงเกณฑ์ / ไม่แจ้งซ้ำ / เติมแล้วรีเซ็ต / PRN / รวมเป็นข้อความเดียว / ช่องทาง
  - push: subscribe, upsert, ย้ายเจ้าของ, unsubscribe, test, 410 แล้วลบ, action token
    / ช่องทางตามกฎ / notify_both ไม่ส่งซ้ำ
  - เดโมทั้ง 2 endpoint: ทั้งตอนเปิดและปิด DEMO_MODE
  - real-snapshot ผู้ใช้จริงไม่เปลี่ยน
- ชุดเดิมต้องผ่านทั้งหมด: node --test, day3a, day4 mock+fake, day5, day6, day6b, day6c, ng build, ng test, nav-clearance, demo-check
- line-validate.mjs ต้องรวมข้อความใหม่ทุกแบบ และผ่านกับ LINE จริง

## ตอนจบแต่ละช่วง
แต่ละช่วงทำแล้วรันเทสทั้งหมด → รายงาน (ตารางเทสและไฟล์ที่เปลี่ยน) → commit แยกตามช่วง
อัปเดต CLAUDE.md, README (แจ้งญาติ, ยาใกล้หมด, Web Push รวมวิธีเพิ่มลงหน้าจอโฮมบน iPhone) และ demo-check.sh
(demo-check.sh เพิ่ม: มี VAPID ครบไหม (ไม่แสดงค่า), จำนวน subscription, ngsw-worker.js ผ่าน tunnel)
ห้าม commit .env, flows_cred.json, .sessions.json, screenshots/, *.backup

---

# ส่วนที่ 2 — แผนที่ Claude Code เสนอ (รออนุมัติ)

## สิ่งที่ค้นพบจากโค้ดเดิม
1. **Git:** PR วันที่ 5 (#19) และ 6A/6B/6C (#22–#24) merge เข้า main แล้ว (HEAD `0374f35`) ; ทำงานบน branch `feat/day7-escalation-push`
2. **ไม่มีโค้ดไหนตั้ง `dose_logs.status = 'missed'` เลย** (cron 00:05 ไม่ได้ปิดรอบ) → รอบที่ลืมกินค้างเป็น `pending` ตลอด ; escalation จึงต้องรองรับ `pending` เป็นหลัก (ตรงสเปก pending หรือ missed) และไม่เพิ่มงาน "ปิดรอบเป็น missed" เอง (นอกสโคป เป็นเรื่อง dashboard วันที่ 8)
3. **Schema ที่มีอยู่แล้ว:** `push_subscriptions` (ขาด `last_success_at`, `fail_count`) ; `notification_logs.channel` มี `web_push` แล้ว แต่ `kind` = `reminder|escalation|refill|link|other` **ไม่มี `low_stock`** ; `dose_logs.source` = `app|line|push` (**ไม่มี `caregiver`**, และใช้ `push` ไม่ใช่ `web_push` — `models.ts` พิมพ์ไว้แล้ว) ; `dose_logs.escalated_at` มีแล้วและ `undo` พึ่งมัน ; `medications.refill_alerted_at` มีแล้ว และถูกล้างตอนเติมยา (`medication-service.js:194` ล้างทุกครั้ง ไม่ดูว่าพ้นเกณฑ์หรือยัง) ; `users` ไม่มี `notify_both`
4. **`web-push` ติดตั้งใน image แล้ว** และเป็น global `webpush` ; `docker-compose.yml` ส่ง `VAPID_*` เข้า nodered แล้ว ; `.env.example` มี 3 ตัวนี้แล้วแต่ยังไม่มีคอมเมนต์
5. **PWA พื้นฐานมีแล้ว:** `@angular/service-worker` 21.2.25 + `provideServiceWorker`, `manifest.webmanifest`, ไอคอน 72–512 + maskable 192/512 + `apple-touch-icon` (จาก `tools/make-icons.mjs`), **nginx ตั้ง `no-cache` ให้ `ngsw.json|ngsw-worker.js|manifest.webmanifest` แล้ว และไม่มี CSP** → ความเสี่ยง (ค) เหลือแค่พิสูจน์ด้วยเทส ; ยังไม่มี `badge` icon (ขาวโปร่งใส)
6. **ngsw กับ notification action (ความเสี่ยง ข) — อ่าน `ngsw-worker.js` 21.2.25 แล้ว:** ngsw จัดการ `push` และ `notificationclick` เอง ผ่าน `notification.data.onActionClick[<action>|default] = { operation, url }` ; operation ที่มี = `openWindow | focusLastFocusedOrOpen | navigateLastFocusedOrOpen | sendRequest`
   **`sendRequest` ทำได้แค่ `fetch(url)` แบบ GET ไม่มี body/header** → เรียก `POST /api/push/take` จาก action ตรงๆ **ไม่ได้** ตามที่สเปกคาด ; ทางเลือกอยู่ในคำถามข้อ 1
7. **สูตร "พอใช้กี่วัน":** อยู่ใน SQL view `v_medication_supply.days_left = FLOOR(remaining / (dose_per_time × จำนวนมื้อ/วัน))` (เฉพาะ `is_active=1 AND as_needed=0`) ; เว็บไม่คำนวณเอง รับ `days_left` จาก `GET /api/medications` ; **เกณฑ์ "ใกล้หมด" ของเว็บ (`medications.page.ts isLow`) = `days_left <= refill_alert_days` ต่อยา (ค่าเริ่มต้น 3)** ไม่ตรงกับ `LOW_STOCK_DAYS` (7) → คำถามข้อ 2 ; หน้า "วันนี้" **ไม่มี** สถานะใกล้หมดเลย ; ยา PRN ไม่อยู่ใน view
8. **`reminder-service.js`** กรอง `u.line_user_id IS NOT NULL` ใน SQL → ต้องเป็น "มีช่องทางส่งได้" (LINE หรือ subscription) ; หน้าต่างเตือนปกติ 0–30 นาทีใช้ `reminded_at` แล้ว → **follow-up ต้องมีคอลัมน์จองของตัวเอง** (`dose_logs.followup_at`) ; `sendGroup()` ผูกกับ LINE push ตรงๆ → ต้องแยกชั้น "ส่งผ่านช่องทาง"
9. **`handlePostback`:** ผู้ดูแลที่กด `a=take` ถูกเมินเงียบ (หา `users.line_user_id`) ; `whoIs()` แยก `caregiver` ได้แล้ว ; "วันนี้" ของผู้ดูแลตอบแค่ข้อความ `caregiverOnly` ; `todayQuery/shapeToday` ใช้ซ้ำสำหรับสรุปย่อได้
10. **`takeInTx(conn, userId, id, source)`** ล็อกด้วย `d.user_id = userId` → ผู้ดูแลต้อง resolve เป็น user_id ผู้ป่วยหลังตรวจสิทธิ์ (LINE นี้เป็น `caregivers.line_user_id` ที่ `is_active=1` ของผู้ป่วยเจ้าของ dose จริง) ; `takeMany` ตอนนี้คืนแค่ `already:[id]` ต้องคืนรายละเอียดเพิ่ม (กินเมื่อไหร่/ช่องทางไหน) เพื่อ reply "ผู้ป่วยกินไปแล้ว"
11. **ไม่มี endpoint ตั้งค่าส่วนตัวของ user** (มีแต่ slot-times) → `notify_both` ต้องมี endpoint ใหม่ และ `GET /api/me` ต้องส่งค่านี้
12. **web-push เรียก endpoint ผ่าน HTTPS เสมอ** → fake-push ต้องเป็น HTTPS
13. **Tab ปัจจุบัน:** 0,1,2,3,4,6,7 (tab 7 มี 11 endpoint + webhook + cron) ; 5 จองไว้ Dashboard
14. **หน้า "วันนี้" ไม่แสดง `source` เลย** → "ญาติยืนยันแล้ว" ต้องเพิ่มใหม่ (ป้ายบนรายการที่ taken)

## ข้อเสนอเชิงโครงสร้าง
- **`lib/notify-service.js`** : `pickChannels({lineLinked, hasSubscription, notifyBoth})` → `['line']|['web_push']|['line','web_push']|[]` (pure) ; `deliver()` ส่งตามช่องทาง **หลังจองก่อนส่งครั้งเดียวที่ชั้นเรียก** (`reminded_at`, `followup_at`, `low_stock_notified_at` ไม่ใช่ต่อช่องทาง จึงส่งซ้ำไม่ได้) ; แจ้งญาติไม่ผ่านชั้นนี้ (LINE อย่างเดียว)
- **`lib/stock-service.js`** = ฟังก์ชันกลางเดียว: SQL อ่าน `v_medication_supply.days_left` (สูตรเดียว ไม่เขียนซ้ำ) + `isLow()` ; `GET /api/medications` ใส่ `is_low` ให้เว็บ
- **`lib/escalation-service.js`**, **`lib/push-service.js`** (VAPID, ส่ง, ลบ 404/410, fail_count, action token), **`lib/push-subscription-service.js`**

## ไฟล์ต่อช่วง

### 7A — แจ้งญาติ
| ไฟล์ | งาน |
|---|---|
| `db/migrations/002_escalation.sql` + `db/init/01_schema.sql` | ตาราง `dose_escalations` (`id, dose_id, caregiver_id, user_id, sent_at, status ENUM('sent','failed'), acknowledged_at, confirmed_at, resolved_notified_at`, UNIQUE(dose_id, caregiver_id), FK CASCADE) ; `dose_logs.source` + `caregiver` ; `dose_logs.followup_at` ; `notification_logs.kind` + `low_stock` |
| `lib/escalation-service.js` | `run` (cron), `sendGroup`, `acknowledge`, `confirmTaken`, `notifyResolved`, `recentForCaregiver`, `escalateNow` (เดโม) |
| `lib/line-flex.js` / `line-messages.js` | `buildEscalation` (หัว `tone:'warn'`, mascot-bell), `buildEscalationResolved`, reply ใหม่ (ยืนยันแล้ว / ผู้ป่วยกินไปแล้ว / รับทราบ / ไม่มีสิทธิ์), `buildCaregiverToday` (ย่อ), หน้าใหม่ใน `samples()` |
| `lib/line-service.js` | postback `a=cg_take` / `a=cg_ack` ; "วันนี้" ของผู้ดูแล |
| `lib/dose-service.js` | `takeMany` รองรับ source `caregiver`/`push` + รายละเอียด already ; hook ปิดเรื่องหลังกินสำเร็จจากทุกช่องทาง |
| `lib/reminder-service.js` | follow-up `REMINDER_FOLLOWUP_MIN` |
| `lib/caregiver-service.js` | `list` แนบ `recent_escalations` (5 รายการ) |
| `settings.js`, compose, `.env.example` | `escalationService`, `REMINDER_FOLLOWUP_MIN` |
| `flows.json` tab 7 | ดูหัวข้อ node |
| frontend | `line.api.ts` (`recent_escalations`, `escalateNow`), `caregivers-section` ประวัติ 5 รายการ, `demo-section` ปุ่ม "ทดลองแจ้งญาติตอนนี้", `models.ts` source `'caregiver'`, หน้าวันนี้ป้าย "ญาติยืนยันแล้ว" |
| tests | `escalation-service.test.js`, ขยาย `line-flex`/`line-messages`, `scripts/test-day7a.sh`, `line-validate.mjs`, `line-export-messages.mjs`, `real-snapshot.sh` (+ `dose_escalations`) |

### 7B — ยาใกล้หมด
| ไฟล์ | งาน |
|---|---|
| `db/migrations/003_low_stock.sql` + init | `medications.low_stock_notified_at` (หรือใช้ `refill_alerted_at` — คำถามข้อ 3) |
| `lib/stock-service.js` | `run` (cron วันละครั้ง), `lowForUser`, `resetRecovered()` (ล้างค่ายาที่พ้นเกณฑ์แล้ว ที่เดียว ไม่พึ่งทุก path เติมยา), `notifyNow` (เดโม) |
| `lib/medication-service.js` | `GET` ใส่ `is_low` ; ปรับการล้าง `refill_alerted_at` ถ้าเลือกข้อ 3 แบบใช้ของเดิม |
| `line-flex.js` / `line-messages.js` | `buildLowStock` (mascot-hello ; ปุ่ม "เติมยาในแอป" → `/medications` — สเปกเขียน `/meds` แต่ route จริงคือ `/medications`) |
| settings/compose/.env.example | `LOW_STOCK_DAYS=7`, `LOW_STOCK_QTY_PRN=5`, `LOW_STOCK_NOTIFY_AT=09:00` |
| flows | cron-plus 09:00 + `POST /api/demo/low-stock-now` + inject |
| frontend | หน้ายาของฉันใช้ `is_low` จาก API ; หน้าวันนี้ป้ายเหลืองใกล้หมด (คลาส `.low-tag` เดียวกัน) ; ปุ่มเดโม |
| tests | `stock-service.test.js`, `scripts/test-day7b.sh` |

### 7C — Web Push (tab 8-Push)
| ไฟล์ | งาน |
|---|---|
| `db/migrations/004_web_push.sql` + init | `push_subscriptions` + `last_success_at`, `fail_count` ; `users.notify_both TINYINT(1) NOT NULL DEFAULT 0` |
| `scripts/gen-vapid.mjs` | ผู้ใช้รันเอง ; เขียน `.env` เฉพาะเมื่อยังไม่มีคีย์ ; พิมพ์เฉพาะ public key ; Claude Code ไม่รันกับ `.env` จริง (เทสด้วยไฟล์ชั่วคราว) |
| `lib/push-service.js` | `sendToUser`, `payloadFor` (ไม่มีชื่อยา), action token HMAC-SHA256 (secret derive จาก `JWT_SECRET` + context "push-take" ไม่ต้องมี env ใหม่ ; ผูก `uid`, `ids`, `exp` 12 ชม.), TTL 3600, urgency high, 404/410 → ลบ, อื่นๆ → `fail_count+1`, log `web_push` |
| `lib/notify-service.js`, `reminder-service.js` | ใช้ช่องทางตามกฎ ; SQL ไม่บังคับ `line_user_id` ; ตรวจโควตา LINE เฉพาะเมื่อช่องทางมี LINE |
| `flows.json` tab **8-Push** | ดูหัวข้อ node |
| `scripts/fake-push.js` | HTTPS ; `POST /_config {mode:"201"|"404"|"410"|"500"}`, `GET /_requests` |
| frontend | `core/push/push.service.ts` (ครอบ `SwPush`, สถานะ 5 แบบ), `settings/push-section.component.ts`, `core/api/push.api.ts`, `settings.api.ts` (notify_both), `today.page` อ่าน `?take=` (ถ้าเลือกข้อ 1-A), `public/icons/badge-96.png` ผ่าน `make-icons.mjs` |
| nginx / ngsw-config | ตรวจ ไม่คาดว่าต้องแก้ ; เทสยืนยัน header |

## Migration (รันซ้ำได้ ใช้ `yt_add_column` เดิม ; ENUM แก้ด้วย procedure ที่เช็ก `COLUMN_TYPE` ก่อน)
- `002_escalation.sql` : `dose_escalations` (`CREATE TABLE IF NOT EXISTS`, index `(user_id, sent_at)`) ; `dose_logs.source` + `caregiver` ; `dose_logs.followup_at` ; `notification_logs.kind` + `low_stock`
- `003_low_stock.sql` : `medications.low_stock_notified_at` (ไม่มีไฟล์นี้ถ้าเลือกใช้ `refill_alerted_at`)
- `004_web_push.sql` : `push_subscriptions.last_success_at/fail_count` ; `users.notify_both`
- แก้ `db/init/01_schema.sql` ให้ตรง ; เทสเทียบ `SHOW COLUMNS` เหมือน 6A

## Endpoint ใหม่
| เมธอด | path | หมายเหตุ | tab |
|---|---|---|---|
| POST | `/api/demo/escalate-now` | JWT ; `DEMO_MODE≠true` = 404 ; 409 `NO_PENDING_DOSE` / `NO_CAREGIVER_LINKED` ; 429 `LINE_QUOTA` ; 502 | 7 |
| POST | `/api/demo/low-stock-now` | JWT, DEMO_MODE ; 409 `NO_LOW_STOCK` | 7 หรือ 9 (ข้อ 4) |
| GET | `/api/push/public-key` | สาธารณะ → `{publicKey}` ; ไม่ตั้งค่า = 503 `PUSH_NOT_CONFIGURED` | 8 |
| POST | `/api/push/subscribe` | JWT ; upsert ตาม endpoint ; ย้ายเจ้าของได้ ; validate endpoint https ≤ 500, p256dh/auth base64url | 8 |
| DELETE | `/api/push/subscribe` | JWT ; body `{endpoint}` ลบเฉพาะของตัวเอง (ไม่ใช่ = 404) | 8 |
| POST | `/api/push/test` | JWT ; ส่งทุก subscription ของตัวเอง ; 409 `NO_SUBSCRIPTION` | 8 |
| POST | `/api/push/take` | **ไม่มี JWT แต่ต้องมี action token ถูกต้อง** → `takeMany(…,'push')` ; token ผิด/หมดอายุ = 401 | 8 |
| PUT | `/api/settings/notify` | JWT ; `{notify_both}` ; `GET /api/me` เพิ่ม `notify_both`, `push_subscribed` | 8 |
- `GET /api/config` **ไม่เปลี่ยน** (`{demoMode}` เท่านั้น) ; `GET /api/medications` + `is_low` ; `GET /api/caregivers` + `recent_escalations`
- postback ใหม่ใน webhook: `a=cg_take&d=<ids>&u=<patient id>` , `a=cg_ack&e=<escalation id>`

## Node ใน tab
- **7-LINE (เพิ่ม ไม่แตะ group เดิมนอกจาก cron):** function ใหม่ต่อท้าย cron เดิม "แจ้งญาติเมื่อลืมกินยา" (เรียก `reminderService.run` แล้ว `escalationService.run` ตามลำดับ) · group `POST /api/demo/escalate-now` (http in → verify-jwt → function → http response, สีเขียว) · group inject "แจ้งญาติทดสอบ (demo user)" · function "แยกประเภท event" ส่ง postback ผู้ดูแลเข้า `handlePostback`
- **8-Push (ใหม่):** group ต่อ endpoint 7 ตัว + "ข้อผิดพลาดที่ไม่คาดคิด → 500" ; `POST /api/push/take` ไม่ผ่าน verify-jwt
- **ยาใกล้หมด:** แนะนำ **tab 9-Stock** (cron-plus 09:00, `POST /api/demo/low-stock-now`, inject)
- ทุก group ชื่อ `METHOD /path` / ภาษาไทย, ใส่ `g`, node id ไม่ซ้ำ, หยุด nodered ก่อนแก้ `flows.json`

## รายการเทส
**Unit (`node --test`):** `notify-service` (เลือกช่องทาง ครบทุกกรณี) · `push-service` (token: ถูก/หมดอายุ/ผิด user/แก้ ids/แก้ signature/ความยาวต่างไม่ throw ; payload ไม่มีชื่อยา/ความแรง ; TTL/urgency ; 404/410/500 ด้วย sender จำลอง) · `stock-service` (เกณฑ์ 7 วัน / PRN ≤5 / ขอบ / remaining NULL ไม่แจ้ง ; สูตรอ่านจาก view เดียว ยืนยันด้วย SQL ใน integration) · `escalation-service` (เงื่อนไขเลือก dose, หน้าต่างย้อนหลัง, จัดกลุ่ม) · `line-flex`/`line-messages` (Flex ญาติ + ปิดเรื่อง + ยาใกล้หมด: altText ≤ 400, อิโมจิ ≤1/บรรทัดต้นหรือท้าย, `scaling:true`, postback ≤ 300 แม้ 15 รายการ, bubble ≤ 30 KB)
**`test-day7a.sh` / `7b` / `7c`** แยกตามช่วง ครบรายการสเปก — ใช้ `REMINDER_ONLY_EMAIL_SUFFIX=@example.test` + `real_snapshot_*` ; **escalation, low-stock, follow-up และ push ต้องเคารพตัวกรองนี้** ; fake LINE + fake push ; VAPID ปลอมสร้างด้วย `web-push generateVAPIDKeys` ในเทส (ไม่แตะ `.env`) ; real-snapshot เพิ่ม `dose_escalations`, `low_stock_notified_at`, `push_subscriptions` ของผู้ใช้จริง
**ที่สเปกไม่ได้ระบุแต่จะเพิ่ม:** ผู้ดูแล `is_active=0`/ถูกลบ/unfollow ไม่ได้รับ · undo หลังญาติยืนยัน (กลับเป็น missed ตามกฎเดิม ไม่แจ้งซ้ำ) · race ผู้ป่วยกินพร้อม cron · ผู้ดูแลกด `cg_take` ของผู้ป่วยคนอื่น = ปฏิเสธชัดเจน · `push/take` ใช้ token ซ้ำไม่หักยาซ้ำ · LINE โควตาเต็มแต่มี subscription (ข้อ 5)
**ชุดเดิม:** node --test, day3a, day4 mock+fake, day5, day6, day6b, day6c, ng build, ng test, nav-clearance, demo-check
**Frontend:** ng test (push.service 5 สถานะด้วย SwPush จำลอง, today `?take=`) + `tools/push-shots.mjs` ถ่าย Settings 5 สถานะที่ 390px/125% + nav-clearance ครอบ Settings
**line-validate.mjs:** รวมข้อความใหม่ทุกแบบ ; ยิง `/validate/*` ของ LINE จริง (ไม่ส่งจริง) เมื่อคุณสั่ง

## ความเสี่ยงและวิธีพิสูจน์
| # | ความเสี่ยง | วิธีพิสูจน์ / ทางแก้ |
|---|---|---|
| ก | ngrok ฟรีแสดงหน้าเตือนกับคำขอ HTML จากเบราว์เซอร์ ; `ngsw-worker.js`/`manifest` อาจได้ HTML แทน → ลงทะเบียน SW ล้มเหลว ; iPhone เปิดจากหน้าจอโฮม cookie แยกจาก Safari | `demo-check.sh` ดึง `/ngsw-worker.js` + `/manifest.webmanifest` ผ่าน tunnel ตรวจ Content-Type ไม่ใช่ HTML ; ทดสอบบน iPhone จริง ; ถ้าติด: (1) header `ngrok-skip-browser-warning` ผ่าน traffic policy (ตรวจเอกสารว่าแผนฟรีทำได้ก่อน) (2) กด Visit Site ในหน้าต่าง standalone ให้ได้ cookie (3) ย้ายไป Cloudflare Tunnel |
| ข | `sendRequest` เป็น GET | คำถามข้อ 1 |
| ค | `ngsw-worker.js` ต้องไม่โดน rule `.js` แคช 1 ปี (ตอนนี้ rule no-cache อยู่ก่อน) | `curl -I` ใน test-day7c.sh : `no-cache`, ไม่มี CSP |
| ง | web-push ใช้ HTTPS เสมอ | fake-push สร้าง cert ด้วย `openssl` ตอนรัน (ไม่ commit กุญแจ) + `NODE_EXTRA_CA_CERTS` ผ่าน env ของสคริปต์ ; สำรอง `NODE_TLS_REJECT_UNAUTHORIZED=0` เฉพาะตอนเทส ไม่อยู่ใน compose หลัก |
| จ | iOS รับ Web Push ได้เฉพาะ 16.4+ และต้องติดตั้งลงหน้าจอโฮม ; ขอสิทธิ์ต้องมาจากการแตะ | สถานะ "ต้องเพิ่มลงหน้าจอโฮมก่อน" ตรวจ `navigator.standalone` / `display-mode: standalone` |
| ฉ | cron/process 2 ตัวแข่งกันแจ้งญาติ | `INSERT IGNORE` + ดู `affectedRows` ใน transaction เดียวกับ `SELECT … FOR UPDATE` ของ dose ; เทส Promise.all |
| ช | `escalated_at` กับ undo : undo หลังแจ้งญาติ → missed → cron เจอ dose อีก | ซ้ำไม่ได้เพราะ UNIQUE(dose_id, caregiver_id) ; มีเทสยืนยัน |
| ซ | เทสที่ recreate nodered ด้วย `REMINDER_CRON=off` ทำให้ผู้ใช้จริงไม่ได้รับเตือน/แจ้งญาติช่วงนั้น | `REMINDER_CRON=off` ปิดทั้งเตือนและแจ้งญาติ ; อย่ารันเทสใกล้มื้อยา |

## ลำดับทำงาน
7A → เทสทั้งหมด → รายงาน → commit · 7B → … · 7C → … (แต่ละช่วงอัปเดต CLAUDE.md / README / demo-check.sh ของช่วงนั้น) ; push + เปิด PR เมื่อคุณสั่ง

## คำถามที่ต้องให้ตัดสินใจ (พร้อมคำแนะนำ)
1. **ปุ่ม "✓ กินแล้ว" บน notification** — `sendRequest` ของ ngsw เป็น GET เท่านั้น :
   **(A, แนะนำ)** action เปิด `/today?take=<token>` แล้วแอปเรียก `POST /api/push/take` เอง ลบ `?take=` ออกจาก URL แล้วแสดง "บันทึกแล้ว ✓" — ไม่แตะ SW ของ Angular, เห็นผลชัดสำหรับผู้สูงอายุ ; ข้อเสีย: ต้องเปิดแอปหนึ่งขั้น
   (B) service worker เขียนเอง `importScripts('ngsw-worker.js')` + `notificationclick` ที่ `fetch POST` — กดครั้งเดียวจบ แต่ดูแล SW เอง เสี่ยงชนกับ ngsw ; iOS ไม่แสดง action buttons อยู่แล้ว
   (C) `sendRequest` GET `/api/push/take?token=` — ง่ายสุดแต่ GET เปลี่ยนข้อมูล และ token อยู่ใน URL/log nginx
2. **เกณฑ์ใกล้หมดซ้ำซ้อน:** เว็บใช้ `refill_alert_days` ต่อยา (3) ส่วนสเปกใช้ `LOW_STOCK_DAYS` (7) — **แนะนำ** ใช้ `LOW_STOCK_DAYS` เป็นเกณฑ์เดียวทั้ง LINE/Push/เว็บ (เว็บรับ `is_low` จาก API) และเลิกใช้ `refill_alert_days` ใน UI (คอลัมน์คงไว้) ; หรือ max(LOW_STOCK_DAYS, refill_alert_days)
3. **คอลัมน์กันแจ้งซ้ำ:** ใช้ `refill_alerted_at` ที่มีอยู่ (ไม่ต้อง migration) **(แนะนำ)** หรือเพิ่ม `low_stock_notified_at` ใหม่ตามสเปก ?
4. **Tab:** escalation อยู่ 7-LINE **(แนะนำ)** ; ยาใกล้หมด (ส่งได้ทั้ง LINE/Push) ไป **tab 9-Stock** ใหม่ แทนยัด tab 7 ที่มี 20+ group แล้ว — ตกลงไหม ?
5. **LINE โควตาเต็มแต่มี subscription:** แนะนำ **fallback ไป Web Push** (ไม่นับโควตา) — ตกลงไหม ?
6. **`dose_logs.source` ของ Web Push:** สเปก `'web_push'` แต่ enum เดิม `'push'` — **แนะนำคง `'push'`** ?
7. **`escalate-now` ซ้ำ:** กลุ่มที่แจ้งผู้ดูแลคนนั้นไปแล้ว → ส่งซ้ำ `resent:true` เหมือน `remind-now` **(แนะนำ)** หรือ 409 ?
8. **ทดสอบบน iPhone จริง** (ความเสี่ยง ก/จ) ต้องการคุณช่วยตอนจบ 7C : ใช้ ngrok จริง + เพิ่มลงหน้าจอโฮม — แจ้งเมื่อพร้อม

---

# ส่วนที่ 3 — คำตอบที่ตัดสินแล้ว

1. **ปุ่ม "กินแล้ว" บน push = ทาง A แต่ token อยู่ใน fragment:** `/today#take=<token>` (ไม่ใช้ query string เพื่อไม่ให้ token ไปอยู่ใน log ของ nginx/ngrok)
   - แอปอ่าน fragment → ลบทันทีด้วย `history.replaceState` → `POST /api/push/take` (ไม่ใช้ JWT) → แสดงผลในหน้า Today ด้วย UI เดิม (สำเร็จ / บันทึกไว้แล้ว / token หมดอายุหรือไม่ถูกต้อง พร้อมปุ่มกินแล้วปกติ)
   - แตะตัว notification ใช้ลิงก์เดียวกัน (iPhone ไม่มีปุ่ม action) ; ปุ่ม action "✓ กินแล้ว" มีเฉพาะเบราว์เซอร์ที่รองรับ ใช้ลิงก์เดียวกัน
   - ห้าม log token ; เทสต้องยืนยันว่า access log ของ nginx ไม่มี token
2. **เกณฑ์ใกล้หมด = `medications.refill_alert_days` ต่อยา** เป็นค่าเดียวทั้งระบบ (เว็บ, LINE, Web Push) ผ่าน stock-service และ view เดียว
   - **ไม่ใช้ `LOW_STOCK_DAYS`** ลบออกจากสเปกและ `.env.example`
   - ค่าเริ่มต้นของยาใหม่เปลี่ยนจาก 3 เป็น 7 (DB default และฟอร์มเว็บ) ห้ามแก้ค่าของยาที่มีอยู่แล้ว
   - PRN ใช้ `remaining_qty ≤ LOW_STOCK_QTY_PRN` (ค่าเริ่มต้น 5) ตามเดิม
3. **ใช้ `refill_alerted_at` เดิม** ถ้าความหมายตรง ; ต้องตรวจทุกที่ที่แก้ `remaining_qty` (เติมยา, แก้ไขยา, กินยา, undo) ว่าล้างค่าเมื่อพ้นเกณฑ์ถูกต้อง ถ้าความหมายไม่ตรงให้แจ้งก่อนเพิ่มคอลัมน์ใหม่
4. escalation อยู่ **7-LINE** ; ยาใกล้หมดอยู่ **tab 9-Stock**
5. **LINE โควตาเต็ม + ผู้ป่วยมี subscription → fallback ไป Web Push** (เตือนปกติ, เตือนซ้ำ, ยาใกล้หมด) ผ่านการจองก่อนส่งตัวเดียวกัน ; บันทึก `notification_logs` ว่าเป็น fallback ; `demo-check.sh` แสดงจำนวนครั้ง fallback เดือนนี้
6. **คง `source='push'`** แต่เว็บแสดง `push` = "จากการแจ้งเตือนบนเครื่อง", `caregiver` = "ญาติยืนยันแล้ว" ; ทุกที่ที่แสดง source ใช้ mapping เดียว
7. **`escalate-now` ในกลุ่มที่ส่งไปแล้ว = 409 พร้อมข้อความไทย** ; body `{force:true}` ส่งซ้ำได้ (เฉพาะ DEMO_MODE, ตอบ `resent:true`, บันทึก log) ; Settings: ถ้าได้ 409 แสดง dialog "แจ้งญาติไปแล้ว ส่งซ้ำไหม? (ใช้โควตาสำรอง)" พร้อมจำนวนโควตาสำรองที่เหลือ ; `low-stock-now` ใช้กติกาเดียวกัน
8. ทดสอบบน iPhone จริงตอนจบ 7C ; ก่อนถึงขั้นนั้นต้องบอกผู้ใช้ (ผู้ใช้รัน `scripts/gen-vapid.mjs` เองและ recreate nodered) ; เขียนขั้นตอนสั้นๆ ไว้ในรายงาน 7B
9. **(เพิ่ม) ปิดรอบค้าง:** cron 03:00 เดิม (tab 6) ตั้ง `status='missed'` ให้ dose ที่ยัง `pending` และ `scheduled_at` < เริ่มต้นวันนี้ (Asia/Bangkok)
   - `takeInTx` รองรับ missed → taken อยู่แล้ว ตรวจว่ากินย้อนหลังจาก LINE/เว็บ/push ใช้ได้
   - escalation, follow-up, "วันนี้", หน้า Today นับ missed ถูกต้อง
   - เทส: เมื่อวาน pending → missed, ของวันนี้ไม่ถูกแตะ, taken ไม่ถูกแตะ, รันซ้ำได้, real-snapshot (ระหว่างเทสเคารพ `REMINDER_ONLY_EMAIL_SUFFIX`)

commit `docs/day7-plan.md` พร้อม 7A ; จบ 7A บอกผู้ใช้ทดสอบ escalation กับ LINE จริง (ผู้ดูแลบัญชีที่สองเชื่อมไว้แล้ว)
