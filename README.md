# YaTung (ยาตรง)

เว็บแอปแปลงซองยาเป็นตารางกินยา พร้อมแจ้งเตือนผ่าน LINE
Angular + Ionic (หน้า Scan) · Node-RED · MySQL · Docker · PWA · Capacitor

> ไม่ใช่คำแนะนำทางการแพทย์ · รองรับเฉพาะซองยาที่พิมพ์ด้วยเครื่อง

## เริ่มต้น (วันที่ 1)

### 1. สร้าง Angular project แล้ววางไฟล์ starter ทับ

ไฟล์ใน `frontend/` ของ starter นี้ยังไม่ใช่ Angular project เต็มรูปแบบ ต้องสร้าง project ก่อน

```cmd
REM ต้องใช้ Node 22.22.3+ ถ้าจะใช้ Angular CLI เวอร์ชันล่าสุด (22.x)
REM ถ้า Node เก่ากว่า ให้ใช้ @angular/cli@21 (ไฟล์ starter ทดสอบ build ผ่านกับ Angular 21 + Ionic 9)
ren frontend frontend-starter
npx @angular/cli@21 new frontend --routing --style=scss --skip-git --ssr=false
xcopy frontend-starter\* frontend\ /E /I /H /Y
rmdir /S /Q frontend-starter

cd frontend
npm i @ionic/angular ionicons @capacitor/core @capacitor/camera @ionic/pwa-elements
npm i -D @capacitor/cli
npx ng add @angular/pwa
```

ใน `angular.json` ให้ทำ 2 อย่าง

- `serve.options` เพิ่ม `"proxyConfig": "proxy.conf.json"` เพื่อให้ `ng serve` เรียก `/api` ไป Node-RED ได้
- `budgets` ปรับ initial `maximumWarning` เป็น `"1MB"` เพราะ Ionic core ทำให้ bundle เกิน 500 kB

> **Ionic 9:** standalone components import จาก `@ionic/angular` โดยตรง
> (ตัวอย่างบนเว็บที่ใช้ `@ionic/angular/standalone` เป็นของ Ionic 7–8)

### 2. รันทั้งระบบ

```cmd
copy .env.example .env
docker compose up -d --build
```

| URL | |
|---|---|
| http://localhost:8080 | เว็บแอป |
| http://127.0.0.1:1880 | Node-RED editor (ผูกเฉพาะเครื่องนี้; user `admin` — **เปลี่ยนรหัสผ่านก่อนเปิด tunnel**) |
| http://127.0.0.1:8081 | Adminer (`docker compose --profile dev up -d`) |

บัญชีเดโม: `demo@yatung.app` / `demo1234` (มีข้อมูลกินยาย้อนหลัง 7 วัน และ Metformin ที่ใกล้หมด)

> Linux: ถ้า Node-RED เขียนไฟล์ใน `node-red/data` ไม่ได้ ให้รัน `sudo chown -R 1000:1000 node-red/data`

### LINE + ngrok (วันที่ 6)

LINE Messaging API ส่ง webhook เข้ามาที่ `https://<NGROK_DOMAIN>/line/webhook` — ใช้ ngrok (โดเมนคงที่ฟรี 1 โดเมน) เป็น tunnel แทน cloudflared

1. สมัคร ngrok → copy authtoken และจองโดเมนคงที่ (Domains) แล้วใส่ใน `.env`: `NGROK_AUTHTOKEN`, `NGROK_DOMAIN` (เช่น `xxx.ngrok-free.dev`); `PUBLIC_BASE_URL=https://${NGROK_DOMAIN}`
2. ใส่ `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_OA_BASIC_ID` (เช่น `@014rktvr`) ใน `.env`
3. `docker compose --profile tunnel up -d` (inspector ดู request ที่ http://127.0.0.1:4040)
4. ตั้ง Webhook URL เป็น `https://<NGROK_DOMAIN>/line/webhook` ใน LINE Developers Console → กด Verify → เปิด Use webhook
   (ขั้นตอนเต็มพร้อมทดลองส่งเตือน/กดปุ่ม: [`docs/line-console-checklist.md`](docs/line-console-checklist.md))

> **ngrok แพ็กเกจฟรีแสดงหน้าเตือน "You are about to visit …" เมื่อเปิดลิงก์ด้วยเบราว์เซอร์** — ครั้งแรกที่เปิด `https://<NGROK_DOMAIN>` (รวมปุ่ม "เปิดแอป" ในข้อความ LINE) ต้องกด **Visit Site** หนึ่งครั้ง (เบราว์เซอร์จำไว้ชั่วคราว) ·
> คำขอที่ไม่ใช่เบราว์เซอร์ (LINE ส่ง webhook, LINE โหลดรูปน้องยาตรง) ไม่เจอหน้านี้ — `demo-check.sh` เช็กรูปด้วย User-Agent ที่ไม่ใช่เบราว์เซอร์ ถ้าได้ HTML แทน PNG ให้ย้ายรูปไปโฮสต์อื่นแล้วตั้ง `LINE_MASCOT_URL`
> image ของ tunnel คือ `ngrok/ngrok:3.39.11-alpine` (tag `3.39.11` เปล่าไม่มีอยู่จริง)

> **แก้ frontend แล้วหน้าเว็บใน container ไม่เปลี่ยน** จนกว่าจะ build ใหม่: `docker compose up -d --build frontend` (`demo-check.sh` เตือนถ้า image เก่ากว่าไฟล์ที่แก้ล่าสุดใน `frontend/`)

> **ลำดับตัวแปรใน `.env` สำคัญ:** Compose แทนค่า `${NGROK_DOMAIN}` จากตัวแปรที่ประกาศ "ก่อนหน้า" เท่านั้น — `PUBLIC_BASE_URL=https://${NGROK_DOMAIN}` ต้องอยู่หลัง `NGROK_DOMAIN=` (ไม่งั้นได้ `https://` เปล่าๆ; `demo-check.sh` ตรวจให้)

ความปลอดภัย: nginx ส่งต่อ **เฉพาะ `/api/*` และ `/line/webhook`** — editor/admin API ของ Node-RED (`/flows`, `/red`, `/settings`, …) เข้าผ่าน tunnel ไม่ได้ (มีเทสใน `scripts/test-day6.sh`) ·
พอร์ต 1880/3306/8081/4040 ผูกที่ `127.0.0.1` ส่วน 8080 เปิดให้ LAN · **ห้ามเปิด tunnel ถ้ายังไม่ได้เปลี่ยน `NODE_RED_ADMIN_HASH`** (ค่าตัวอย่างคือรหัส `demo1234`)

เชื่อมบัญชี: หน้า "ตั้งค่า" → "เชื่อม LINE" → กด "รับรหัสเชื่อม LINE" (เลข 6 หลัก หมดอายุ 10 นาที ใช้ได้ครั้งเดียว) → กด "เปิด LINE แล้วกดส่ง" (หรือสแกน QR) · ญาติเชื่อมด้วยรหัสของตัวเองจากปุ่ม "ส่งรหัสให้ญาติ"
· ใน LINE พิมพ์ "วันนี้" เพื่อดูยาของวันนี้ (ใช้ reply จึงไม่เสียโควตา push)

**แจ้งเตือนกินยา (6B):** cron ทุก 1 นาที (tab 7-LINE) ส่ง Flex "ถึงเวลากินยามื้อ…" 1 ข้อความต่อมื้อ (ยาทุกตัวของมื้อนั้นรวมกัน) พร้อมปุ่ม **✓ กินแล้ว** (บันทึกเหมือนปุ่มในแอป, source = line, หักสต็อก, กดซ้ำไม่หักซ้ำ) และปุ่ม "เปิดแอป" ·
รูปน้องยาตรงในข้อความ = `LINE_ASSET_BASE` (ว่าง = `${PUBLIC_BASE_URL}/line` ไฟล์ `mascot-bell|cheer|hello.png` สร้างด้วย `cd frontend && node tools/make-line-mascot.mjs`; `LINE_MASCOT_URL` เดิมยังใช้เป็นท่ากระดิ่งได้) ·
โหมดเดโม (`DEMO_MODE=true`): หน้า "ตั้งค่า" มีปุ่ม "ทดลองส่งเตือนตอนนี้" (`POST /api/demo/remind-now` ส่งกลุ่มรอบยาของวันนี้ที่ใกล้เวลาปัจจุบันที่สุด หัวข้อข้อความเปลี่ยนตามช่วงเวลา ไม่สร้างรอบปลอม) และ inject "ส่งเตือนทดสอบ (demo user)" ใน Node-RED

**editor ของ Node-RED fail closed:** ถ้า `NODE_RED_ADMIN_HASH` ว่างหรือไม่ใช่ bcrypt hash ที่ถูกรูปแบบ editor + admin API จะถูกปิดทั้งหมด (log เตือน ไม่แสดงค่า) แต่ `/api/*` กับ `/line/webhook` ยังทำงาน · สร้าง hash: `docker compose run --rm nodered npx node-red admin hash-pw`

โควตา push: เพดานที่ใช้ = `min(LINE_PUSH_MONTHLY_CAP, โควตาจริงจาก LINE)` · ข้อความเตือนปกติหยุดเมื่อใช้ถึง `เพดาน − LINE_PUSH_RESERVE` ส่วนที่กันไว้ใช้แจ้งญาติ (วันที่ 7)

**ข้อความ LINE ชุดใหม่ (6C):** ข้อความตอบกลับทุกแบบเป็น Flex/ข้อความสั้นน้ำเสียง "ค่ะ/นะคะ" ตัวอักษรใหญ่ ขยายตามขนาดฟอนต์ในแอป LINE (`scaling`) แนบปุ่มลัด (quick reply) ใต้ทุกคำตอบ ·
พิมพ์ **"วันนี้"** = สรุปยาวันนี้ (ความคืบหน้า + สถานะแต่ละมื้อ) · **"วิธีใช้"** / **"ช่วยเหลือ"** · ปุ่ม **✓ กินแล้ว** ตอบกลับเป็นการ์ดชมเชย + มื้อถัดไป ·
**Rich menu** (เมนูค้างด้านล่างแชท: ยาวันนี้ / เปิดแอป / วิธีใช้): `cd frontend && node tools/make-line-richmenu.mjs` สร้างรูป (`docs/line-richmenu/richmenu.png`) แล้ว `node scripts/line-richmenu.mjs` (ตั้งค่าใน LINE ผ่าน API รันซ้ำได้ไม่ซ้อน; `--dry-run` = ตรวจอย่างเดียว) ·
**`#ตัวอย่าง 1` … `#ตัวอย่าง 15`** (เฉพาะ `DEMO_MODE=true`): ให้น้องยาตรงตอบข้อความทุกแบบเพื่อดูหน้าตา (ข้อมูลสมมติ ไม่บันทึกอะไร) · ดู JSON วางใน [Flex Message Simulator](https://developers.line.biz/flex-simulator/) ได้ที่ `docs/line-messages/` (`node scripts/line-export-messages.mjs`) ·
ตรวจข้อความทุกแบบกับ LINE โดยไม่ส่งจริง/ไม่เสียโควตา: `node scripts/line-validate.mjs` · ทดสอบ: `bash scripts/test-day6c.sh`

ทดสอบ 6A/6B (LINE ปลอม ไม่ส่งข้อความจริง): `bash scripts/test-day6.sh` และ `bash scripts/test-day6b.sh` (6B recreate nodered หลายครั้งและเปิด cron จริง 1 รอบ — ถ้ามี dose ของผู้ใช้จริงเข้าเงื่อนไขเตือนอยู่จะข้ามส่วนนั้นเอง) · migration ฐานข้อมูลที่มีข้อมูลอยู่แล้ว: `bash scripts/migrate.sh` (รันซ้ำได้ ไม่ต้อง `down -v`)

**แจ้งญาติเมื่อลืมกินยา (7A):** หน้า "ตั้งค่า" → "ญาติ/ผู้ดูแล" → เพิ่มญาติ ตั้งเวลา "แจ้งเมื่อไม่กดกินยานานเกิน … นาที" (10–720 ค่าเริ่มต้น 60) → "ส่งรหัสให้ญาติ" แล้วให้ญาติส่งเลข 6 หลักในแชท LINE ของน้องยาตรง ·
เมื่อผู้ป่วยยังไม่กินยานานเกินเวลาที่ญาติแต่ละคนตั้งไว้ cron (ทุก 1 นาที) ส่ง Flex หัวเหลืองหาญาติที่เชื่อม LINE แล้ว 1 ข้อความต่อมื้อ (ไม่ส่งย้อนหลังเกิน `escalate_after_min + 60` นาที ระบบล่มแล้วกลับมาจึงไม่ส่งของเก่ารัวๆ) ·
ญาติแตะ **"✓ ยืนยันว่ากินแล้ว"** (บันทึกแทนผู้ป่วย หน้า "วันนี้" ขึ้น "ญาติยืนยันแล้ว") หรือ **"รับทราบ"** · ถ้าผู้ป่วยกินทีหลัง ญาติที่ถูกแจ้งได้ข้อความ "💚 …กินยา…แล้วค่ะ" 1 ครั้ง ·
ใช้โควตา push ส่วนที่กันไว้ (`LINE_PUSH_RESERVE`) · พิมพ์ "วันนี้" ในแชทของญาติ = สรุปยาวันนี้ของผู้ป่วยที่ดูแล · `REMINDER_FOLLOWUP_MIN` (ค่าเริ่มต้น 0 = ปิด) เตือนซ้ำผู้ป่วยเมื่อเลยเวลามาครบกี่นาที ·
cron 03:00 ปิดรอบที่ค้าง `pending` ของวันก่อนๆ เป็น `missed` (กินย้อนหลังได้) · โหมดเดโม: ปุ่ม "ทดลองแจ้งญาติตอนนี้" (`POST /api/demo/escalate-now` ถ้าแจ้งไปแล้วถามก่อนส่งซ้ำ) ·
ทดสอบ: `bash scripts/test-day7a.sh` (LINE ปลอม ไม่ส่งข้อความจริง ไม่แตะผู้ใช้จริง) · checklist ทดสอบกับ LINE จริง: [`docs/line-console-checklist.md`](docs/line-console-checklist.md) หัวข้อ 9

**เตือนยาใกล้หมด (7B):** หน้า "ยาของฉัน"/"วันนี้" ขึ้นป้ายเหลือง และส่ง LINE วันละครั้งหลัง `LOW_STOCK_NOTIFY_AT` (09:00) · ทดสอบ: `bash scripts/test-day7b.sh`

### Web Push — แจ้งเตือนบนเครื่อง (7C)

เตือนกินยาเป็น **notification บนมือถือ/คอม** สำหรับคนที่ไม่ได้เชื่อม LINE (หรือเปิดสวิตช์ "ทั้ง LINE และเครื่อง") — ไม่นับโควตา LINE
ตั้งค่าครั้งเดียวบนเครื่องที่รัน:
```bash
node scripts/gen-vapid.mjs                       # สร้างคู่คีย์ VAPID ลง .env (ไม่เขียนทับของเดิม ; แสดงเฉพาะ public key)
# แก้ VAPID_SUBJECT ใน .env เป็น mailto:<อีเมลของคุณ>  (หรือ https://<NGROK_DOMAIN>)
docker compose up -d --force-recreate nodered
docker compose up -d --build frontend
bash scripts/demo-check.sh                       # หัวข้อ 8) Web Push ต้องผ่าน
```
- ผู้ใช้เปิดที่ **ตั้งค่า → แจ้งเตือนบนเครื่องนี้** (iPhone ต้อง "เพิ่มลงหน้าจอโฮม" ก่อน — หน้าจอมีวิธี ①②③ ให้) · ต้องเปิดผ่าน https (tunnel) ไม่ใช่ `localhost`
- กฎเลือกช่องทาง (ใช้กับเตือนปกติ, เตือนซ้ำ, ยาใกล้หมด; แจ้งญาติใช้ LINE อย่างเดียว): เชื่อม LINE → LINE · ไม่เชื่อมแต่มีเครื่องที่เปิดแจ้งเตือน → Web Push · เปิด "ทั้ง LINE และเครื่อง" → ทั้งสองทาง ·
  โควตา LINE เต็มแต่มีเครื่องที่เปิดแจ้งเตือน → ใช้ Web Push แทน · ทุกช่องทางผ่านการ "จองก่อนส่ง" ตัวเดียวกัน (ไม่ส่งซ้ำ)
- ปุ่ม "✓ กินแล้ว" บนแจ้งเตือน (Android Chrome): เปิด `/today#take=<token>` — token อยู่ใน **fragment** ไม่ใช่ query string เพราะ fragment ไม่ถูกส่งไปเซิร์ฟเวอร์ (ไม่ติด access log ของ nginx / ngrok inspector) และแอปลบออกจาก URL ทันที (`history.replaceState`) ก่อนเรียก API ; แอปที่เปิดค้างอยู่รับผ่าน `hashchange` ด้วย ; ลิงก์เก่า `?take=` ยังรับและลบทันที — แล้วแอปบันทึกให้ (token เซ็นด้วย HMAC ผูกผู้ใช้ + dose, อายุ 12 ชม., ใช้ซ้ำไม่หักยาซ้ำ) · iPhone ไม่แสดงปุ่ม action — แตะแจ้งเตือนเพื่อเปิดหน้า "วันนี้" · payload **ไม่มีชื่อยา** (เห็นบนหน้าจอล็อก)
- **ถ้า iPhone ไม่ได้รับแจ้งเตือน** และ `docker compose logs nodered | grep web_push_error` เห็น `status=403 reason=BadJwtToken` (Apple ปฏิเสธ `VAPID_SUBJECT`): ตั้ง `VAPID_SUBJECT=https://<NGROK_DOMAIN>` (หรือ mailto ที่เป็นอีเมลจริง) → `docker compose up -d --force-recreate nodered` → บน iPhone ปิดแล้วเปิดการแจ้งเตือนใหม่
  (log ไม่มี JWT/คีย์ ; มีเฉพาะ status กับ reason สั้นๆ)
- ngrok ฟรีแสดงหน้า "Visit Site" ให้เบราว์เซอร์ครั้งแรก — กดครั้งเดียวต่ออุปกรณ์ (iPhone ที่เปิดจากไอคอนหน้าจอโฮม cookie แยกจาก Safari ต้องกดอีกครั้ง) ; `demo-check.sh` ตรวจว่า `ngsw-worker.js`/`manifest` ผ่าน tunnel ได้ไฟล์จริง
- ทดสอบอัตโนมัติ (push service ปลอมถอดรหัส payload จริง + ตรวจลายเซ็น VAPID): `bash scripts/test-day7c.sh` · ทดสอบบนมือถือจริง (iPhone / Android แยก 2 ชุด): [`docs/web-push-test.md`](docs/web-push-test.md)

### iPhone ค้างที่เวอร์ชันเก่า / หน้าวันนี้ขึ้น "เกิดข้อผิดพลาด" (ngrok ฟรี, 8C-C0)

**อาการ:** แอปที่เปิดจากไอคอนหน้าจอโฮมของ iPhone เป็นหน้าตาเก่า (เช่น เมนูล่างยังเป็น "ภาพรวม") และหน้าวันนี้ขึ้น "เกิดข้อผิดพลาด" ทั้งที่ Safari เครื่องเดียวกันเข้าได้ปกติ

**สาเหตุ (ตรวจแล้วด้วย curl 13 ต.ค.):** ngrok ฟรีแทรกหน้าเตือน "Visit Site" (HTML, **สถานะ 200**) ให้คำขอที่ไม่มีคุกกี้ — รวมถึง `/api/*` และ `/ngsw.json` ; พอใส่ header `ngrok-skip-browser-warning` ได้ JSON ปกติ ·
แอปบนหน้าจอโฮมของ iOS มีคุกกี้แยกจาก Safari และหมดอายุได้ ; service worker เสิร์ฟหน้าแอปจากแคช ผู้ใช้จึงไม่เคยเห็นหน้าเตือนให้กด ส่วน `ngsw.json` ได้ HTML จึงอัปเดตเวอร์ชันไม่ได้ (ค้างถาวร)

**สิ่งที่แอปทำให้แล้ว (เวอร์ชันที่มี 8C-C0 ขึ้นไป):**
- ทุก request ไป `/api` ใส่ header `ngrok-skip-browser-warning` อัตโนมัติ (`core/network/ngrok.interceptor.ts`; ไม่มีผลเมื่อไม่ได้ผ่าน ngrok) — API จึงไม่ถูกหน้าเตือนบังอีก
- ตรวจจับ HTML แทน JSON 2 ทาง : API ตอบ 2xx เป็น HTML (`html-guard.interceptor.ts`) และ probe `ngsw.json` ที่ service worker เห็น (ตอนเปิดแอป + ทุกครั้งที่กลับมาเปิด ห่างอย่างน้อย 30 วินาที ; ข้ามใน `ng serve`) → แสดงแถบสีเหลือง **"การเชื่อมต่อหมดอายุ แตะเพื่อเชื่อมต่อใหม่"** บนสุดของทุกหน้า (อยู่ที่ App root ทำงานได้แม้ API พังทั้งหมด)
- แตะแถบ → ไป `/today?ngsw-bypass=true` (service worker ไม่ดักจับ) → เห็นหน้า Visit Site → กด → ngrok พากลับ `/today` และคุกกี้ใหม่ทำให้ service worker อัปเดตเวอร์ชันได้ ; หน้าวันนี้ที่ได้ HTML จะบอกให้แตะแถบนั้น แทนข้อความ "เกิดข้อผิดพลาด" เฉยๆ

**วิธีกู้เครื่องที่ค้างอยู่แล้ว (เวอร์ชันเก่ายังไม่มีแถบ):** เปิดลิงก์ใน Safari → กด Visit Site → ลบไอคอนแอปออกจากหน้าจอโฮม (ล้าง service worker/แคชเก่า) → เพิ่มกลับด้วย "แชร์ → เพิ่มไปยังหน้าจอโฮม" → เปิดจากไอคอนใหม่ ถ้าขึ้นหน้า Visit Site อีกให้กดอีกครั้ง

**ข้อจำกัดของ ngrok ฟรี:** คุกกี้หน้าเตือนหมดอายุได้เสมอและเราควบคุมไม่ได้ ; คำขอที่เบราว์เซอร์ทำเอง (เปิดหน้า, ดาวน์โหลดไฟล์ของ service worker) ใส่ header ไม่ได้ จึงยังเจอหน้าเตือนได้ — แอปแค่ตรวจเจอและพาไปกดให้ ; webhook ของ LINE ไม่โดน (ไม่ใช่เบราว์เซอร์) ·
ถ้าจะใช้งานจริงต่อเนื่องให้ย้ายไป tunnel ที่ไม่มีหน้าเตือน (เช่น Cloudflare Tunnel) หรือโดเมนจริง

### 3. Dev แบบ hot reload

```cmd
docker compose up -d db nodered
cd frontend
npx ng serve
```

## Android (.apk)

```cmd
cd frontend
npx cap init YaTung app.yatung --web-dir dist/frontend/browser
npx ng build
npx cap add android
npx cap sync android
npx cap open android
```

เปิด Android Studio เพื่อ build ไฟล์ `.apk`

ใน `android/app/src/main/AndroidManifest.xml` เพิ่ม permission กล้อง

```xml
<uses-permission android:name="android.permission.CAMERA" />
```

## กันความลับหลุดเข้า git
- ห้าม commit `.env`, `node-red/data/flows_cred.json`, `node-red/data/.sessions.json`, `*.backup`, `.config.*.json` และห้ามฝังค่าลับ (LINE secret/token, ngrok authtoken, Gemini key, VAPID private key, JWT secret, hash รหัสผ่านจริง) ในโค้ด/เทส/เอกสาร
- เปิด hook ครั้งเดียวหลัง clone: `bash scripts/setup-hooks.sh` (ตั้ง `core.hooksPath=.githooks`) → **pre-commit** บล็อก commit ที่ stage ไฟล์ต้องห้ามหรือมีรูปแบบความลับ · **pre-push** สแกน commit ที่ยังไม่อยู่บน remote ใดเลย
- ไม่ต้องติดตั้ง gitleaks (ใช้ Node ล้วน `scripts/check-secrets.mjs`; ตัวตรวจ `scripts/lib/secret-scan.mjs`) ; ผลแสดงแค่ ชนิด/ไฟล์/บรรทัด ไม่แสดงค่า ; สแกนทั้งประวัติ: `node scripts/check-secrets.mjs --log --all`
- `demo-check.sh` หัวข้อ 0 ตรวจ `git ls-files` ไม่มีไฟล์ต้องห้าม (ขึ้น ✗ ถ้ามี)
- ถ้าความลับหลุดไปแล้ว: เปลี่ยนค่าที่ต้นทางก่อน (สร้างคีย์ใหม่/เปลี่ยนรหัสผ่าน) แล้วค่อยเอาออกจาก git — การลบไฟล์ไม่ลบประวัติ

## ก่อนนำเสนอ

```bash
bash scripts/demo-check.sh
```

สรุป ✓/✗ ทีละข้อ (ไม่ผ่านข้อใดจะ exit 1): container db/nodered/frontend · เว็บ :8080 และ proxy `/api` · MySQL credentials · warm-up Gemini ใน log ·
login บัญชีเดโม · **สแกนข้อความสั้น 1 ครั้งจริง** (เรียก Gemini 1 request ของโควตาบัญชีเดโม แล้วลบ draft ทิ้ง) ·
**LINE** (ข้อ 7): secret/token/OA ID ตั้งแล้ว · webhook ผ่าน nginx ตอบ 401 เมื่อ signature ผิด · tunnel ngrok (public URL, `/flows` ต้องไม่หลุดออกไป) ·
Webhook URL + Use webhook ใน LINE Console · **โควตา push: จริงจาก LINE / ใช้ไป / เหลือสำหรับเตือน / เหลือสำหรับแจ้งญาติ** · `DEMO_MODE` ·
รหัสผ่านเดโมอ่านจาก `DEMO_PASSWORD` (env หรือ `.env`; ไม่มี = `demo1234`)

- สแกนช้า > 15 วินาที = รุ่นหลักไม่ตอบแล้วสลับรุ่นสำรองอัตโนมัติ (ยังใช้ได้) — ดู `docker compose logs nodered | grep gemini_http`; Gemini ฝั่ง Google ช้าเป็นช่วงๆ ไม่เกี่ยวกับการเปิด container ใหม่
- ถ้าสแกนไม่ได้เลยตอนนำเสนอ: ตั้ง `AI_MOCK=true` ใน `.env` แล้ว `docker compose up -d --force-recreate nodered` (ตอบผลตัวอย่างหลังรอ 2 วินาที)
- Node-RED เรียก Gemini `models.get` 1 ครั้งตอนเริ่ม (log `gemini_warmup … status=200`) เพื่ออุ่น DNS/TLS และให้เห็นว่า key/เครือข่ายใช้ได้ก่อนสแกนจริง

### ชุดทดสอบทั้งหมด (`scripts/test-all.sh`)

```bash
bash scripts/test-all.sh          # unit + 3a, 4 (mock), 5, 6, 6b, 6c, 7a, 7b, 7c, 8 แล้วสรุปตาราง ผ่าน/ไม่ผ่าน
bash scripts/test-all.sh 6b 7a    # เฉพาะบางชุด
```

> **วันนำเสนอห้ามรันในช่วง 30 นาทีก่อนเดโม** (และอย่ารันใกล้มื้อยาของผู้ใช้จริง): ชุดทดสอบ recreate `nodered` หลายรอบและปิด cron เตือนจริงชั่วคราว (`REMINDER_CRON=off`) จึงไม่มีการเตือน/แจ้งญาติจริงระหว่างนั้น และ `nodered` จะรีสตาร์ตหลายครั้ง — ให้เทสเสร็จก่อน แล้วค่อยรัน `bash scripts/demo-check.sh`

- **เวลาของวัน:** บางเคสสร้างรอบกินยาย้อนหลัง/ล่วงหน้าตามนาฬิกา DB ซึ่งระบบนับ "วันนี้" ด้วย `CURDATE()` — ใกล้เที่ยงคืนรอบจะข้ามวัน ผลเทสจึงเพี้ยน (ไม่ใช่บั๊ก) ทุกชุดเรียก `scripts/lib/clock.sh` ตอนเริ่ม: นอกช่วงปลอดภัยแต่รอไม่เกิน 12 นาทีจะรอเอง นานกว่านั้นจะออกด้วย exit 3 พร้อมบอกเวลาที่รันได้ (ชุด 7A ต้องรันหลัง 02:15 ถึงก่อน 23:40; `CLOCK_GUARD=off` ข้ามตัวกัน)
- `DEMO_PASSWORD` ของ 3a/4 อ่านจาก `.env` เองถ้าไม่ได้ตั้งใน environment (ไม่แสดงค่า) · 6c ต้อง `docker compose up -d --build frontend` ก่อน
- `LINE_QUOTA_CACHE_MS` (ค่าเริ่มต้น 300000) — ชุดทดสอบตั้งเป็น 0 เพื่อปรับยอดโควตาของ LINE ปลอมกลางเทสได้ ; ตอนใช้งานจริงอย่าตั้ง
- หลังเทส `test-all.sh` ตรวจ `http://localhost:8080/api/me` = 401 และรีสตาร์ต `frontend` ให้ถ้าไม่ใช่ (nginx หา IP ของ `nodered` ตอนเริ่มเท่านั้น)
- **tunnel ค้างกับ network เก่า** ("network … not found" ตอน `--profile tunnel up`): เกิดเมื่อ `docker compose down` แล้ว `up` โดยไม่ใส่ profile — container `tunnel` เก่ายังอ้าง network ที่ถูกลบไปแล้ว แก้ด้วย
  `docker compose --profile tunnel up -d --force-recreate tunnel` · ชุดทดสอบไม่ `down` stack (recreate เฉพาะ `nodered`) ; ถ้าต้อง `down` ให้ใส่ `--profile tunnel` เสมอ (`docker compose --profile tunnel down`) · `demo-check.sh` ตรวจว่า `tunnel` อยู่ network เดียวกับ `frontend` และแสดงคำสั่งแก้ให้

## สรุปอัตราการกินยา 7 วัน (Dashboard, วันที่ 8A)

- เมนู **"สรุป"** (`/overview`): วงแหวนอัตรากินครบ 7 วัน + น้องยาตรง, ชิป "กินครบติดกัน n วัน", กราฟแท่งรายวัน (แตะแท่งดูรายละเอียด), ข้อสังเกตมื้อที่ลืมบ่อย, แยกตามยา และช่องทางที่บันทึก · การ์ดเล็ก "7 วันล่าสุด กินครบ n%" บนหน้าวันนี้
- ตัวเลขมาจาก `GET /api/stats/adherence?days=7` (ต้อง login ; days 7–30) — **อัตรา = กินแล้ว ÷ (กินแล้ว + ลืม + ถึงเวลาแล้วแต่ยังไม่กิน)** ไม่นับรอบที่ยังไม่ถึงเวลาและยาเมื่อมีอาการ ; วันที่ไม่มียาแสดง "–"
- ใน LINE พิมพ์ **"สรุป"** ได้ตัวเลขชุดเดียวกัน (ผู้ดูแลเห็นชื่อผู้ป่วยกับอัตรา ไม่เห็นชื่อยา)
- ทดสอบ: `bash scripts/test-day8.sh` · ตรวจหน้าตา: `cd frontend && node tools/overview-shots.mjs --scale=125`

## อ่านออกเสียง (TTS, วันที่ 8B)

- ปุ่ม 🔊 ในหน้า **วันนี้** ("ฟังยาที่ต้องกินวันนี้" + "ฟังมื้อนี้" ต่อมื้อ), หน้า **สรุป** ("อ่านสรุปให้ฟัง"), ฟอร์มยา (ทดลองฟังชื่อ) และ **ตั้งค่า → เสียงอ่าน** (เลือกเสียง, ความเร็ว ช้า/ปกติ, ทดลองฟัง) — ใช้ Web Speech API ของเบราว์เซอร์ ไม่ส่งข้อมูลออกไปไหน
- **แอปไม่พูดเองเด็ดขาด** ต้องแตะปุ่มทุกครั้ง · แตะซ้ำ/เปลี่ยนหน้า/ออกจากแอป = หยุด
- **เครื่องที่ไม่มีเสียงไทย** จะไม่เห็นปุ่ม 🔊 เลย ใน ตั้งค่า → เสียงอ่าน มีวิธีเพิ่มเสียง: Android ติดตั้ง "Speech Services by Google" แล้วโหลดข้อมูลเสียงไทย · Windows ตั้งค่า → เวลาและภาษา → เสียงพูด → เพิ่มเสียง · iPhone ตั้งค่า → การเข้าถึง → เนื้อหาที่พูด → เสียง → ไทย
- ฟอร์มเพิ่ม/แก้ยามีช่อง **"ชื่อที่ให้อ่านออกเสียง (ไม่บังคับ)"** (เช่น "ยาความดัน") ถ้าไม่กรอกจะอ่านชื่อยาตามที่บันทึก · ไม่แสดงใน LINE/แจ้งเตือนบนเครื่อง
- อัปเกรดฐานข้อมูลเดิม: `bash scripts/migrate.sh` (migration `006_tts_name.sql` รันซ้ำได้) แล้ว `docker compose restart nodered`
- ทดสอบ: `cd frontend && npx ng test --watch=false` · `node tools/tts-shots.mjs --scale=125` (เสียงจำลอง) · `bash scripts/test-day8.sh` ; **เสียงจริงต้องลองบนมือถือเอง**

## PWA และออฟไลน์ (วันที่ 8C)

- **service worker ทำงานเฉพาะ HTTPS และ `localhost`** — เปิดผ่านเน็ตในบ้านแบบ `http://192.168.x.x:8080` **ไม่มี service worker** จึงไม่มีออฟไลน์ ไม่มีปุ่มติดตั้ง ไม่มี Web Push (เบราว์เซอร์บล็อก) ; ใช้ ngrok (HTTPS) หรือ `localhost` ตอนทดสอบ/นำเสนอ
- **ติดตั้งลงหน้าจอ:** Android/Chrome มีการ์ด "ติดตั้งยาตรงไว้บนหน้าจอ" (หน้าวันนี้ครั้งเดียวหลัง login, ปิดแล้วซ่อน 14 วัน ; หน้าตั้งค่าแสดงเสมอจนกว่าจะติดตั้ง) · iPhone Safari การ์ดสอน "แชร์ → เพิ่มไปยังหน้าจอโฮม" พร้อมเหตุผลว่า **ต้องเพิ่มก่อนถึงจะได้รับการแจ้งเตือน** · ซ่อนเมื่อเปิดแบบแอปอยู่แล้วหรือใน Capacitor ; manifest มี shortcut "ยาวันนี้" / "สแกนซองยา"
- **ออฟไลน์ = อ่านอย่างเดียว:** หน้าวันนี้และสรุป 7 วันเก็บข้อมูลล่าสุดในเครื่อง (`localStorage`, key `yatung_snap:<userId>:…`, เฉพาะฟิลด์ที่หน้าจอใช้ ไม่มี ocr_text/รูป ; **ล้างตอน logout และ 401**) · ไม่มีเน็ต = แถบเหลือง "ออฟไลน์อยู่ · ข้อมูลล่าสุดเมื่อ HH:MM น." และปุ่ม "กินแล้ว" กดไม่ได้ ("ต่ออินเทอร์เน็ตก่อนนะคะ") — **ไม่ทำคิวบันทึกออฟไลน์** ; กลับมาออนไลน์ แอปรีเฟรชเอง
- **ห้ามแคช `/api`** (`ngsw-config.json` ไม่มี `dataGroups`; cache key ของ service worker คือ URL ไม่แยก JWT → ข้อมูลข้ามผู้ใช้) — มีเทสใน `node-red/test/pwa-files.test.js`, `scripts/test-day8.sh` และ `demo-check.sh` หัวข้อ 11
- **อัปเดตเวอร์ชัน:** เมื่อ deploy ใหม่ ผู้ใช้เห็น snackbar "มีเวอร์ชันใหม่ แตะเพื่ออัปเดต" (ไม่ reload เอง) ; เครื่องที่ติดตั้งเวอร์ชันเก่าก่อน 8C ไม่มี snackbar ในครั้งแรกที่อัปเดต (ปกติ)
- **ฟอนต์:** โหลดจาก `@fontsource` (self-host) ผ่าน `angular.json` — Mitr 500/600 และ Noto Sans Thai Looped 400–700 ; ไฟล์ woff2 รวม ≈ 570 kB ใน `media/` (service worker แคชแบบ lazy) · **แอปไม่โหลดอะไรจาก CDN ภายนอก** (ลบ Material Icons ที่ไม่ได้ใช้ออกจาก `index.html` แล้ว)
- **ngrok ฟรีกับ service worker:** ตรวจ 13 ต.ค. (curl ด้วย User-Agent iPhone ไม่มีคุกกี้) — `/ngsw.json` และ `/api/*` ได้ **หน้าเตือน HTML สถานะ 200** แทนไฟล์/JSON ; ใส่ header `ngrok-skip-browser-warning` ได้ของจริง → แอปใส่ header ให้ทุก `/api` เอง แต่คำขอ `ngsw.json` ที่ service worker ทำเองใส่ header ไม่ได้ จึงมีแถบ "การเชื่อมต่อหมดอายุ" (ดูหัวข้อ "iPhone ค้างที่เวอร์ชันเก่า" ด้านบน)
- ตรวจ installability: Chrome DevTools → Application → Manifest (ต้องไม่มีคำเตือน) ; รายการทดสอบบนมือถือจริง: `docs/day8-device-checklist.md`

## AI pipeline (`POST /api/scan`)

```
{image: base64} ──┐
                  ├─► Gemini (generateContent: รูป/ข้อความ + system prompt + responseSchema)
{text: "..."} ────┘        │ ครั้งเดียว: ถอดข้อความลง ocr_text (ปิดชื่อ/HN) แล้วตีความเป็น medications
                           ▼
        validate-llm-output.js (parse → Ajv → ปิดข้อมูลส่วนตัวซ้ำ → business rules → review_flags)
                           ▼
                prescriptions (status = draft) + ตอบ { prescription_id, ocr_text, result, review_flags }
```

**ทำไมเปลี่ยนจาก OCR → LLM เป็น Gemini แบบ multimodal:** ไม่มี billing account สำหรับ Google Cloud Vision
ส่วน Gemini อ่านรูปได้เองโดยตรง การส่งรูปครั้งเดียวทำให้ "อ่านตัวหนังสือ" กับ "ตีความ" เกิดพร้อมกัน
(โมเดลเห็นบริบทของซองทั้งใบ แก้ตัวอักษรที่อ่านผิดได้ดีกว่า OCR แยก), ใช้ key เดียว (`LLM_API_KEY`) และมีขั้นตอนน้อยลง

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `node-red/data/prompts/medicine-parse.system.txt` | system prompt (ถอดข้อความ + ปิดข้อมูลส่วนตัว + กฎตีความ + กัน prompt injection + ตัวอย่าง) |
| `node-red/data/prompts/medicine-parse.user.image.txt` / `.user.text.txt` | template ฝั่ง user สำหรับรูป / ข้อความ (แทน `{{USER_TEXT}}`) |
| `node-red/data/prompts/medicine-parse.schema.json` | JSON Schema ของผลลัพธ์ (มี `ocr_text`) ใช้ validate ด้วย Ajv |
| `node-red/data/prompts/mock-response.json` | ผลตัวอย่างของโหมดจำลอง |
| `node-red/data/lib/scan-service.js` | ตรวจ input, rate limit, บันทึก/ลบรูป, สร้าง request Gemini, กฎลองซ้ำ, บันทึก prescriptions |
| `node-red/data/lib/validate-llm-output.js` | parse → Ajv → ปิดเลขบัตร/เบอร์ซ้ำ → review_flags |

ทั้งหมดถูกโหลดใน `settings.js` (`global.get('prompts' | 'scanService' | 'llmOutput' | 'medicineValidator')`)
การเรียก Gemini เป็น node `http request` ใน tab `2-AI-Scan` ที่มองเห็นได้ใน flow (ใช้ header `x-goog-api-key` เท่านั้น)

**การส่ง schema ให้ Gemini:** ส่งเป็น `generationConfig.responseJsonSchema` โดย `scanService.toGeminiSchema()` สร้างสำเนาจาก schema ต้นฉบับ
(inline `$defs`/`$ref`, ตัด `maxItems` — Gemini ตอบ 400 ถ้ามี) ส่วนไฟล์ต้นฉบับเก็บไว้ครบให้ Ajv ตรวจซ้ำ (รวม `maxItems`)
**เวลา:** ยิง Gemini รวมไม่เกิน 40 วินาทีต่อคำขอ (รวมลองซ้ำ) แล้วตอบ 503 `AI_UNAVAILABLE`

**ตัวแปรสภาพแวดล้อม:** `LLM_API_KEY`, `LLM_MODEL` (`gemini-3.5-flash-lite`), `LLM_MODEL_FALLBACK` (`gemini-3.1-flash-lite` — ใช้ทันทีเมื่อรุ่นหลักตอบ 429/503 หรือ timeout), `AI_MOCK`

**รุ่นและโควตา:** ตัวหลัก `gemini-3.5-flash-lite` (ทดสอบ 7 เคสถูกหมด ตอบใน 3–4 วินาที) · ตัวสำรอง `gemini-3.1-flash-lite` (11–12 วินาที) ·
ไม่ใช้ `gemini-3.8-flash` (โควตาฟรีน้อย 5 ครั้ง/นาที, 20 ครั้ง/วัน และตอบ 503 บ่อย) — แอปจำกัดผู้ใช้ละ 4 ครั้ง/นาที และ 15 ครั้ง/วัน ·
`thinkingLevel: minimal` ทำให้เร็วขึ้นมาก (32 → 10 วินาทีในเคสทดสอบ) · ผลทดสอบทั้งหมดดู [`docs/ai-test-report.md`](docs/ai-test-report.md)

> **ถ้าเน็ตล่มหรือโควตาหมดวันนำเสนอ ให้ตั้ง `AI_MOCK=true` แล้ว `docker compose up -d nodered`**
> (ตอบผลตัวอย่าง Metformin หลังรอ 2 วินาที ผ่าน validator จริง และยังบันทึก prescriptions ตามปกติ, `llm_model = "mock"`)
> ใส่ `[[mock:no_result]]`, `[[mock:invalid_json]]`, `[[mock:schema]]`, `[[mock:unavailable]]` ในข้อความเพื่อจำลอง error

### ความเป็นส่วนตัวของข้อมูล

- **รูปซองยาถูกส่งให้ Gemini เพื่ออ่าน** (รูปยังมีชื่อผู้ป่วย/HN อยู่ตามที่พิมพ์บนซอง) — ผู้ใช้ควรรู้ข้อนี้ก่อนสแกน
- **เก็บรูปไม่เกิน 7 วัน** ที่ `/data/uploads/<userId>/` (ไม่อยู่ใน git): ลบทันทีเมื่อ confirm/discard (ทำวันที่ 5 — `scanService.deleteUploadForPrescription`),
  และมี cron 03:00 ใน tab `6-Scheduler` ลบไฟล์ที่เก่ากว่า 7 วันพร้อมตั้ง `prescriptions.image_path = NULL`
  (สแกนล้มเหลวจะลบรูปทิ้งทันที)
- **ข้อความที่เก็บถาวร** (`prescriptions.ocr_text`, `llm_json`) **ปิดชื่อผู้ป่วย → `[ชื่อผู้ป่วย]`, HN → `[HN]`, เลขบัตร → `[เลขบัตร]`,
  เบอร์โทร → `[เบอร์โทร]` แล้ว** — Gemini ปิดตอนถอดข้อความ และ server ปิดเลขบัตร 13 หลัก/เบอร์โทรซ้ำอีกชั้น
- log ของ Node-RED ไม่บันทึก API key, base64 ของรูป หรือ `ocr_text` (บันทึกเฉพาะความยาว เวลา และ status)

docker compose up -d           # เริ่มระบบ (หลังเปิดเครื่อง)
docker compose down            # หยุดระบบ (ข้อมูลยังอยู่)
docker compose logs -f nodered # ดู log ของ Node-RED

docker compose --profile tunnel up -d
docker compose --profile tunnel up -d --force-recreate tunnel   # ถ้า tunnel ค้างกับ network เก่า ("network … not found")
docker compose --profile tunnel down                             # ถ้าจะ down ให้ใส่ profile เสมอ