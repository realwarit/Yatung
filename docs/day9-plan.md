# วันที่ 9 ส่วนที่ 1 — Capacitor + .apk : ข้อเสนอ (รออนุมัติ)

สถานะ: **สำรวจเสร็จ ยังไม่แก้โค้ด/ไม่ติดตั้งอะไร** (15 ต.ค. 2026) · สาขา `feat/day9-capacitor` (แยกจาก main หลัง PR #32 merge) · ไฟล์นี้เป็นไฟล์เดียวที่เพิ่ม

เป้าหมาย/คำตัดสิน 1–13 ตามที่สั่ง (ไม่ทวนซ้ำ) — เอกสารนี้ตอบ "รายการส่วนที่ 2"

---

## 1. ตรวจเครื่องคาเด็ท

| รายการ | พบ | สถานะ |
|---|---|---|
| Node / npm | v24.21.0 / 11.19.0 (CLAUDE.md เขียน 22; Capacitor CLI ต้อง ≥ 22) | ✓ ใช้ได้ |
| Android Studio | **2026.1** ติดตั้งที่ `D:\Program` (`bin\studio.exe`) | ✓ |
| JDK ของ Studio | JBR ในตัว = **Java 25.0.2** (`D:\Program\jbr`) | ⚠ ดูความเสี่ยง R1 |
| JDK ใน PATH | **Java 8** (JRE 1.8.0_401), `JAVA_HOME` ไม่ได้ตั้ง | ✗ ใช้ build ไม่ได้ (Capacitor 8 ต้อง Java 21) |
| Android SDK | `C:\Users\waritsara\AppData\Local\Android\Sdk` · platforms **35, 36** · build-tools **35.0.0, 36.0.0** · platform-tools 37.0.1 · emulator + system-images (31, 35, 37.1) | ✓ ตรง compileSdk 36 |
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` | ไม่ได้ตั้ง | ✓ ไม่จำเป็นถ้า build จาก Studio (Studio เขียน `local.properties` เอง) |
| `adb` | มีที่ `...\Sdk\platform-tools\adb.exe` แต่**ไม่อยู่ใน PATH** · `adb devices` = **ไม่มีเครื่องต่ออยู่** | ⚠ ต้องต่อ S23 FE |
| cmdline-tools | ไม่มี | ✓ ไม่ต้องใช้ (build ผ่าน Studio) |
| debug keystore | มี `~\.android\debug.keystore` | ✓ debug apk เซ็นได้ทันที |

**สิ่งที่คาเด็ทต้องทำเอง (Claude ไม่ติดตั้งให้):**
1. **JDK 21 สำหรับ Gradle** — ทางง่ายสุด: เปิดโปรเจกต์ใน Studio → *Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK* → เลือก *Download JDK…* → เวอร์ชัน **21** (Eclipse Temurin หรือ JetBrains) → OK. (ทางเลือก: ติดตั้ง Temurin 21 เองแล้วตั้ง `JAVA_HOME`)
2. ครั้งแรก Studio จะ sync Gradle และดาวน์โหลด Gradle wrapper + dependency (~ร้อย MB, ต้องมีเน็ต) · ถ้าถามให้ติดตั้ง SDK ที่ขาด/Accept licenses → กดยอมรับ
3. **S23 FE**: เปิด *ตัวเลือกนักพัฒนา* (ตั้งค่า → เกี่ยวกับโทรศัพท์ → ข้อมูลซอฟต์แวร์ → แตะ "หมายเลขบิลด์" 7 ครั้ง) → เปิด *USB debugging* → ต่อสาย USB → กด "อนุญาต" บนเครื่อง · ถ้า Windows ไม่เห็นเครื่อง ติดตั้ง Samsung USB Driver
4. (ไม่บังคับ) เพิ่ม `...\Sdk\platform-tools` เข้า PATH เพื่อพิมพ์ `adb` ได้ · ผมจะเรียกด้วย path เต็มเอง
5. บอกเวอร์ชัน Android/One UI ของเครื่อง (เพราะ Android 15+ บังคับ edge-to-edge)

## 2. เวอร์ชัน Capacitor / plugin

มีใน `package.json` แล้ว: `@capacitor/core ^8.5.2`, `@capacitor/cli ^8.5.2`, `@capacitor/camera ^8.2.5` (ใช้ในหน้า Scan อยู่แล้ว). Capacitor ไม่ผูกกับ Angular — ไม่มีปัญหากับ Angular 21; Node ≥ 22 ✓. ตรวจจาก npm registry วันนี้:

| แพ็กเกจ | ใช้ | เวอร์ชัน | หมายเหตุ |
|---|---|---|---|
| `@capacitor/android` | ✓ | 8.5.3 | template: AGP 8.13.0, compileSdk 36, minSdk 24, **Java 21** |
| `@capacitor/app` | ✓ | 8.1.2 | ปุ่ม back, exitApp |
| `@capacitor/status-bar` | ✓ | 8.0.4 | สไตล์ตัวอักษรขาว |
| `@capacitor/splash-screen` | ✓ | 8.0.2 | |
| `@capacitor/assets` | ✓ (dev) | 3.0.5 | gen ไอคอน/splash จาก `resources/` (ไฟล์ 1024px มีอยู่แล้ว) |
| `@capacitor-community/text-to-speech` | ถ้าเลือก TTS ทาง (ก) | 8.0.2 | ไม่มี `@capacitor/text-to-speech` ของทางการ |
| `@capacitor/keyboard` | ✗ | — | `KeyboardService` เดิมใช้ได้ ไม่เพิ่ม |
| `@capacitor/browser` | ✗ (ดู R6) | — | ใช้ถ้าลิงก์ LINE ไม่เปิด |

ทุกตัว peer `@capacitor/core >=8`. จะปรับ core/cli/camera ให้ minor เดียวกัน (8.5.x) ตอน `npm install` (แตะ `package-lock.json`).

## 3. ข้อ 2 — API base ตอน build (ไม่ commit โดเมน)

- `.env` / `.env.example`: เพิ่ม `API_BASE_URL=https://${NGROK_DOMAIN}` **ต่อท้าย `NGROK_DOMAIN`** (กฎลำดับตัวแปรเดิม) · ใน `.env.example` ใส่ placeholder เท่านั้น
- `frontend/tools/gen-native-env.mjs` (ใหม่): อ่าน `../.env` เอง (แทนค่า `${…}`), ตรวจต้องเป็น `https://…` ไม่มี `/` ท้าย, เขียน `src/environments/environment.native.ts` = `{ native: true, apiBase: '…' }` — **ไฟล์นี้ใส่ `.gitignore`** · ไม่พิมพ์ค่าโดเมนออก log (บอกแค่ "ตั้งค่าแล้ว") · ไม่มีค่า = หยุดพร้อมข้อความไทยบอกวิธีแก้
- `src/environments/environment.ts` (commit): `{ native: false, apiBase: '' }` → เว็บ/PWA ไม่เปลี่ยน
- `angular.json`: configuration ใหม่ `native` = `fileReplacements` (environment.ts → environment.native.ts) + **`serviceWorker: false`** (ไม่สร้าง ngsw ใน bundle native) + outputPath เดิม
- `app.config.ts`: `provideServiceWorker(... enabled: !isDevMode() && !environment.native)` และเพิ่ม `apiBaseInterceptor` เป็น**ตัวสุดท้าย**ของ chain (ตัวอื่นทั้งหมดเช็ก `req.url.startsWith('/api/')` จึงต้องเห็น URL แบบ relative ก่อน; ตัวสุดท้ายค่อย prefix `apiBase`) · ทำงานเมื่อ `apiBase !== ''` เท่านั้น
- ข้อ 3: **`ngrok.interceptor` เดิมใส่ `ngrok-skip-browser-warning` ให้ทุก `/api/` อยู่แล้ว** (ทั้งเว็บและ native) จึงไม่ต้องเขียนเพิ่ม — เพิ่มเทสว่า header ยังติดหลัง prefix
- จุดอื่นที่ยิงเน็ตตรง: `connection.service` (probe `/ngsw.json` — ไม่ทำงานเมื่อ SW ปิด ✓), `scan.page` `fetch(src)` (URL ของรูปในเครื่อง ✓). `html-guard` ใช้ต่อได้ (native ก็เจอหน้าเตือน ngrok ถ้า header หลุด)
- npm scripts: `cap:env` (gen env) · `build:native` (= `cap:env` + `ng build -c native`) · `cap:sync` (= `build:native` + `cap sync android`) · `cap:open` (`cap open android`)
- `capacitor.config.ts` (commit, ไม่มีโดเมน): `appId com.yatung.app`, `appName ยาตรง`, `webDir dist/frontend/browser`, `server.androidScheme 'https'` (origin = `https://localhost`), ไม่ตั้ง `server.url`, `CapacitorHttp` ปิด (ให้ CORS ทำงานตามข้อ 4)
- `.gitignore` เพิ่ม: `frontend/src/environments/environment.native.ts`, `*.keystore`, `*.jks`, `local.properties`, `frontend/android/.idea`, `frontend/android/app/src/main/assets/public` (สำเนา dist ที่ฝังโดเมนอยู่ — template ของ Capacitor ignore อยู่แล้ว ตรวจซ้ำ), `frontend/android/capacitor-cordova-android-plugins` (มี `app/build/` และ `.gradle/` อยู่แล้ว)
- ข้อสังเกต: โดเมนอยู่ใน apk ที่สร้างเสร็จ (ไม่ใช่ความลับแต่ไม่ควรแชร์ไฟล์ apk ต่อสาธารณะ) · **เปลี่ยนโดเมน ngrok = ต้อง build apk ใหม่** (ngrok ฟรีมีโดเมน static ต่อบัญชี ถ้าใช้ `NGROK_DOMAIN` คงที่ก็ไม่เจอปัญหา)

## 4. ข้อ 4 — CORS ที่ Node-RED

- ไฟล์ที่แตะ: **`node-red/data/settings.js` เท่านั้น** (บรรทัด ~110 มี `httpNodeCors` ถูกคอมเมนต์ไว้) + `node-red/test/cors-config.test.js` ใหม่. **ไม่แตะ `flows.json`** → กฎ "stop nodered ก่อนแก้ flows" ไม่เกี่ยว; แต่ `settings.js` มีผลเมื่อ `restart nodered` → **ถามคาเด็ทก่อนทุกครั้ง** ไม่ทำช่วง 23:50–00:15 ไม่ทำระหว่างคาเด็ทเทสมือถือ
- ค่า: `httpNodeCors = { origin: ['https://localhost'], methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS', allowedHeaders: 'Authorization,Content-Type,ngrok-skip-browser-warning', maxAge: 600, credentials: false }` (Node-RED ใช้แพ็กเกจ `cors` ตอบ preflight `OPTIONS *` ให้เองก่อน route/middleware อื่น)
  - origin อื่น/ไม่มี Origin (เว็บ same-origin, curl, LINE webhook) → ไม่ได้ header `Access-Control-Allow-Origin` = พฤติกรรมเดิม
  - `ngrok-skip-browser-warning` ทำให้ทุกคำขอเป็น preflight → `maxAge` ช่วยแคช 10 นาที
- nginx/ngrok ไม่ต้องแก้ (proxy ส่ง `OPTIONS` และ header ผ่านอยู่แล้ว)
- ตรวจ: unit test ฟังก์ชันสร้าง config + (หลังได้รับอนุญาต restart) curl 5 กรณี: preflight จาก `https://localhost` → 204 + header ครบ · จาก `http://evil.example` → ไม่มี ACAO · GET จริงมี ACAO เฉพาะ origin ที่อนุญาต · ไม่มี Origin → ไม่มี ACAO · `/line/webhook` ไม่กระทบ (401 เมื่อลายเซ็นผิดเหมือนเดิม)
- ทางสำรองหาก CORS มีปัญหาบนเครื่องจริง: เปิด `CapacitorHttp` (ส่ง HTTP ผ่านฝั่ง native ไม่ติด CORS) — ไม่ใช้เป็นค่าเริ่มต้น เพราะเปลี่ยนพฤติกรรมของ blob/ไฟล์ใหญ่

## 5. ข้อ 8 — TTS : ทาง (ก) / (ข)

ข้อเท็จจริงที่ต้องตรวจก่อน: `speechSynthesis` ใน Android WebView **ไม่ได้ "ไม่มี" แน่นอน** — มักมีอ็อบเจ็กต์อยู่แต่ `getVoices()` ว่าง/พูดไม่ออกในบางเครื่อง. โค้ดเดิมจัดการรายการเสียงว่างโดยพูดด้วย `lang=th-TH` อยู่แล้ว (`canSpeak`). → **ในช่วง A ผมจะเสนอให้ทดสอบ 1 นาทีบนเครื่องจริง** (กดปุ่ม 🔊 จริง) ก่อนตัดสิน

| | (ก) plugin `@capacitor-community/text-to-speech` ผ่าน adapter | (ข) ซ่อนปุ่ม 🔊 ใน native |
|---|---|---|
| งาน | แยก `TtsEngine` interface (voices/speak/cancel) ใน `TtsService`: web engine = โค้ดเดิม, native engine = plugin (`speak({text, lang:'th-TH', rate})`, `getSupportedVoices`), import แบบ lazy เฉพาะ native · ปรับ `tts.service.spec` ที่ผูกกับ `SpeechSynthesis` · หน้าตั้งค่า "เสียงที่ใช้" ใช้ type กลาง | ตั้ง `canSpeak=false` เมื่อ native (หรือปล่อยให้ logic เดิมซ่อนเองเมื่อไม่มีเสียงไทย) |
| เวลา | ประมาณ **0.5–1 วัน** (เทส + ทดสอบเครื่องจริง) | **< 1 ชม.** |
| ความเสี่ยง | ต้องมีเสียงไทยในเครื่อง (S23 FE ปกติมี Google Speech Services; Samsung TTS ไม่มีไทย) · คิวท่อนต้องรอ promise ต่อท่อน (ต่างจาก web ที่จัดคิวทันที) · bundle: plugin ต้องไม่หลุดเข้า initial | เสียฟีเจอร์สำหรับผู้สูงอายุใน apk (กลุ่มผู้ใช้หลัก) · เกณฑ์ "ความรู้นอกเหนือ" ไม่เสีย (ยังโชว์ได้บนเว็บ) |

**คำแนะนำ:** เริ่มด้วย (ข)-เป็นค่าตั้งต้นที่ปลอดภัยในช่วง A–F (ไม่เสียเวลาแก้ TTS ก่อน apk ตัวแรกรัน) แล้วทำ (ก) เป็น**ช่วง G แยก** time-box 1 วัน หลังคาเด็ทยืนยันว่าช่วง A–F บนเครื่องจริงผ่าน — ถ้าผลทดสอบ A พบว่า `speechSynthesis` พูดไทยได้อยู่แล้ว ข้ามช่วง G ได้เลย (ประหยัดทั้งหมด)

## 6. แบ่งงานเป็นช่วง + จุดที่ต้องทดสอบบนเครื่องจริง

| ช่วง | งาน | ทดสอบเครื่องจริง (คาเด็ท) |
|---|---|---|
| **A** ติดตั้ง + build เปล่า | `npm i` plugin ข้อ 2 · `capacitor.config.ts` · `cap add android` · `.gitignore` · สคริปต์ env + config `native` + `apiBaseInterceptor` + ปิด SW · build bundle ตรวจ initial ≤ ~530 kB | คาเด็ท: ตั้ง JDK 21 ใน Studio → Run บน S23 FE → เห็นหน้า login · **ตรวจ TTS 1 นาที** · (ก่อนช่วง B login ยังติด CORS ถือว่าปกติ) |
| **B** API + CORS | `settings.js` CORS + เทส · (ขออนุญาต restart nodered) | login ได้, วันนี้/ยาของฉัน/สรุป/ตั้งค่า โหลดข้อมูลจริง, กดกินแล้ว, ปิดแอปเปิดใหม่ยัง login อยู่ · เปิดแอปตอน tunnel ล่ม → เห็นแถบออฟไลน์ ไม่ขาว |
| **C** กล้อง | permission `CAMERA` ใน manifest · ข้อความไทยก่อนขอสิทธิ์ + ตอนถูกปฏิเสธ (ดู R5) · ตรวจ `Camera.getPhoto` บน Android | สแกนซองจริง → Review → บันทึก · ปฏิเสธสิทธิ์แล้วขอใหม่ · เลือกจากคลังภาพ |
| **D** back / safe-area / status bar | `BackHandlerService` (stack: sheet → ยืนยัน inline → router → ออก) ลงทะเบียนแบบ lazy เฉพาะ native · `SheetService`/`MatDialog`/กล่องยืนยันใน `med-detail-sheet` ฯลฯ · class `is-native` บน `<html>` · safe-area บน/ล่าง · StatusBar ขาวบนพื้นเขียว `#0f766e` · แถว "แจ้งเตือนบนเครื่องนี้" → "ใช้ LINE แทน" (+ sheet อธิบาย, เพิ่มสถานะ `native` ใน `pushState`) | back ทุกกรณีข้อ 9 · **ทั้งโหมดปัดและโหมด 3 ปุ่ม** · ก/ก+/ก++ · หมุนจอ (ถ้ารองรับ) |
| **E** ไอคอน + splash | `tools/make-splash.mjs` (sharp, ใช้ SVG น้องยาตรงชุดเดียวกับ `make-icons.mjs`) · `npx @capacitor/assets generate --android` · SplashScreen config | ไอคอนบนหน้าจอโฮม (ถูกครอบวงกลม/สี่เหลี่ยมมน), splash ตอนเปิดแอป |
| **F** เอกสาร + ตรวจเว็บ | `docs/day9-android.md` (ทีละขั้นสำหรับคนไม่เคยใช้ Studio + ภาพหน้าจอจุดสำคัญ ถ้ามี) · รันเทสข้อ 13 ทั้งชุด (ng test, first-screen strict, overflow-check, review-e2e, scan-lazy/offline, dup-styles, ขนาด initial) | อัดคลิป build ใน Studio ตามเอกสาร |
| **G** (ถ้าอนุมัติ) TTS native | ข้อ 5 ทาง (ก) | ฟังเสียงอ่านหน้าวันนี้ / สรุป / ฟอร์มยา |

หลังแต่ละช่วงจะแจ้งให้ซิงก์ (`npm run cap:sync`) แล้ว Run ใน Studio อีกครั้ง; commit แยกช่วงละ commit, **ไม่ push/PR จนกว่าคาเด็ทสั่ง**

## 7. ความเสี่ยง

- **R1 JDK 25 ของ Studio vs Gradle:** wrapper ใน template ของ Capacitor 8 ใช้ Gradle 8.x ซึ่ง (ตามที่ผมทราบ) ยังไม่รองรับรันบน Java 25 → ใช้ JDK 21 ตามข้อ 1.1 (Capacitor ตั้ง source/target = 21 ด้วย). ยังไม่ได้ยืนยันกับ Gradle ที่จะโหลดจริง จะรู้ตอน sync ครั้งแรก
- **R2 Edge-to-edge:** targetSdk 36 บังคับ edge-to-edge → `setBackgroundColor` ของ StatusBar ไม่มีผลบน Android 15+; ต้องวาดแถบเขียวเองด้วย padding บน (`env(safe-area-inset-top)` / ตัวแปร CSS ของ Capacitor `SystemBars`) · ต้องยืนยัน `env()` ทำงานใน WebView ของเครื่อง (WebView เก่าไม่รองรับ) — มีทางสำรองเป็นตัวแปร CSS จากปลั๊กอิน
- **R3 แถบเมนูล่าง + ปุ่มสแกนที่ยื่นขึ้น:** ใช้ `--yt-bottom-clearance` อยู่แล้ว (รวม `env(safe-area-inset-bottom)`) จึงควรรอดทั้งสองโหมด แต่ **ยืนยันได้ด้วยเครื่องจริงเท่านั้น** (โหมด 3 ปุ่มความสูงแถบต่างกัน)
- **R4 Splash บน Android 12+:** ระบบแสดงได้แค่ "ไอคอนกลางพื้นสี" (ครอบวงกลม) — ภาพ splash เต็มจอแบบ iOS ทำไม่ได้ → ใช้ พื้น `#e8f7f3` + น้องยาตรงตัวเดียว ตามข้อ 11 โดยไม่ใส่ชื่อแอป/ข้อความ
- **R5 "ข้อความขออนุญาตกล้องเป็นภาษาไทย":** Android ไม่มีช่อง usage-description แบบ iOS — กล่องขอสิทธิ์เป็นของระบบ แสดงตามภาษาเครื่อง. ที่ทำได้: ข้อความไทยของแอปเอง**ก่อน**ขอสิทธิ์ ("ยาตรงขอใช้กล้องถ่ายซองยา") และข้อความไทยเมื่อถูกปฏิเสธถาวร ("เปิดสิทธิ์ที่ ตั้งค่า → แอป → ยาตรง → สิทธิ์") + ชื่อแอป/`strings.xml` เป็นไทย — ขอยืนยันว่าตีความถูกไหม
- **R6 ลิงก์ LINE (`line.me/R/oaMessage/…`) / ปุ่ม "เปิด LINE":** WebView ปกติส่งลิงก์ https ภายนอกไปเบราว์เซอร์/แอป LINE เอง แต่ต้องทดสอบบนเครื่อง; ถ้าไม่เปิดจะเพิ่ม `@capacitor/browser`
- **R7 ปุ่ม back กับ route guard:** `Location.back()` ผ่าน `canDeactivate` เดิม (Review/ฟอร์มยา ถามก่อนออก) ✓ แต่ต้องกันกรณีกล่องยืนยันซ้อน sheet (กฎ 8D ห้ามอยู่แล้ว) และ `/login` ที่ถูกแทนด้วย `replaceUrl` หลัง login
- **R8 bundle:** `@capacitor/core` ถูกดึงเข้า initial ถ้า import แบบสถิต → ใช้ helper `isNative()` อ่าน `window.Capacitor` (ไม่ import) และ `import()` ปลั๊กอิน (app/status-bar/splash) แบบ dynamic เฉพาะ native · วัดก่อน/หลังทุกช่วง
- **R9 localStorage/JWT ใน WebView:** เก็บใน origin `https://localhost` ของแอป — ถ้าผู้ใช้ล้างข้อมูลแอปต้อง login ใหม่ (ปกติ) · ไม่มีการเปลี่ยนวิธีเก็บ token
- **R10 ไฟล์ใหญ่ใน repo:** `cap add android` เพิ่มไฟล์ Gradle wrapper (jar ~60 kB) + res ไอคอนหลายขนาด รวม ~ไม่กี่ร้อย kB; ไม่มี keystore (debug key อยู่ใน `~/.android` นอกรีโป)

## 8. คำถามที่ต้องการคำตอบก่อนเริ่มช่วง A

1. **อนุมัติแผนช่วง A–F** (และให้ช่วง G TTS เป็นตัวเลือกหลังเห็นผลทดสอบ A) ใช่ไหม? ตัวเลือก TTS: ตามคำแนะนำ (ข)-ก่อน-แล้ว(ก) / ทำ (ก) เลย / (ข) ถาวร
2. อนุมัติให้ `npm install` เพิ่มแพ็กเกจข้อ 2 (แก้ `package.json`/`package-lock.json`) และ `npx cap add android` (สร้าง `frontend/android/`)?
3. Android/One UI เวอร์ชันของ S23 FE? ต่อ USB ได้ไหม (ตอนนี้ `adb devices` ว่าง)? — ถ้าไม่ได้ใช้ USB ให้ติดตั้ง apk ด้วยการส่งไฟล์เข้าเครื่องเอง (ผมเขียนทางนี้ไว้ในเอกสารด้วย)
4. โดเมน ngrok ที่จะใส่ใน apk คงที่ตลอดช่วงเดโมใช่ไหม? (ถ้าเปลี่ยนต้อง build ใหม่)
5. ปุ่ม back บนหน้าแท็บหลัก (ยาของฉัน / สรุป / ตั้งค่า): ตามข้อ 9 ตรงตัว (ถอยตามประวัติ router, ออกแอปเมื่อถึง /today หรือ /login) หรืออยากให้ back จากแท็บอื่น "กลับ /today ก่อน" เสมอ?
6. R5 — ยืนยันการตีความเรื่องข้อความขอสิทธิ์กล้องเป็นข้อความไทยของแอปเอง
7. ช่วงเวลาที่ผมขอ restart nodered ได้ในช่วง B (ต้องไม่ขัดกับที่คาเด็ททดสอบมือถืออยู่)

---

# ส่วนที่ 3 — คำตอบที่ตัดสินแล้ว (15 ต.ค. 2026; ขัดกับส่วนที่ 2 ให้ถือส่วนนี้)

อนุมัติช่วง A–F · ช่วง G (TTS native) ตามเงื่อนไขข้อ 1

## คำตอบคำถาม 8.1–8.7
1. **TTS:** ช่วง A–C ไม่แตะ TTS · ทดสอบปุ่ม 🔊 **หลังช่วง B** (ต้อง login ก่อนถึงจะเห็นปุ่ม) · พูดไทยได้ = ไม่ทำอะไร · พูดไม่ได้ = ทาง (ข) ในช่วง D (native บังคับ `canSpeak=false`, แถวตั้งค่าเสียงแสดง "เสียงอ่านใช้ได้บนเว็บ") · ช่วง G ทำเฉพาะเมื่อ A–F ผ่านบนเครื่องจริงก่อน **17 ต.ค. 18:00** และจำกัด **3 ชม.** — ไม่ทันให้หยุดและคงทาง (ข) (18 ต.ค. ทดสอบ iPhone, 19 ต.ค. freeze)
2. อนุมัติ `npm install` ตามตารางข้อ 2 (ยังไม่เพิ่ม keyboard/browser — ดูข้อ 14) และ `npx cap add android` · คง major 8 · `@capacitor/assets` เป็น devDependency · ตรวจว่า Dockerfile ของ frontend ยัง `npm ci` ผ่าน · **ถามก่อน rebuild container**
3. ออกแบบเผื่อ Android 15+ edge-to-edge ทุกเวอร์ชันเครื่อง · คาเด็ทแจ้งเวอร์ชันตอนต่อเครื่องในช่วง A · USB เป็นหลัก + เขียนวิธีส่งไฟล์ apk เองเป็นทางสำรองในเอกสาร
4. โดเมน ngrok คงที่ (static domain บัญชีฟรี) ตลอดเดโม
5. **ปุ่ม back** (ห้ามถอยข้ามแท็บตามประวัติ router): (1) ปิด sheet/dialog → (2) ยกเลิกยืนยัน inline → (3) หน้าย่อย (`/settings/*`, ฟอร์มยา, Review): `Location.back()` ผ่าน canDeactivate → (4) แท็บหลักที่ไม่ใช่ `/today`: ไป `/today` (`replaceUrl`) → (5) `/today` หรือ `/login`: `App.exitApp()`
6. R5 ตีความถูก: ข้อความไทยของแอปก่อนขอสิทธิ์ (ครั้งแรกเท่านั้น) · ถูกปฏิเสธถาวร = ข้อความไทย + ปุ่ม "เปิดหน้าตั้งค่าแอป" ถ้าทำง่าย ไม่งั้นข้อความอย่างเดียว · `app_name` = "ยาตรง"
7. **restart nodered:** ถามคาเด็ทในแชทบรรทัดเดียวก่อนทุกครั้ง · ห้าม 23:50–00:15, 02:55–03:10, ระหว่างคาเด็ทเทสมือถือ, ±10 นาทีจากเวลามื้อของบัญชีทดสอบ

## แก้/เพิ่มในแผน
8. **ngrok กับ preflight = ความเสี่ยงใหญ่สุด พิสูจน์ก่อนอย่างอื่นในช่วง B:** preflight `OPTIONS` แนบ `ngrok-skip-browser-warning` ไม่ได้ (header อยู่แค่ใน `Access-Control-Request-Headers`) ngrok ฟรีอาจตอบหน้าเตือน HTML · curl 5 กรณี ทั้งผ่าน `localhost:8080` และ**โดเมน ngrok จริง** (UA Chrome Android, `Origin: https://localhost`, Request-Method, Request-Headers: authorization, content-type, ngrok-skip-browser-warning) · ต้องได้ 204 + ACAO ไม่ใช่ HTML · อ่านโดเมนจาก `.env` เป็นตัวแปร ห้ามพิมพ์ออก log/รายงาน · ได้หน้าเตือน = หยุดและรายงานทางเลือก (เช่น `CapacitorHttp` + ทดสอบอัปโหลดรูปสแกน) ห้ามแก้เองก่อนถาม
9. **ตรวจก่อนแก้ `settings.js` แล้วรายงานก่อนลงมือ:** (ก) `httpNodeMiddleware` ทำอะไรกับ OPTIONS (ถ้าตรวจ JWT ก่อน CORS → preflight ได้ 401) (ข) grep `Access-Control-` ใน `flows.json` (อ่านอย่างเดียว) และ nginx conf — ตั้ง header เองจะซ้ำแล้ว CORS พัง
10. build native = `ng build -c production,native` (configuration ไม่สืบทอดกัน) · `native` มีแค่ fileReplacements + `serviceWorker: false` · รายงาน initial เว็บ (คง ~515 kB) และ native (≤ 530 kB)
11. **grep URL ที่ไม่ผ่าน HttpClient** (origin native = `https://localhost`): `location.origin`, `window.location`, `document.baseURI`, `src` ที่ชี้ `/api`, `fetch(`, `EventSource`, `sendBeacon`, `href` ไปเซิร์ฟเวอร์ — เสี่ยง 2 กลุ่ม: ลิงก์ที่ส่งให้คนอื่น (เชิญญาติ/เชื่อม LINE/QR) และรูปจาก API · รายงานรายการที่เจอ + วิธีแก้ในรายงานช่วง A
12. **`connection.service` ใน native** ไม่มี `/ngsw.json` ให้ probe → ระบุว่าตัดสิน online/offline จากอะไร · ต้องเห็นแถบออฟไลน์เมื่อ tunnel ล่ม และไม่ค้างเมื่อเน็ตปกติ · ถ้าต้องแก้ ให้ native probe endpoint เบาของ API ผ่าน apiBase
13. `.gitignore` เพิ่ม `*.apk`, `*.aab`, `frontend/android/app/release/` · ห้ามแนบ apk ใน GitHub Release/รีโป (มีโดเมนข้างใน) · ก่อน commit ทุกช่วง `git grep` โดเมน (ผ่านตัวแปร) ต้องว่าง · `git status` ต้องไม่มี `environment.native.ts`, `local.properties`, `assets/public`
14. **คีย์บอร์ด + edge-to-edge** (Android 15 อาจไม่ resize): ทดสอบช่วง D — login, ฟอร์มยา, ช่องค้นหา · บังช่องกรอก = อนุมัติล่วงหน้าให้เพิ่ม `@capacitor/keyboard` (`resizeOnFullScreen: true`, import lazy เฉพาะ native) เฉพาะกรณีนี้
15. **StatusBar** ตัวอักษร/ไอคอนขาว = `Style.Dark` (ชื่อในปลั๊กอินกลับกับความรู้สึก — ตรวจให้ถูก) · แถบเขียววาดเองด้วย padding `safe-area-top` · ขอบล่างไม่ทับแถบนำทางระบบทั้งโหมดปัด/3 ปุ่ม · หน้า Scan (Ionic) ต้องตรวจ safe-area ด้วย
16. ล็อกแนวตั้ง `screenOrientation="portrait"` → ตัดเทสหมุนจอออก
17. **กล้อง:** ขนาด/คุณภาพรูปเท่าเส้นทางเว็บเดิม (ระบุค่าในรายงาน) · ห้าม log base64 · permission ใส่เฉพาะที่เอกสาร `@capacitor/camera` v8 กำหนด + รายงานว่าใส่อะไรเพราะอะไร
18. **ไอคอน/splash:** adaptive foreground หน้าน้องยาตรงอยู่ใน safe zone กลาง ~60% บนพื้น `#0f766e` · splash พื้น `#e8f7f3` + น้องยาตรง (R4) · **ก่อน gen ทับ** ทำภาพ preview (วงกลม + สี่เหลี่ยมมน + splash) ที่ `docs/screenshots/day9/` (ไม่ commit) แล้วรอชีฟดู · ไม่ทำ monochrome
19. **เว็บ/PWA ต้องไม่เปลี่ยน** (SW, Web Push, pwa-elements, TTS บนเว็บ): ทุกช่วงรัน `ng test` อย่างน้อย · ช่วง F รันเทสชุดข้อ 13 ของคำสั่งเดิมทั้งหมด · จำนวนเทสห้ามลด (363 + ใหม่)
20. `docs/day9-android.md` ต้องเตือน: ถ้า Studio เด้ง "AGP Upgrade Assistant" / "Upgrade Gradle" → กด *Remind me later*/ไม่ **ห้ามอัปเกรด** (จะแก้ไฟล์ใน `android/`)
21. **ลำดับเวลา:** 15 ต.ค. ช่วง A · 16 ต.ค. B → C → D · 17 ต.ค. E → F → (G) · รายงานท้ายแต่ละช่วง: ตารางสถานะ · initial เว็บ/native · จำนวนเทสก่อน/หลัง · ขั้นตอนที่คาเด็ททำใน Studio/มือถือทีละขั้น พร้อมเลขจุดถ่ายภาพ 6-x (ระบุ Samsung Galaxy S23 FE) · commit ช่วงละ 1 commit · ไม่ push/PR จนกว่าคาเด็ทสั่ง · ติดเกิน 45 นาที = หยุดแล้วรายงานทางเลือก
22. ช่วง A ห้ามแตะ nodered · commit `docs/day9-plan.md` (รวมส่วนที่ 3) พร้อม commit ช่วง A
