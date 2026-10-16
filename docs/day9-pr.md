# PR: feat/day9-capacitor → main (ร่าง — ยังไม่ push / ยังไม่เปิด PR)

## ชื่อ PR
`feat(android): วันที่ 9 — Capacitor 8 + apk (CORS ที่ nginx, back, ไอคอน/splash, กล้อง, อ่านออกเสียงไทย)`

## สรุป
ห่อเว็บแอปเดิมเป็นแอป Android ด้วย Capacitor 8 (WebView โหลดไฟล์ในแอป ส่วน API เรียกผ่าน HTTPS ไปที่ tunnel) โดยเว็บ/PWA เดิมไม่เปลี่ยนพฤติกรรม ทดสอบจริงบน Samsung Galaxy S23 FE (One UI 8.5 / Android 16)

- **Build:** config `native` แยกจากเว็บ (`environment.native.ts` สร้างจาก `.env` ตอน build, ไม่ commit) · interceptor ใส่ base URL เฉพาะ native · ปิด service worker ใน native
- **CORS (ช่วง B):** ทำที่ nginx ไม่ใช่ Node-RED — อนุญาต origin `https://localhost` ตัวเดียว, ตอบ preflight เอง (รวม PATCH, Max-Age 600), ซ่อน `Access-Control-*` ของ Node-RED, `/line/webhook` ต้องไม่มี ACAO
- **กล้อง (C):** ใช้ `@capacitor/camera` ไม่ประกาศ permission `CAMERA` ตามเอกสาร v8 · ข้อความไทยเมื่อกล้อง/คลังภาพเปิดไม่ได้ · เส้นทางย่อ/บีบรูปเดิมทุกค่า
- **back / แถบระบบ (D):** ปุ่ม back เป็นชั้น (sheet → กล่องยืนยัน → router → ออกแอป) · แถบสถานะเขียว edge-to-edge · ล็อกแนวตั้ง · "แจ้งเตือนบนเครื่องนี้" เป็น "ใช้ LINE แทน" (เปลี่ยนข้อความตามสถานะเชื่อม LINE)
- **ไอคอน + splash (E):** สร้างจากน้องยาตรงชุดเดียวกับ PWA
- **เอกสาร (F):** `docs/day9-android.md`
- **อ่านออกเสียงไทย (G):** `@capacitor-community/text-to-speech` ผ่าน adapter `TtsEngine` (โหลดแบบ lazy เฉพาะ native) ซ่อนปุ่ม 🔊 เองเมื่อไม่มีเสียงไทย · ตรวจเสียงทนรหัสภาษา + timeout + ตรวจซ้ำเมื่อกลับเข้าแอป · หัวข้อวินิจฉัยในหน้าผู้พัฒนา (เห็นเฉพาะ demoMode)

## บั๊กที่น่าเล่า
ปุ่ม 🔊 ไม่ขึ้นบน Android ทั้งที่มีเสียงไทย: `async load()` คืน Proxy ของปลั๊กอิน Capacitor ซึ่งตอบ `then` เป็นเมธอด native → JS มองเป็น thenable แล้วรอตลอดไป แก้โดยห่อใน `{ tts }` (รายละเอียดใน `docs/day9-plan.md` หัวข้อ "เรื่องเล่าไล่บั๊ก")

## ผลทดสอบ (16 ต.ค.)
| ชุด | ผล |
|---|---|
| `ng test` | 41 ไฟล์ / 406 เทส ผ่าน |
| `ng build` (เว็บ) initial | 517.39 kB (raw) / 137.51 kB (transfer) |
| `build:native` initial | 517.44 kB / 137.55 kB |
| `dup-styles-check` | ไม่มี inline styles ซ้ำ |
| `scan-lazy-check` | ผ่านทั้งหมด |
| `scan-offline-check` | ผ่านทั้งหมด (SW แคช 115 ไฟล์) |
| `review-e2e` | 67/0 |
| `test-cors-native.sh` | 30/30 (localhost + ngrok) เมื่อ 13:14 — รันซ้ำหลัง build image ใหม่: ดูหัวข้อ "รอ" ด้านล่าง |
| `git grep` โดเมน ngrok จริง | ไม่พบในไฟล์ที่ track (เหลือเฉพาะตัวอย่าง `example`/`xxx` ในเอกสาร) |
| บนเครื่อง S23 FE | ช่วง A, B, D, E, G ผ่าน (ดูตารางสรุป) |

## วิธี build apk
ดู [`docs/day9-android.md`](day9-android.md) — JDK 21 → `npm run cap:sync` ในโฟลเดอร์ `frontend` → ต่อ USB → Run ใน Android Studio (อย่ากด Upgrade ของ AGP)

## ไม่อยู่ใน commit (ตั้งใจ)
- `frontend/src/environments/environment.native.ts` — สร้างโดย `npm run cap:env` จาก `.env` (มีโดเมน tunnel)
- keystore / `*.jks` และ `*.apk`
- `frontend/android/app/build/` และ `frontend/android/local.properties` (ถูก ignore โดย `frontend/android/.gitignore`)
- `docs/screenshots/day9/` และ `docs/screenshots/testandroid/` (ภาพทดสอบ — ยังเป็น untracked ไม่ได้อยู่ใน .gitignore ต้องให้คาเด็ทตัดสินว่าจะ commit หรือไม่)

## ข้อควรรู้ผู้ตรวจ
- ต้อง `docker compose up -d --build frontend` เพื่อให้ nginx ใหม่ (CORS + webhook ซ่อน ACAO) ขึ้น
- เสียงไทยบนเครื่องจริงต้องตั้ง TTS engine เป็น Google และติดตั้งเสียงไทย
- push ยังไม่ทำ — รอคำสั่งคาเด็ท

🤖 Generated with [Claude Code](https://claude.com/claude-code)
