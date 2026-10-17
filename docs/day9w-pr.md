# PR: feat/welcome → feat/day9-capacitor (ร่าง — ยังไม่ push / ยังไม่เปิด PR)

> แตกจาก `feat/day9-capacitor` (ต้อง merge สาขานั้นก่อน หรือใช้เป็นฐานของ PR นี้)

## ชื่อ PR
`feat(welcome): วันที่ 9W — หน้าต้อนรับแบบ motion (/welcome) + ปรับ start_url และปุ่ม back`

## สรุป
หน้าต้อนรับใหม่ ขึ้นเมื่อเข้า `/` ตอนยังไม่ล็อกอิน (เว็บ / PWA / apk) · CSS/SVG ล้วน ไม่มี dependency/ฟอนต์/รูปใหม่ ไม่แตะ backend

- **route (W1):** `/` → `/welcome` (ไม่ล็อกอิน) หรือ `/today` (ล็อกอินแล้ว) · `/welcome` ล็อกอินแล้ว → `/today` · deep link ทุกหน้าไม่ผ่านหน้าต้อนรับ (ยัง `/login?returnUrl`) · lazy chunk (ผู้ล็อกอินแล้วไม่โหลด) · manifest `start_url` `/today` → `/`
- **back:** `/welcome` ออกแอป · `/login` ที่มาจากหน้าต้อนรับ → กลับ `/welcome` (อ่าน `history.state.from`) · ทางอื่นเหมือนเดิม
- **หน้าตา/motion (W2):** ฉากท้องฟ้า-ดวงอาทิตย์-เมฆ-นก-ของลอย-เนิน 3 ชั้น, ชื่อ "ยาตรง" ทีละตัว (Mitr 500 + ชั้นความหนา 8 ชั้น), ปุ่มนูน 3D, ปุ่ม ก/ก+/ก++ · ใช้ `app-mascot` เดิม (เพิ่ม input `shadow`, `loopWave` ค่าเริ่มต้นไม่เปลี่ยนหน้าอื่น) และ `app-speech-bubble` เดิม (เปิดใช้ `tail="down-left"` ที่มี CSS อยู่แล้ว) · token สี `--yt-wc-*` · `prefers-reduced-motion` = ท่าสุดท้ายนิ่ง · ปุ่มกดได้ตั้งแต่เฟรมแรก
- **ข้อยกเว้นกฎ animation ≤ 300ms:** ฉากเปิด ~2.6 วินาทีเฉพาะ `/welcome` (บันทึกใน CLAUDE.md)

## ผลทดสอบ (17 ต.ค.)
| ชุด | ผล |
|---|---|
| `ng test` | 43 ไฟล์ / 418 เทส ผ่าน (เดิม 406: +7 guards, +2 back, +3 welcome page) |
| `node --test pwa-files` | 9/9 (แก้ `start_url`) |
| `ng build` (เว็บ) initial | 517.84 kB / 137.61 kB (เดิม 517.39 / 137.51 → +0.45 kB) |
| `build:native` initial | 517.89 kB / 137.66 kB (เดิม 517.44 → +0.45 kB) |
| scss budget | ไม่มี warning (แยก 6 คอมโพเนนต์ ≤ 4 kB) · px ใน scss 355 → 423 (+68 ดูหมายเหตุใต้ตารางก่อน/หลัง) |
| `overflow-check` /welcome | 36/36 (320/360/384/1280, ก–ก++, ระบบ 130%) |
| `first-screen-check --strict` ทั้งชุด | ผ่าน 554 · ไม่ผ่าน 0 (เดิม 538 + 16 ของ /welcome) |
| `welcome-overlap-check` (ใหม่) | 15/15 ผ่าน: ของตกแต่งไม่ทับปุ่ม ก/ก+/ก++ และไม่ทับชื่อ/คำโปรย ตลอด 0–26 วินาที ที่ 246×492, 295×640, 320×640, 384×832, 1280×800 ทุก ก–ก++ ; คำโปรยไม่แตกกลางวลี |
| `dup-styles-check` | ไม่ซ้ำ |
| `scan-lazy-check` / `scan-offline-check` | ผ่านทั้งหมด |
| `welcome-offline-check` (ใหม่) | ผ่านทั้งหมด: ล็อกอินแล้วไม่โหลด chunk welcome · SW แคชครบ 116/116 · ออฟไลน์เปิด `/`, `/welcome` ได้ · deep link → login |
| `review-e2e` | 67/0 (รันกับ stack จริง ไม่ recreate; ผู้ใช้สุ่มถูกลบหลังจบ) |
| บนเครื่อง S23 FE | **ยังไม่ได้ทดสอบ** — รายการ `docs/day9w-device-checklist.md` (ชุด 7: 7-1 ถึง 7-18) |

ภาพ (git-ignored): `docs/screenshots/day9w/` — สร้างใหม่ด้วย `node tools/welcome-shots.mjs`

## ไม่อยู่ใน commit (ตั้งใจ)
`environment.native.ts`, `*.apk`, `android/app/build/`, `docs/mockups/` (ต้นแบบจากเครื่องมือออกแบบ — ยังไม่ track), ภาพใน `docs/screenshots/`

## ตารางก่อน/หลัง (ฐาน = `5f5f190` ปลายวันที่ 9 ซึ่งอยู่ใน `origin/main` แล้ว)
| รายการ | ก่อน | หลัง | หมายเหตุ |
|---|---|---|---|
| `ng test` | 406 เทส / 41 ไฟล์ | 418 เทส / 43 ไฟล์ | +12 |
| `first-screen-check --strict` | 538 ผ่าน | 554 ผ่าน / 0 ไม่ผ่าน | +16 ของ `/welcome` (ก่อน = ลบจำนวนของ /welcome ออกจากผลรวม) |
| `overflow-check` (เกณฑ์ทั้งชุด) | 324 | 360 ผ่านทั้งหมด | +36 ของ `/welcome` |
| px ใน scss ทั้ง `src` | 355 | 423 | +68 ทั้งหมดอยู่ใน `features/welcome/` (ดูหมายเหตุด้านล่าง) |
| initial bundle เว็บ | 517.39 kB / 137.51 kB | 517.84 kB / 137.61 kB | +0.45 kB |
| initial bundle native | 517.44 kB / 137.55 kB | 517.89 kB / 137.66 kB | +0.45 kB |
| lazy chunk ของ `/welcome` | — | 24,386 B raw / 6,775 B gzip | ชื่อ chunk เปลี่ยนทุก build ; รวมหน้า + ฉาก + เนิน + ของลอย + ชื่อ + ปุ่ม ; มาสคอต/กล่องคำพูดใช้ร่วมกับหน้าอื่น |

**หมายเหตุเรื่อง px ใน scss (+68):** ที่เพิ่มเกือบทั้งหมดคือพิกัดฉากและ keyframes ตามต้นแบบ (ระยะตกของน้องยาตรง ระยะลอย/โยกของของตกแต่ง ขนาดเมฆ/นก/ประกาย ระยะเลื่อนของเมฆและนก) ซึ่งเป็นระยะของการเคลื่อนไหวจึงใช้ px ตรงตามต้นแบบ ไม่ใช่ขนาดตัวอักษรหรือระยะของ layout (อันนั้นใช้ rem/clamp) · จำกัดอยู่ในคอมโพเนนต์ `features/welcome/` เท่านั้น — px ในไฟล์ scss นอก welcome ยังเท่าเดิมที่ 355 (นับด้วย `grep -rhoE "[0-9.]+px" src --include=*.scss --exclude-dir=welcome`) · เพดาน ≤ 353 ที่เขียนไว้ใน CLAUDE.md เกินมาก่อนงานนี้แล้วที่ 355 (นับที่ `5f5f190`) ไม่ได้เกินเพราะงานนี้ ; ถ้าจะทวงเพดานให้ต้องปรับเพดานหรือแยกนับ px ของฉากเคลื่อนไหว ไม่ใช่แก้ในงานนี้

