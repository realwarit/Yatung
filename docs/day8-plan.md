# วันที่ 8 — Dashboard อัตราการกินยา 7 วัน + อ่านออกเสียง (TTS) + เก็บงาน PWA

ลำดับความสำคัญเมื่อขัดกัน: ส่วนที่ 3 → ส่วนที่ 2 → ส่วนที่ 1
**ห้ามเขียนโค้ดจนกว่าจะได้ "ส่วนที่ 3 — คำตอบที่ตัดสินแล้ว"**

## ส่วนที่ 1 — ขอบเขตงาน

### ขั้นตอนการทำงาน
1. เสนอแผน (ส่วนที่ 2) แล้วรออนุมัติ
2. ทำ 8A → รันเทสทั้งหมด → รายงาน → commit
3. ทำ 8B → รันเทสทั้งหมด → รายงาน → commit
4. ทำ 8C → รันเทสทั้งหมด → รายงาน → commit
5. commit แยกตามช่วง ห้ามใส่ .env, flows_cred.json, .sessions.json, *.backup, screenshots/ (hook check-secrets ต้องผ่าน)
6. **ต้องถามก่อน push และก่อนเปิด PR ทุกครั้ง** คาเด็ทเป็นคน merge เอง
7. ก่อนรันเทสที่ recreate container (รวม test-all.sh) ต้องถามก่อนทุกครั้ง เพราะคาเด็ทอาจกำลังทดสอบบนมือถือ

### Convention ที่ต้องทำตาม
- lib service เรียกผ่าน global.get และ function node ให้บาง
- ตั้งชื่อ node เป็นภาษาไทย จัดเป็น group และทุก endpoint มี group "ข้อผิดพลาดที่ไม่คาดคิด → 500"
- หยุด nodered ก่อนแก้ flows.json
- migration ต้องรันซ้ำได้ (stored procedure ชั่วคราวเหมือน 001) และแก้ db/init ให้ตรงกัน
- ข้อความ LINE: อิโมจิ ≤ 1 ตัวต่อบรรทัด, ตัวแปรความยาวไม่แน่นอนอยู่บรรทัดของตัวเอง, บรรทัดคงที่ ≤ ~22 ตัวอักษรไทย, น้ำเสียง ค่ะ/นะคะ

### กฎความปลอดภัย
- ห้ามอ่านหรือแสดงค่าใน .env, ห้ามรัน `docker compose config`
- ห้าม log token, JWT, userId เต็ม (LINE userId log แค่ 6 ตัวท้าย), ocr_text ทั้งก้อน, รูป base64
- endpoint ใหม่ทุกตัวต้องมี JWT และคืนเฉพาะข้อมูลของเจ้าของ
- เทสใช้ผู้ใช้ทดสอบที่สร้างเอง (REMINDER_ONLY_EMAIL_SUFFIX / real-snapshot) ห้ามแตะผู้ใช้จริง
- เทสต้องไม่ทำให้เกิด LINE push จริง (fake-line) และไม่กินโควตา

---

### 8A: Dashboard อัตราการกินยา 7 วัน

**A0. แก้ budget ก่อน:** today.page.scss เกิน anyComponentStyle 4 kB อยู่ 118 ไบต์ → ย้ายสไตล์ร่วมเป็น component ย่อย/partial กลาง **ห้ามเพิ่มค่า budget**; หน้าตาเหมือนเดิมทุกพิกเซล (เทียบก่อน/หลังที่ 375 และ 412px); สไตล์ใหม่ของหน้า Today ต้องอยู่ใน scss ของ component ใหม่ ห้ามเพิ่มลง today.page.scss; `ng build` production ต้องไม่มี budget warning

**A1. นิยามตัวเลข (ต้องตรงกันทุกที่: API, เว็บ, LINE)**
- ช่วง: วันนี้ + ย้อนหลัง 6 วัน = 7 วัน เวลา Asia/Bangkok ใช้ scheduled_date แบบเดียวกับหน้า Today
- นับเฉพาะยาที่ไม่ใช่ as_needed (PRN)
- taken = status taken (ทุก source, รวมกินช้า) · missed = status missed · pending_due = pending และ scheduled_at <= NOW() · upcoming = pending และ scheduled_at > NOW() (ไม่นับในอัตรา)
- due = taken + missed + pending_due
- rate = round(taken × 100 / due) จำนวนเต็ม; due = 0 → null (ห้าม 0 หรือ 100)
- streak_days: นับย้อนจากเมื่อวาน วันที่ due>0 และ taken=due → +1; due=0 ข้ามไม่ตัด; วันไม่ครบ → หยุด; วันนี้กินครบทุก due และไม่มี upcoming ให้นับวันนี้ด้วย; มองย้อนไม่เกิน 60 วัน
- ยาที่หยุดแล้ว: dose ที่สร้างไปแล้วนับตามจริง (รายงานพฤติกรรมตอนหยุดยาในแผน)
- ถ้ามีบันทึก PRN ให้คืน prn_taken ถ้าไม่มีไม่ต้องทำ

**A2. Node-RED tab 5-Dashboard + `lib/stats-service.js`**
- ส่วนคำนวณเป็น pure function (unit test ได้) ส่วน query ใช้ SQL GROUP BY; ลงทะเบียน global ใน settings.js
- `GET /api/stats/adherence?days=7` (JWT; days 7–30 ค่าเริ่มต้น 7 ค่าอื่น 400 ภาษาไทย; ไม่มี JWT 401)
- response: `range{from,to,days}`, `overall{taken,missed,pending_due,due,rate}`, `days[{date,label_th ("จ. 12 ต.ค."),is_today,taken,missed,pending_due,upcoming,due,rate}]` (เก่า→ใหม่ ครบทุกวัน), `by_meal[{meal,label_th,due,taken,rate}]`, `by_medication[{medication_id,name,strength,due,taken,rate}]` (rate น้อย→มาก), `by_source{app,line,caregiver}`, `streak_days`, `prn_taken?`, `generated_at`

**A3. หน้า "สรุป 7 วัน" (Angular)**
- เสนอ route/เมนูในแผน; ห้ามติดตั้งไลบรารีกราฟ (SVG/CSS เอง)
- ตัวอักษร ≥ 18px, ตัวเลขใหญ่ `.num`, พื้นที่แตะ ≥ 48px, contrast AA, ห้ามใช้สีอย่างเดียว (ไอคอน ✓ ✕/ข้อความ)
- ในแผนต้องระบุขนาด px ทุกส่วนที่ 375px ก่อนเขียนโค้ด
- องค์ประกอบ: (1) การ์ดหลัก วงแหวน SVG + น้องยาตรง + ข้อความตามระดับ (100 cheer "เยี่ยมมากค่ะ กินครบทุกมื้อเลย" · 80–99 cheer "เก่งมากค่ะ" · 50–79 hello "ค่อยๆ เพิ่มขึ้นได้นะคะ" · <50 hello "ให้น้องยาตรงช่วยเตือนใน LINE นะคะ" · null hello "ยังไม่มีข้อมูลยาในช่วงนี้ค่ะ"; ห้ามคำตำหนิ) (2) ชิป streak "กินครบติดกัน n วัน" (ซ่อนเมื่อ 0) (3) กราฟแท่ง 7 วัน สูงตาม rate, % บนแท่ง, ป้ายวัน, วันไม่มียา "–", แท่งวันนี้มีป้าย "วันนี้" + ลวดลายต่าง, แตะแสดง "กินแล้ว n · ลืม n · ยังไม่กิน n · ยังไม่ถึงเวลา n" (4) ข้อสังเกตมื้อ: มื้อ rate ต่ำสุด <100 และ due ≥ 2 → "มื้อ{เย็น}ลืมบ่อยที่สุด" (5) รายการต่อยา ชื่อ+ความแรง+แถบ+"กิน n จาก n ครั้ง" (6) ช่องทาง "กดในแอป n · LINE n · ญาติยืนยัน n" (7) ท้ายหน้า "ข้อมูลนี้ไม่ใช่คำแนะนำทางการแพทย์"
- a11y: กราฟ role="img" + aria-label เป็นประโยค + ตารางแบบ visually-hidden
- สถานะ: loading skeleton, error + "ลองใหม่", ออฟไลน์ (ต่อ 8C)
- การ์ดเล็กบนหน้า Today "7 วันล่าสุด กินครบ 86% ›" → หน้าสรุป เป็น component แยก scss ของตัวเอง

**A4. LINE พิมพ์ "สรุป" (reply ทั้งหมด ไม่เสียโควตา)**
- ผู้ป่วย: Flex rate ภาพรวม, แถว 7 วันเป็นสัญลักษณ์ (ครบ/ไม่ครบ/ไม่มียา/วันนี้), streak, ข้อความน้องยาตรงตามระดับเดียวกับเว็บ, ปุ่ม "ดูรายละเอียด" → PUBLIC_BASE_URL/<route สรุป>
- ผู้ดูแล: สรุปผู้ป่วยแต่ละคน ชื่อ+rate **ห้ามแสดงชื่อยา**
- สองบทบาท: ของตัวเองก่อน ตามด้วยผู้ป่วยที่ดูแล · ยังไม่เชื่อม: reply วิธีเชื่อม
- เพิ่ม "สรุป" ในเมนูช่วยเหลือและ quick reply **ห้ามเปลี่ยน rich menu**
- builder ใน line-flex.js / line-messages.js เป็น pure function ผ่าน line-validate.mjs; altText เช่น "📊 สรุปการกินยา 7 วัน: 86%"

---

### 8B: อ่านออกเสียง (TTS)
- **B1** Web Speech API ฝั่งเบราว์เซอร์เท่านั้น ไม่มี backend; เสียง lang ขึ้นต้น th มีหรือไม่ก็ได้; **ห้าม auto-play** (รวมเปิดจาก `/today#take=`)
- **B2** `core/tts/speech-text.ts` (pure + unit test): ห้ามส่งเลขเวลาดิบ แปลงเป็นภาษาพูดไทย (00:00 เที่ยงคืน, 01–05 ตีหนึ่ง…ตีห้า, 06–11 หกโมงเช้า…สิบเอ็ดโมง, 12 เที่ยงวัน, 13 บ่ายโมง, 14–15 บ่ายสอง/สามโมง, 16–18 สี่โมงเย็น…หกโมงเย็น, 19–23 หนึ่งทุ่ม…ห้าทุ่ม; นาที :30 "ครึ่ง", :00 ไม่อ่าน, อื่นๆ "n นาที") · หน่วย mg มิลลิกรัม, mcg/µg ไมโครกรัม, g กรัม, ml/mL มิลลิลิตร, IU หน่วย · ½/0.5 "ครึ่งเม็ด", 1½ "หนึ่งเม็ดครึ่ง" · ก่อน/หลังอาหารใช้ mapping เดียวกับเว็บ · ชื่อยา: tts_name ถ้ามี ไม่งั้น name · แบ่งท่อน ≤ 150 ตัวอักษร ตัดที่ขอบประโยค/รายการ
- **B3** `core/tts/tts.service.ts`: signals supported/thaiVoices/selectedVoice/speaking; getVoices + voiceschanged (iOS ลองซ้ำช่วงสั้น); speak(chunks) cancel() ก่อน, lang th-TH; **iOS เรียก speak synchronous ใน click handler ห้าม await ก่อน**; หยุดเมื่อกดซ้ำ/เปลี่ยน route/visibilitychange; ตั้งค่าต่ออุปกรณ์ใน localStorage (try/catch): เสียง + ความเร็ว ช้า 0.8 (ค่าเริ่มต้น) / ปกติ 1.0
- **B4** ปุ่ม 🔊 component กลางตัวเดียว (scss ของตัวเอง ≥ 48px, aria-label, "กำลังอ่าน" กดอีกครั้งหยุด): Today ปุ่มใหญ่ "ฟังยาที่ต้องกินวันนี้" (เฉพาะมื้อที่ยังไม่กิน; ครบแล้วพูด "วันนี้กินยาครบแล้วค่ะ เก่งมากเลยนะคะ") + ปุ่มเล็กต่อมื้อ (บอกสถานะ "กินแล้ว") · หน้าสรุป "อ่านสรุปให้ฟัง" · ไม่ใส่ Scan/Review · ไม่มีเสียงไทย → ซ่อนปุ่มทั้งหมด + Settings อธิบายวิธีเพิ่มเสียง (Android: Speech Services by Google, Windows: ตั้งค่าเวลาและภาษา → เสียงพูด)
- **B5** Settings "เสียงอ่าน": เลือกเสียง (ถ้า >1), ความเร็ว, ปุ่ม "ทดลองฟัง" ("สวัสดีค่ะ น้องยาตรงเองค่ะ")
- **B6** migration `medications.tts_name VARCHAR(100) NULL` + db/init; API ยารับ/คืน tts_name (trim, ว่าง→null, >100 → 400; พฤติกรรมเดิมไม่เปลี่ยน); ฟอร์มยามีช่อง "ชื่อที่ให้อ่านออกเสียง (ไม่บังคับ)" ตัวอย่าง "ยาความดัน" + ปุ่ม 🔊 ทดลองฟัง; ไม่แสดง tts_name ใน LINE/Web Push

### 8C: เก็บงาน PWA
- **C1** manifest: name "ยาตรง", short_name, lang th, id, start_url, scope, display standalone, theme_color #0f766e, background_color; ไอคอน 192/512 + maskable (หน้าน้องยาตรงบนพื้นเขียวแบบรูป OA) สร้างด้วย sharp แบบ make-line-mascot.mjs; shortcuts "ยาวันนี้" "สแกนซองยา"; iOS apple-touch-icon + meta standalone; ตรวจ installability ด้วย DevTools → Application → Manifest
- **C2** SW/ออฟไลน์: **ห้ามใส่ /api ใน dataGroups ของ ngsw** (cache key = URL ไม่แยก JWT → ข้อมูลข้ามผู้ใช้) + เทสตรวจ ngsw.json · ฟอนต์: ตรวจแหล่งโหลด ถ้า CDN เสนอ self-host (@fontsource เฉพาะ weight ที่ใช้ thai+latin) cache lazy · snapshot Today + สรุป 7 วันใน localStorage key ตาม user id + เวลาเก็บ, เฉพาะฟิลด์ที่ใช้ (ไม่มี ocr_text/รูป), ล้างเมื่อ logout/401, เทส A logout → B login ไม่เห็นของ A · UX ออฟไลน์: แถบ "ออฟไลน์อยู่ · ข้อมูลล่าสุดเมื่อ 20:15 น." (online/offline event + request ล้มเหลว), ปุ่ม "กินแล้ว"/ที่ต้องใช้เน็ตกดไม่ได้ "ต่ออินเทอร์เน็ตก่อนนะคะ", **ไม่ทำคิวบันทึกออฟไลน์**, กลับออนไลน์แล้วรีเฟรชเอง · อัปเดต: SwUpdate VERSION_READY → snackbar "มีเวอร์ชันใหม่ แตะเพื่ออัปเดต" → activateUpdate + reload + จัดการ unrecoverable · **ห้ามทำ Web Push เดิมเสีย** ทดสอบ push + notificationclick + `/today#take=<token>` ซ้ำ
- **C3** install prompt: Android/Chrome เก็บ beforeinstallprompt แสดงการ์ด "ติดตั้งยาตรงไว้บนหน้าจอ" ใน Settings และ Today ครั้งเดียวหลัง login ปิดแล้วไม่แสดง 14 วัน · iPhone Safari ยังไม่ได้เพิ่ม: การ์ดสอน "แตะปุ่มแชร์ → เพิ่มไปยังหน้าจอโฮม" + เหตุผล "ต้องเพิ่มก่อนถึงจะได้รับการแจ้งเตือน" · ซ่อนเมื่อ standalone / appinstalled / Capacitor · logic ตรวจแพลตฟอร์มเป็น pure function + unit test
- **C4** README: SW ทำงานเฉพาะ HTTPS (ngrok)/localhost, http LAN :8080 ไม่มี SW · ngrok ฟรี: ตรวจว่า ngsw.json ผ่าน ngrok ไม่ได้หน้าเตือน HTML แล้วรายงาน

### เทส
- unit (node --test): stats-service (rate, null เมื่อ due=0, streak ข้ามวันไม่มียา, ป้ายวันไทย, จัดกลุ่ม), Flex สรุป (altText, ไม่มีชื่อยาในเวอร์ชันผู้ดูแล)
- `scripts/test-day8.sh`: seed ผู้ใช้ทดสอบ dose 7 วันที่รู้คำตอบ เทียบทุกตัวเลขตรงตัว · PRN ไม่นับ, upcoming ไม่นับ, วันไม่มียา null · ขอบเที่ยงคืน clock.sh (23:30 vs 00:30 คนละวัน) · 401/400/ผู้ใช้ B ไม่เห็นของ A · LINE "สรุป" 4 กรณี (fake-line มีแต่ reply ไม่มี push) · migration tts_name รันซ้ำได้ + SHOW COLUMNS ตรง init · API ยารับ/คืน tts_name · ngsw.json ไม่มี /api, manifest 200
- ng test: speech-text, TtsService (mock; ไม่มีเสียงไทย → ซ่อนปุ่ม), offline snapshot, install prompt logic
- ng build production ไม่มี budget warning
- เพิ่ม day8 เข้า test-all.sh เทสเดิมต้องผ่านทุกชุด ห้ามลบ/ข้าม; รายงานต้องยืนยันว่ารัน "หลังแก้" จริง

### ตอนจบแต่ละช่วง
- อัปเดต CLAUDE.md, README (Dashboard, TTS, PWA) · demo-check.sh เพิ่ม: stats ไม่มี JWT → 401, manifest + ngsw.json 200, ngsw ไม่มี /api
- รายงาน: ตารางเทส, ไฟล์ที่เปลี่ยน, ขนาด bundle ก่อน/หลัง
- ตอนจบ 8C: checklist ภาษาไทยให้คาเด็ททดสอบมือถือจริง (1 Android ติดตั้ง/shortcuts · 2 iPhone เพิ่มหน้าจอโฮม + แจ้งเตือน · 3 โหมดเครื่องบิน · 4 🔊 บน Today/สรุป ทั้ง iPhone/Android + ความเร็ว + tts_name · 5 พิมพ์ "สรุป" ใน LINE ผู้ป่วย/ผู้ดูแล · 6 deploy ใหม่เห็น snackbar)

### คำถามที่ต้องตอบในส่วนที่ 2
1 scheduled_date คำนวณอย่างไร ตรงวันไทยไหม · 2 หยุดยาทำอะไรกับ dose อนาคต · 3 doses เก็บ PRN ไหม · 4 โครงเมนูปัจจุบัน + ตำแหน่งหน้าสรุป · 5 ฟอนต์โหลดจากไหน ขนาด self-host · 6 ngsw-config ปัจจุบัน/มี dataGroups /api ไหม · 7 สาเหตุ today.page.scss เกินงบ + วิธีลด · 8 มีฟิลด์ไทยแทน tts_name ไหม · 9 ขนาด px ทุกส่วนหน้าสรุปที่ 375px

---

## ส่วนที่ 2 — แผน (สำรวจโค้ดเมื่อ 12 ต.ค. 2026)

### 2.1 คำตอบ 9 ข้อ

1. **scheduled_date** = generated column `DATE(scheduled_at)` STORED (`01_schema.sql` dose_logs). `scheduled_at` เป็น DATETIME ที่เก็บเวลาไทยอยู่แล้ว (MySQL session +07:00, TZ Asia/Bangkok) → **ตรงวันไทยแน่** ใช้ `CURDATE()` เป็น "วันนี้" ได้ (ตัวเดียวกับหน้า Today). ขอบเที่ยงคืน 23:30 → วันเดิม, 00:30 → วันถัดไป (เทสด้วย clock.sh)
2. **หยุดยา** (`medication-service.stop`): `is_active=0, end_date=CURDATE()` และ **DELETE dose ที่ pending ทั้งหมด** (ทั้งเลยเวลาและอนาคต) คง taken/missed. ผลต่อสถิติ: dose ที่ pending ตอนหยุดถูกลบ จึง **ไม่นับเป็น due/missed**; taken/missed ก่อนหยุดยังนับตามจริง → query สถิติ **ต้องไม่กรอง `is_active`** (ไม่งั้นประวัติยาที่หยุดแล้วหาย); `by_medication` ใส่ `is_active` ให้เว็บติดป้าย "หยุดใช้แล้ว"
3. **PRN ไม่มีบันทึกใน dose_logs** (ไม่สร้างรอบ) → **ไม่ทำ `prn_taken`**. query ยัง `JOIN medications … m.as_needed = 0` กันข้อมูลเก่า
4. **เมนูปัจจุบัน:** bottom nav 5 ช่อง `วันนี้ · ยาของฉัน · [สแกน] · ภาพรวม · ตั้งค่า` (sidebar ≥1024px ชุดเดียวกัน; `shell.component.ts` left/right). มี route `/overview` (ไอคอน chart) เป็น placeholder อยู่แล้ว → **เสนอใช้ `/overview` เป็นหน้าสรุป 7 วัน** เปลี่ยนป้ายเป็น "สรุป" ไม่เพิ่มช่องเมนู; ปุ่มใน LINE → `PUBLIC_BASE_URL/overview`
5. **ฟอนต์ self-host อยู่แล้ว:** `@fontsource/mitr` (500, 600) + `@fontsource/noto-sans-thai-looped` (400/500/600/700) ผ่าน `angular.json` → woff2 อยู่ใน bundle, ขนาด latin+thai ทุก weight ≈ **160 KB** (Mitr ~73, Noto ~90); `ngsw` group `assets` (lazy) ครอบ woff2 → ออฟไลน์ได้เมื่อเคยโหลด. **ที่ยังพึ่ง CDN:** `index.html` บรรทัด 13 `fonts.googleapis.com/icon?family=Material+Icons` → ตรวจว่าใช้ `mat-icon` จริงไหม ถ้าไม่ใช้ลบ ถ้าใช้ self-host (`@fontsource/material-icons`) — สำคัญต่อ APK/ออฟไลน์วันที่ 9
6. **ngsw-config.json:** `assetGroups` 2 กลุ่ม — `app` (prefetch: favicon, index.html, manifest, `/*.css`, `/*.js`) และ `assets` (lazy, updateMode prefetch: svg/png/jpg/webp/ฟอนต์). **ไม่มี `dataGroups` → ไม่มี /api อยู่แล้ว**; 8C เพิ่มเทสกันไม่ให้ใครใส่ภายหลัง. SW ลงทะเบียน `registerWhenStable:30000`, `enabled: !isDevMode()`
7. **today.page.scss เกินงบ:** ไฟล์ 5.6 KB รวมสไตล์ 6 ก้อนที่ไม่เกี่ยวกัน (head/ชื่อ, **progress+say+next ~1.7 KB**, slot, prn, empty/skeleton, `.low-tag`, media 2 คอลัมน์). **วิธีลด (ไม่แตะ budget):** ย้ายก้อน `progress + say + next*` เป็น `today-progress.component` (ย้าย template ตรงเดิม DOM/คลาสเดิม); ถ้ายังไม่พอ ย้าย `.low-tag` ไป `_components.scss` เป็นคลาสกลาง. ตรวจ: `ng build` ไม่มี warning + เทียบภาพ `tools/shots.mjs today` ที่ 375/412 ก่อน–หลัง (pixel diff)
8. **ไม่มีฟิลด์ไทยแทน `tts_name`:** `medications` มี `name`, `indication` ("ลดความดัน" = ข้อบ่งใช้ ไม่ใช่ชื่อ) → ใช้ `tts_name` ตามสเปก, ไม่ตั้ง = อ่าน `name`. `users.tts_rate` (0.90) มีใน schema แต่ไม่มีโค้ดใช้ → ไม่แตะ (ความเร็วเก็บ localStorage ต่ออุปกรณ์ตามสเปก)
9. **ขนาด px ที่ 375px:** ดู 2.4

### 2.2 8A backend

SQL หลักครั้งเดียว ช่วง `from..to` (`to = CURDATE()`, `from = to − (days−1)`):
```sql
SELECT d.scheduled_date AS date, d.slot, d.medication_id, d.source,
  SUM(d.status='taken') taken, SUM(d.status='missed') missed,
  SUM(d.status='pending' AND d.scheduled_at <= NOW()) pending_due,
  SUM(d.status='pending' AND d.scheduled_at >  NOW()) upcoming
FROM dose_logs d JOIN medications m ON m.id = d.medication_id
WHERE d.user_id = ? AND m.as_needed = 0 AND d.scheduled_date BETWEEN ? AND ?
GROUP BY d.scheduled_date, d.slot, d.medication_id, d.source
```
ผลย่อยแล้ว (≤ 30×4×N×4 แถว) → pure function รวมเป็น days / by_meal / by_medication / by_source. Query เล็ก 2 ตัว: ชื่อ/ความแรง/is_active ของยา, และ taken/due ต่อวันย้อน 60 วันสำหรับ streak (`idx_dose_user_time`).
- `rate = Math.round(taken*100/due)` ฟังก์ชันเดียวทุกระดับ; overall จากผลรวม ไม่ใช่เฉลี่ย rate รายวัน
- `label_th`, `is_today` คำนวณฝั่ง server เท่านั้น (เว็บไม่คำนวณวันเอง กัน "วันนี้" เพี้ยน)
- `by_source` นับเฉพาะ taken; API คืน `app, line, caregiver` + `push` แยก (เว็บรวม push เข้า "กดในแอป")
- flows tab 5-Dashboard: group `GET /api/stats/adherence` (ฟ้า) → verify-jwt → function ตรวจ days (400) → function เรียก `statsService.adherence(db, userId, days)` → http response; group catch→500. global `statsService` ใน settings.js. แก้ flows.json หลัง `docker compose stop nodered`
- user_id มาจาก `msg.user.id` เท่านั้น; ไม่ log userId/ชื่อยา

### 2.3 LINE "สรุป"
- `line-service.js` เพิ่มคำสั่ง `สรุป` (และ `สรุป 7 วัน`) ข้างคำสั่ง "วันนี้"; เรียก `statsService.adherence(db, patientId, 7)` ตัวเดียวกับเว็บ → ตัวเลขตรงกันโดยโครงสร้าง
- `line-messages.js`: `buildAdherence` (ผู้ป่วย) และ `buildCaregiverAdherence` (ชื่อ + rate ไม่มีชื่อยา); `line-flex.js` เพิ่ม `dayDots(days)` แถว 7 วัน: ✓ ครบ / ✕ ไม่ครบ / – ไม่มียา / ● วันนี้ + ป้ายวันย่อใต้ (ไม่พึ่งสี)
- ข้อความระดับ (100/80–99/50–79/<50/null) อยู่ในโมดูล pure เดียวฝั่ง node (`adherence-level.js`) และฝั่ง TS (`adherence-level.ts`) + test เทียบตารางเดียวกัน
- สองบทบาท = [ของตัวเอง, ผู้ดูแล] ≤ 5 ข้อความ; ยังไม่เชื่อม = ข้อความวิธีเชื่อมเดิม; rate=null → "ยังไม่มีข้อมูลยาในช่วงนี้ค่ะ"
- quick reply เพิ่ม "📊 สรุป" (ผู้ป่วยและผู้ดูแล), help เพิ่มบรรทัด "พิมพ์ 'สรุป' …"; ไม่แตะ rich menu
- ต้องปรับเทสที่ match ข้อความ help/quick reply (`line-messages.test.js`, `test-day6*.sh`, `test-day7a.sh`) แล้วรันหลังแก้

### 2.4 หน้าสรุป — ขนาดที่ 375px (ขอบหน้า 16px → เนื้อหากว้าง 343px; html 18px)
| ส่วน | ขนาด |
|---|---|
| หัวข้อหน้า | Mitr 600 `--yt-text-title` ≈ 32px |
| การ์ดหลัก | padding 16, radius 20; วงแหวน SVG **144×144** เส้น 14; ตัวเลขกลาง `.num` **44px** + "%" 22px; มาสคอต **96×96**; ข้อความระดับ Mitr 500 **20px/1.6** เต็มกว้างใต้แถว; ช่องว่าง 12 |
| ชิป streak | สูง **48**, padding 0 16, ข้อความ 18px/600 + ไอคอน 24, ห่างการ์ด 12 |
| กราฟแท่ง | ไม่มี padding ข้าง → 7 คอลัมน์ × **49px** (=343) แต่ละคอลัมน์เป็นปุ่ม แตะได้ 49×~232px. บนลงล่าง: เลข rate **18px** ตัวหนา สูง 28 (ไม่ใส่ "%" เพราะ "100%" ที่ 18px ≈ 44px ชนข้าง; คำอธิบาย "ตัวเลข = % ที่กินครบ" 18px ใต้หัวข้อกราฟ) · พื้นที่แท่งสูงสุด **150** (100%=150, ขั้นต่ำ 8 เมื่อ 0) กว้างแท่ง **32** มุมบน 8 · ป้ายวัน 2 บรรทัด "จ." / "12" 18px สูงรวม 60 · เส้น 100% ประ 1px. **แท่งวันนี้:** ลายเฉียง + กรอบ 3px + ป้าย "วันนี้" แทน "จ."; **วันไม่มียา:** ไม่วาดแท่ง ใส่ "–" + เส้นฐานประ; 100% มี ✓ 18px, <50% มีไอคอน ! → สื่อความหมายด้วยไอคอน+ตัวเลข สีเป็นแค่เสริม (≥80 primary, 50–79 warning, <50 danger) |
| แผงรายละเอียดวันที่เลือก | padding 12×16, min-height 72, 18px/1.7 "จ. 12 ต.ค. · กินแล้ว 3 · ลืม 1 · ยังไม่กิน 0 · ยังไม่ถึงเวลา 1", เริ่มที่วันนี้, `aria-live=polite` |
| ข้อสังเกตมื้อ | ไอคอน 24 + ข้อความ 18px, padding 12×16 |
| รายการต่อยา | แถว ≥ 72: ชื่อ Mitr 20px, ความแรง 18px muted, แถบ **12px** pill, "กิน 6 จาก 7 ครั้ง" 18px + rate `.num` 20px ชิดขวา, ป้าย "หยุดใช้แล้ว" 18px |
| ช่องทาง | ชิปสูง 48, ข้อความ 18px, ตัดบรรทัดได้ |
| ปุ่ม "อ่านสรุปให้ฟัง" | สูง 56 เต็มกว้าง |
| disclaimer | 16px muted contrast ≥ 4.5:1 |
| ช่องว่างระหว่างการ์ด | 16 (`--yt-space-4`), ล่างเว้น `--yt-bottom-clearance` |
- ที่ ก++ 125%: คอลัมน์ 49px คงที่ ตัวเลข 22.5px ("100" ≈ 37px) ยังพอ; ป้าย "วันนี้" ล้นจึงใช้จุด ● + ตัดบรรทัดได้ (ตรวจด้วย `shots.mjs --scale=125` ที่ 375/768/1440)
- ≥ 768px: การ์ดหลักกับกราฟ 2 คอลัมน์ (container query แบบหน้า Review) แท่งสูงสุด 200
- ไฟล์ใหม่: `core/api/stats.api.ts`; `features/overview/{overview.page, adherence-chart, adherence-hero, med-breakdown, adherence-level.ts}`; `features/today/{today-progress, adherence-card}.component` (การ์ดเล็กซ่อนเมื่อ rate=null, error แล้วเงียบ)

### 2.5 8B TTS
- `core/tts/{speech-text.ts, tts.service.ts}`, `shared/components/tts-button/` (ตัวเดียว รับ input เป็นฟังก์ชันสร้างท่อนข้อความ เรียกภายใน click handler แบบ synchronous ตามข้อบังคับ iOS)
- ใช้คีย์ enum เดียวกับ `labels.ts` (`SLOT_LABEL`, `MEAL_LABEL`, `UNIT_LABEL`) แต่ตารางคำพูดแยก (สะกดให้ออกเสียงถูก) + unit test บังคับว่าครอบทุกค่า enum
- ปริมาณอ่านเป็นคำ (หนึ่งเม็ดครึ่ง); ปริมาณแปลก/ใหญ่ fallback เลขดิบ
- getVoices ลองซ้ำ ~10×250ms; normalize `th_TH`→`th-TH`; ไม่มีเสียงไทย → ซ่อนปุ่ม + การ์ดคำอธิบายใน Settings
- `localStorage['yatung_tts']` = `{voiceURI, rate}` (try/catch); เปลี่ยน route (NavigationStart) และ visibilitychange hidden → cancel(); service ไม่มี API พูดอัตโนมัติ (+ test)
- migration `006_tts_name.sql` (stored procedure เช็ก information_schema, ADD COLUMN หลัง `name`) + `01_schema.sql`; `medication-service`/`validate-medication.js` (trim, ''→null, >100 → 400, PUT ไม่ส่ง = คงเดิม); `MED_SELECT` คืน `tts_name`; แก้ `FIELD_BY_MESSAGE` และ `fieldFromMessage` ตามข้อความ error ใหม่; `app-med-fields` เพิ่มช่อง + ปุ่ม 🔊 ทดลองฟัง
- ไอคอนใหม่ `volume`/`stop` ใน `icon.component.ts`

### 2.6 8C PWA
- manifest ปัจจุบัน: มี name/short_name/lang/display/scope/start_url/theme/background + ไอคอน any 72–512 + maskable 192/512; **ขาด** `id`, `shortcuts`, `description`. ตรวจภาพ maskable ว่าเป็นหน้าน้องยาตรงบนเขียวใน safe zone 80% ไหม ถ้าไม่ใช่ทำ `tools/make-pwa-icons.mjs`
- `index.html` มี apple-touch-icon; เพิ่ม `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-title`, status-bar-style
- ngsw: คง `dataGroups` ว่าง (ไม่มี); ไม่แก้ `ngsw-worker.js` ของ Angular; ทดสอบ push + notificationclick + `/today#take=` ซ้ำ
- `core/offline/snapshot.service.ts`: key `yatung_snap:<userId>:today|adherence` = `{savedAt, data}` ผ่านฟังก์ชัน whitelist (`pick*`); ล้างทุก key `yatung_snap:` ตอน logout และ 401 (interceptor); อ่านเมื่อ status 0 หรือ `navigator.onLine=false`
- `OnlineService` (signal) + `offline-bar` ใน shell (`role=status`), ปุ่ม "กินแล้ว" `disabled` + `aria-disabled` + ข้อความที่มองเห็น "ต่ออินเทอร์เน็ตก่อนนะคะ"; ออนไลน์กลับ → รีเฟรช Today/Overview
- `UpdateService`: VERSION_READY + unrecoverable → snackbar ปุ่ม ≥ 56px (ไม่ reload เอง ต้องกดก่อน)
- `core/pwa/install.ts` pure `installMode({ua, standalone, capacitor, hasPrompt, dismissedAt, now}) → 'native' | 'ios-guide' | null`; `InstallService`; `install-card.component` ใน Settings + Today (ครั้งเดียวหลัง login); ปิดแล้วซ่อน 14 วัน
- README: SW ใช้ได้เฉพาะ HTTPS/localhost; ngrok ฟรี: ตรวจ `ngsw.json` ผ่าน tunnel ด้วย UA แบบเบราว์เซอร์ว่าได้ JSON หรือหน้า Visit Site แล้วรายงาน (`demo-check.sh` ข้อ 8 มีพื้นฐานอยู่)
- checklist มือถือ: `docs/day8-device-checklist.md`

### 2.7 ไฟล์ที่เปลี่ยน/เพิ่ม
- **8A:** `lib/stats-service.js` (+ `settings.js`), `flows.json` tab 5, `line-service.js`, `line-messages.js`, `line-flex.js`, frontend (`stats.api.ts`, `overview/*`, `today-progress`, `adherence-card`, ป้ายเมนู shell), เทส `stats-service.test.js` / `adherence-flex.test.js` / `scripts/test-day8.sh`, `line-validate.mjs`, `test-all.sh`, `demo-check.sh`, CLAUDE.md, README
- **8B:** `006_tts_name.sql`, `01_schema.sql`, `medication-service.js`, `validate-medication.js`, `core/tts/*`, `tts-button`, `med-fields`, `settings/tts-section`, today/overview, `icon.component.ts`
- **8C:** `manifest.webmanifest`, `index.html`, `ngsw-config.json`, `core/{offline,pwa}/*`, shell, `auth.interceptor`, README, checklist

### 2.8 ลำดับ commit / เทส
- commit: (1) A0 scss ล้วน (2) 8A backend+LINE (3) 8A frontend (4) 8B (5) 8C; ก่อนแต่ละ commit รัน `node --test`, `ng test --watch=false`, `ng build` (budget warning = 0), `check-secrets`
- บันทึก bundle baseline ก่อนเริ่ม แล้วรายงานหลังแต่ละช่วง
- **ผมจะถามก่อนรัน `test-day8.sh` / `test-all.sh` ทุกครั้ง** (recreate nodered); ยังไม่ได้รันอะไรเลย

### 2.9 ความเสี่ยง
- dose เมื่อวานที่ค้าง pending ก่อน cron 03:00 ปิดเป็น missed → นับเป็น `pending_due` (rate เท่า missed) แต่ข้อความแสดง "ยังไม่กิน" ไม่ใช่ "ลืม"
- เครื่องที่ติดตั้งเวอร์ชันเก่าไม่มี snackbar ในครั้งแรกที่อัปเดต (ปกติ)

## ส่วนที่ 3 — คำตอบที่ตัดสินแล้ว (12 ต.ค. 2026)

ลำดับความสำคัญ: ส่วนที่ 3 → ส่วนที่ 2 → ส่วนที่ 1

1. **เวลา "ตอนนี้"/"วันนี้":** ห้ามใช้ CURDATE()/NOW() ในคิวรีสถิติ — `stats-service` รับ `now` (Date) จาก JS คำนวณ today/from/to เป็น Asia/Bangkok แล้วส่งเข้า SQL เป็นพารามิเตอร์. ถ้าโค้ดเดิมใช้ NOW() ใน SQL ให้รายงานแต่ไม่แก้. เทสขอบเที่ยงคืนรันผ่าน clock.sh จริง
2. ยาหยุดใช้: ห้ามกรอง is_active; `by_medication` มี `is_active` เว็บต่อท้ายชื่อ "(หยุดใช้แล้ว)"; เรียง rate น้อย→มาก, rate null ท้ายสุด
3. dose เมื่อวานค้าง pending = `pending_due` แสดง "ยังไม่กิน"
4. `by_source` API คืน app, push, line, caregiver (ไม่มี = 0); เว็บ/LINE แสดง 3 กลุ่ม "แอป" (app+push), "LINE", "ญาติยืนยัน"; source ไม่รู้จัก นับใน API (`other`) ไม่แสดง ไม่ error
5. ตัด `prn_taken`; TTS ไม่พูด indication
6. ใช้ `/overview` ป้ายเมนู "สรุป"; Review ไม่แสดง tts_name; ฟอร์มเพิ่ม/แก้ยามีช่อง tts_name
7. `users.tts_rate` ไม่แตะ (ความเร็วเสียงใน localStorage ต่ออุปกรณ์) — เขียนไว้ใน CLAUDE.md ว่ามีแต่ยังไม่ได้ใช้
8. Material Icons: ตรวจก่อน ไม่ใช้ = ลบ ใช้ = self-host; หลังวันที่ 8 แอปต้องไม่โหลดอะไรจาก CDN ภายนอก (ตรวจ index.html, styles, angular.json รายงาน) — ทำใน 8C
9. manifest `background_color` โทนมิ้นต์อ่อนจาก token ที่มี (ห้ามสีใหม่); แนบภาพ splash หรือรายงานค่าสีใน 8C
10. ป้าย "วันนี้" ที่ ก++: จุด ● + ตัดบรรทัดได้; แถวป้ายใต้แท่ง min-height คงที่; ตรวจ 375px ที่ ก, ก+, ก++
11. today.page.scss: แยก progress, say, next เป็น component ใหม่; แนบผลเทียบภาพก่อน/หลัง 375 และ 412px ในรายงาน 8A; ไม่มี budget warning
12. ngsw.json ไม่มี /api — มีเทสใน test-day8.sh

กติกา: ทำ 8A → รายงาน → commit → หยุดรอรีวิวก่อน 8B; ถามก่อนรัน test-day8.sh / test-all.sh / push / เปิด PR; หยุด nodered ก่อนแก้ flows.json

## งานเพิ่มสำหรับ 8C (จากรีวิว 8A ของชีฟ — ยังไม่ทำจนถึง 8C)

- `demo-check.sh` เพิ่มหัวข้อ **"เวลาฐานข้อมูล"**: แสดง `@@global.time_zone` และ `@@session.time_zone` (ของ connection ที่แอปใช้ = pool ของ `lib/db.js`) แล้วเทียบ `NOW()` ของ MySQL กับเวลาไทยจาก JS ถ้าต่างกันเกิน 2 นาที ขึ้น ❌ พร้อมข้อความว่า "คิวรีเดิมที่ใช้ NOW() จะนับผิดวัน"
- **ห้ามแก้คิวรี `NOW()`/`CURDATE()` เดิม (~50 จุด) ในวันที่ 8**
- (เสนอ ยังไม่ทำ) หน้าสรุป: แถวป้ายใต้แท่งใช้ตัวจองที่ (placeholder `visibility:hidden` ของบรรทัด "วันนี้" ในทุกคอลัมน์) แทน `min-height: 6.2rem` เพื่อให้สูงเท่ากันโดยโครงสร้างและขยายตามขนาดตัวอักษรเอง
