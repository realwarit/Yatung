# วันที่ 9W — หน้าต้อนรับ (Welcome) แบบ motion

branch `feat/welcome` · ต้นแบบ `docs/mockups/welcome-mockup.dc.html` (384×832 ตำแหน่งตายตัว; ใช้อ่านค่าสี/ขนาด/ตำแหน่ง/keyframes เท่านั้น ห้ามคัดลอกโครงสร้าง)

## ส่วนที่ 1 — ขอบเขตงาน (ก้อน 1/2)

### ขั้นตอน
1. บันทึกแผน → สำรวจโค้ด → เสนอ "ส่วนที่ 2 — แผน" พร้อมคำถามและภาพ before ของ `/` กับ `/login` (384×832, 320×640) แล้ว **รออนุมัติ**
2. ทำทีละช่วง (W1 → W2 → W3) รันเทส → รายงาน → commit แยกต่อช่วง
3. ถามก่อน: rebuild container, push, เปิด PR — คาเด็ทเป็นคน merge เอง
4. งาน UI: ทำ W2 เสร็จแล้วส่งภาพให้ดูก่อน ค่อยไปต่อ W3 และเปิดดูภาพเองก่อนรายงานทุกครั้ง
5. ติดปัญหาเกิน ~45 นาที ให้หยุดแล้วรายงานทางเลือก

### W1 — route และพฤติกรรม
1. หน้าใหม่ `/welcome` เป็น standalone component แบบ **lazy** (`features/welcome/welcome.page.ts`) ผู้ใช้ที่ล็อกอินแล้วต้องไม่โหลด chunk นี้เลย
2. ขึ้น **ทุกครั้งที่ยังไม่ล็อกอิน** แต่เฉพาะตอนเข้าที่ `/` เท่านั้น:
   - `/` ยังไม่ล็อกอิน → `/welcome` | ล็อกอินแล้ว → `/today` (เหมือนเดิม)
   - `/welcome` ตอนล็อกอินแล้ว → `/today` (replaceUrl)
   - **deep link ทุกหน้า** (เช่น `/today` จากปุ่ม "เปิดแอป" ใน Flex ของ LINE) ตอนยังไม่ล็อกอิน → `/login` แล้วกลับหน้าเดิมหลังล็อกอิน เหมือนเดิมทุกอย่าง ห้ามผ่านหน้าต้อนรับ
   - start_url ของ PWA และการเปิด apk ต้องได้ผลตามกฎ `/` — ตรวจ manifest และ guard เดิมก่อนแก้
3. ปุ่ม "เริ่มต้นใช้งาน" → `/login`
4. ปุ่ม back ของ Android (เพิ่มในลำดับ back เดิมของวันที่ 9):
   - ที่ `/welcome` → ออกแอป
   - ที่ `/login` ถ้ามาจาก `/welcome` → กลับ `/welcome` | เข้า `/login` ทางอื่น → ออกแอปเหมือนเดิม
   - `/register` ใช้กฎเดิม
5. PWA ออฟไลน์: เปิด `/welcome` ตอนออฟไลน์ต้องแสดงได้ (ตรวจว่า chunk ถูก precache ตาม ngsw-config เดิม)
6. ไม่มี dependency ใหม่, ไม่มี Lottie/วิดีโอ/รูปภาพใหม่, **ไม่มีฟอนต์ใหม่** (Mitr + Noto Sans Thai Looped ที่ self-host), ไม่แตะ backend/Node-RED

## ส่วนที่ 1 — ก้อน 2/2 (ข้อ 7–21)

### W2 — หน้าตาและแอนิเมชัน (ยึดต้นแบบ, CSS/SVG ล้วน, ไม่มี JS วนเฟรม)
7. **องค์ประกอบ:** ฟ้าไล่สี `#e8f7f3`→`#fffaf2` + แสงอุ่นมุมดวงอาทิตย์ | ดวงอาทิตย์หน้ายิ้ม (รัศมีหมุน แสงเรือง กะพริบตา) | เมฆ 3 ก้อนความเร็วต่างกัน | นกคู่บินผ่าน | ดาวระยิบ 4 ดวง | ของลอย 5 ชิ้น (แคปซูล 2 เม็ดยา หัวใจ ดาว) | เนิน 3 ชั้น + ดอกไม้โยก 4 ดอก | น้องยาตรง + เงา | กล่องคำพูด "สวัสดีค่ะ!" | ชื่อ "ยาตรง" | คำโปรย | ปุ่ม | "สำหรับผู้ป่วยและญาติผู้ดูแล"
8. **น้องยาตรง: ใช้ `app-mascot` เดิม (mood wave) ห้าม fork SVG** ถ้าต้องโบกมือวนต่อเนื่องให้เพิ่ม input optional ที่ค่าเริ่มต้นไม่เปลี่ยนหน้าอื่น; ท่ากระโดดลง/ดึ๋งทำที่ wrapper ภายนอก; กล่องคำพูดใช้คอมโพเนนต์เดิมถ้ามี
9. **ชื่อ "ยาตรง":** Mitr 700 ~66px แยก 5 ตัวอักษร — ชั้นหน้าไล่สี `#5eead4→#2dd4bf→#14b8a6→#0f766e` (background-clip:text) + ชั้นหลังความหนา 8 ชั้น `#0f766e→#134e4a` + เงานุ่ม; `<h1 aria-label="ยาตรง">` ตัวย่อย aria-hidden
10. **คำโปรย:** "กินยาตรงเวลา น้องยาตรงช่วยเตือนเองนะคะ" Noto Sans Thai Looped 600 ~21px `#134e4a`
11. **ปุ่ม:** นูน 3D ครีม (`#fff`→`#fffaf2`) ตัวหนังสือ Mitr `#0f766e` ขอบล่าง `0 6px 0 #b4e4d8` + เงานุ่ม สูง ≥ 60px ลอยเบาๆ + แสงมิ้นต์วิ่งผ่านเป็นระยะ focus-visible ชัด; ของตกแต่งทั้งหมด aria-hidden
12. **ลำดับเวลา:** 0–0.8s ฟ้าสว่าง | 0–1.6s ดวงอาทิตย์ขึ้น | 0.15/0.3/0.45s เนินหลัง/กลาง/หน้าเลื่อนขึ้น | 0.9–2.1s น้องกระโดดลง ยุบเด้ง เงาขยาย | 1.6–2.6s ตัวอักษรหล่นเด้งทีละตัว | 2.1s กล่องคำพูด | 2.2s คำโปรย | 2.2–2.8s ของลอยเด้งทีละชิ้น | 2.6s ปุ่ม | หลังนั้นวน: น้องโบก 2 ครั้ง + ดึ๋งทุก 7s, ตัวอักษรกระโดดเป็นคลื่นทุก 5s, ที่เหลือตามต้นแบบ — **ปุ่มกดได้ตั้งแต่วินาทีแรก**
13. **prefers-reduced-motion:** หยุดทุกอย่างใน**ท่าสุดท้าย** (ไม่ใช่ท่าเริ่มที่มองไม่เห็น)
14. **Responsive:** เนิน+ปุ่มยึดล่าง, ชื่อ+คำโปรยยึดบน, น้องและดวงอาทิตย์ย่อตามความสูงจอ; ≥ 768px ฟ้า/เนินเต็มจอ เนื้อหากลาง ≤ ~420px; safe-area บน/ล่าง — ห้ามล้นที่ 320×640, 384×832, ตัวอักษรระบบ 130%
15. ใช้ transform/opacity เป็นหลัก, สไตล์ไม่ซ้ำทุกไบต์กับคอมโพเนนต์อื่น (dup-styles-check), รายงานจำนวน px ใน scss ก่อน/หลัง

### W3 — เทสและหลักฐาน
16. ng test ต้องไม่ลด (ตอนนี้ 406) + เทส routing ตามข้อ 2 ทุกกรณี, ปุ่มไป /login, back ตามข้อ 4
17. first-screen strict และ overflow-check เพิ่ม `/welcome` (ทุกสถานะ 320/384 130%) รายงานจำนวนเกณฑ์ก่อน/หลัง; review-e2e, scan-lazy-check, scan-offline-check, dup-styles-check ต้องผ่าน
18. initial bundle เว็บและ native ก่อน/หลัง (ไม่โตเกิน ~1 kB) + ขนาด lazy chunk หน้าใหม่
19. ภาพ: 384×832, 320×640 (+`-full`), 1280×800, reduced-motion และจับเฟรม 0.5s/1.5s/3s เก็บที่ `docs/screenshots/day9w` (เพิ่มใน .gitignore)
20. build apk ตาม `docs/day9-android.md` แล้วเตรียมรายการทดสอบ Samsung Galaxy S23 FE (ชุด 7: 7-1, 7-2 …) ครอบคลุม cold start (splash→ต้อนรับ), ความลื่น, ปุ่ม, back, deep link จาก LINE, ล็อกอินแล้วเปิดตรง /today, ลดภาพเคลื่อนไหว
21. ตอนจบ: อัปเดต CLAUDE.md/README, ร่าง PR ที่ `docs/day9w-pr.md`, ก่อน commit ทุกครั้ง `git grep` โดเมน ngrok ต้องว่าง

(ข้อสุดท้ายที่ได้รับ = 21)

## ส่วนที่ 2 — แผน (รออนุมัติ)

### ผลสำรวจ (ของจริงในโค้ด)
- `app.routes.ts`: `'' → redirectTo 'today'` ; `/today` อยู่ใต้ `authGuard` ซึ่งส่งไป `/login?returnUrl=…` → วันนี้ `/` ตอนยังไม่ล็อกอินไปที่ `/login?returnUrl=%2Ftoday` (ภาพ before: `docs/screenshots/welcome/before-{root,login}-{384x832,320x640}.png` — `/` กับ `/login` ได้หน้าเดียวกัน)
- `guestGuard` ของ `/login`,`/register` ส่ง `/today` เมื่อล็อกอินแล้ว (ไม่ต้องแก้)
- **`manifest.webmanifest` `start_url` = `/today`** → PWA ที่เปิดตอนยังไม่ล็อกอินจะข้ามหน้าต้อนรับ ; Capacitor โหลด `/` อยู่แล้ว (ไม่มี `server.url`) จึงตรงกฎ ; `pwa-files.test.js` assert `start_url === '/today'` ต้องแก้ตาม
- back: `core/native/back-decision.ts` (`decideBack` ฟังก์ชันล้วน + เทส) — `EXIT_PATHS = ['/', '/today', '/login', '/register']`
- ngsw: `assetGroups.app` prefetch `/*.js` → chunk lazy ของ welcome ถูก precache เองโดยไม่ต้องแก้ config (จะยืนยันด้วย `ng build` + `ngsw.json`)
- ฟอนต์ใน mockup: หัว "ยาตรง" ใช้ **Mitr 700** (repo มีเฉพาะ 500, กฎ CLAUDE.md "Mitr 500 เท่านั้น") ; ที่เหลือเป็น Noto Sans Thai Looped 600/400 ซึ่งมีอยู่แล้ว ; `<link>` Google Fonts (Mali/Kanit/Prompt/Chonburi) เป็นของเครื่องมือออกแบบ **ห้ามนำมา**

### W1 — route/พฤติกรรม
1. `core/auth/auth.guard.ts` เพิ่ม `rootGuard` (token → `/today`, ไม่มี → `/welcome`) ใช้กับ `path:'' pathMatch:'full'` แทน redirect ; เพิ่ม `welcomeGuard` (token → `/today` ผ่าน UrlTree = แทนที่ประวัติ) บน `/welcome`
2. route `welcome` → `loadComponent` `features/welcome/welcome.page` ; `**` ยังไป `today` (ยังไม่ล็อกอิน → login ตามเดิม ไม่ผ่าน welcome)
3. `start_url` → `/` (+ แก้ `pwa-files.test.js`) ; shortcuts คง `/today` (deep link)
4. ปุ่ม "เริ่มต้นใช้งาน" = `router.navigate(['/login'], { state: { from: 'welcome' } })` (ไม่ใส่ returnUrl → หลัง login ไป `/today`)
5. back: `BackState` เพิ่ม `cameFromWelcome` (อ่าน `history.state.from === 'welcome'` ตอนกด ไม่เก็บ state เอง) → action ใหม่ `go-welcome` (`navigateByUrl('/welcome', {replaceUrl:true})`) เมื่อ path = `/login` และ cameFromWelcome ; `/welcome` เพิ่มใน `EXIT_PATHS` ; เทส `back-decision.spec` เพิ่มทุกกรณี
6. เทส: guard spec (`/` ล็อกอิน/ไม่ล็อกอิน, `/welcome` ล็อกอินแล้ว, deep link `/today` ไม่ล็อกอิน → `/login?returnUrl=/today`), e2e playwright ตรวจว่าล็อกอินแล้วไม่โหลด chunk welcome (network) และเปิดออฟไลน์ผ่าน `ng build` + SW

### W2 — หน้า Welcome (ภาพนิ่ง + โครง)
- `features/welcome/welcome.page.{ts,html,scss}` ; จัดวางแบบ responsive (ไม่ใช้ตำแหน่งตายตัว px ของ mockup) 320–430px และจอกว้าง (กลางจอ max-width ~420) ; สีย้ายเป็น token `--yt-*` (ค่าที่ไม่มี เช่น พื้นฟ้า/ดวงอาทิตย์ เพิ่มใน `_tokens.scss` พร้อมเช็ก contrast) ไม่ hardcode
- เนื้อหา: หัว "ยาตรง" ทีละตัวอักษร (aria-label "ยาตรง") · "สวัสดีค่ะ!" · tagline · ปุ่มหลักเดียว "เริ่มต้นใช้งาน" (≥ 48px, focus ring ระบบ) · "สำหรับผู้ป่วยและญาติผู้ดูแล" · มาสคอต · ปุ่ม ก/ก+/ก++ มุมบนขวา ; ไม่ล้นที่ 320/360/375/384 ก–ก++ (เพิ่ม `/welcome` ใน `overflow-check.mjs` + `first-screen-check.mjs`: ปุ่มเริ่มอยู่จอแรกที่ 320×568)
- scss ของ component ≤ 4 kB (เกินให้แยก `welcome-scene`)
- **ส่งภาพให้ดูก่อนเข้า W3**

### W3 — motion
- keyframes จาก mockup เป็น CSS ล้วน : ฉากเปิดเล่นครั้งเดียว ~2.6 วินาที (ฟ้า → ดวงอาทิตย์ขึ้น → เนิน → น้องยาตรงตกลงมา+บีบ → ตัวอักษรตกทีละตัว → ข้อความ/ปุ่มลอยขึ้น) แล้ววนเบาๆ (ลอย กะพริบ โบกมือ กระโดดทุก ~7 วินาที เมฆ นก ประกาย ปุ่มเต้น)
- กฎ: `prefers-reduced-motion` = แสดงเฟรมสุดท้ายนิ่ง (ทุกชิ้นอยู่ตำแหน่งสุดท้าย ไม่ซ่อน) ; ปุ่มกดได้ตั้งแต่เฟรมแรก ไม่รอ animation จบ ; หยุด animation วนเมื่อ `visibilitychange` hidden (ประหยัดแบต) ; ใช้ transform/opacity เท่านั้น ; span รายตัวอักษร aria-hidden ; ฉากเปิดเกิน 300ms ของกฎระบบ = ข้อยกเว้นเฉพาะหน้านี้ (แสดงครั้งเดียว) — ขอยืนยัน
- ตรวจ: สคริปต์ถ่ายเฟรม t=0.5/1.5/2.8/6s + reduced-motion

### เทส/ตรวจที่จะรัน (ไม่แตะ docker เว้นแต่ถามก่อน)
`ng test` (guard + back-decision), `node --test` (`pwa-files`), `ng build` (budget + chunk welcome แยก + ngsw.json), `overflow-check.mjs`, `first-screen-check.mjs`, e2e ล็อกอินแล้วไม่โหลด chunk

### คำถามที่ต้องตัดสินใจ
1. **ข้อขัดแย้งของ spec: Mitr 700 (ข้อ 9) vs "ไม่มีฟอนต์ใหม่" (W1 ข้อ 6)** — `angular.json` โหลด Mitr เฉพาะ 500 (thai+latin) และ CLAUDE.md ห้าม 600+ ; Mitr 700 ต้องเพิ่มไฟล์ woff2 (ประมาณ +15–20 kB lazy ผ่าน `@font-face` ในสไตล์ของหน้านี้เท่านั้น ได้ถ้าอยากให้หนาเท่า mockup) · ทางเลือก: (ก) **Mitr 500 + ชั้นความหนา 8 ชั้นที่ mockup มีอยู่แล้ว** (ตัวบางลงนิดแต่ชั้นหลังชดเชย ไม่เพิ่มไฟล์) *(แนะนำ)* (ข) Mitr 700 เฉพาะหน้านี้ ตามต้นแบบเป๊ะ
2. **`start_url` PWA → `/`:** ต้องแก้ manifest + เทส ; เครื่องที่ติดตั้งแล้วได้ค่าใหม่เมื่อ SW อัปเดต — โอเคไหม?
3. ~~มาสคอต/tagline/ลิงก์รอง~~ ตัดสินแล้วจากก้อน 2: ใช้ `app-mascot` wave (ข้อ 8) · tagline ข้อ 10 · ไม่มีลิงก์รอง ; แผนทำ: `.wave` เดิมเล่น 3 รอบแล้วหยุด → เพิ่ม input optional `loopWave` (ค่าเริ่มต้น false ไม่กระทบหน้าอื่น) ให้โบก 2 ครั้งทุก 7 วินาที ; กล่องคำพูดใช้ `app-speech-bubble` (`typing=false`, `tail=down`) ; ท่ากระโดดลง/ดึ๋งที่ wrapper
4. **ปุ่ม ก/ก+/ก++:** กฎระบบบอกให้มีทุกหน้า แต่ข้อ 7 ไม่มีในรายการองค์ประกอบ — ใส่มุมบนขวาแบบ `compact` *(แนะนำ ตามกฎ)* หรือไม่ใส่เพื่อยึดต้นแบบ? (ตัวอักษร 130% ต้องไม่ล้นอยู่แล้วตามข้อ 14)
5. **ฉากเปิดนานกว่า 300ms:** ต้นแบบ ~2.6 วินาที ขัดกฎ "animation ≤ 300ms" ของ CLAUDE.md — ขอถือเป็นข้อยกเว้นเฉพาะ `/welcome` และจะเขียนข้อยกเว้นลง CLAUDE.md ตอนข้อ 21 ?
6. ยังอยู่บน branch `feat/day9-capacitor` — จะสร้าง `feat/welcome` จากที่นี่ (ได้โค้ดวันที่ 9 ติดมาด้วย) หรือแตกจาก `main`? *(แนะนำจากสาขาปัจจุบัน เพราะ back handler อยู่ในสาขานี้)*
