## สรุป

Day 7: แจ้งญาติเมื่อลืมกินยา (7A) · เตือนยาใกล้หมด (7B) · Web Push แจ้งเตือนบนเครื่อง (7C) พร้อม fix จากการทดสอบกับ LINE และมือถือจริง
แผนเต็มและคำตัดสิน: `docs/day7-plan.md`

### 7A — แจ้งญาติ
- cron ทุก 1 นาที (tab 7): เตือนผู้ป่วย → เตือนซ้ำ (`REMINDER_FOLLOWUP_MIN`, ปิดเป็นค่าเริ่มต้น) → แจ้งญาติ (`escalationService`)
- จองก่อนส่ง (`dose_escalations` UNIQUE dose+ผู้ดูแล) รันซ้อนกันได้ 1 ข้อความ · กันส่งย้อนหลังเป็นกอง · โควตา `escalation` ใช้ได้ถึงเพดานเต็ม
- Flex ญาติ: ปุ่ม "ยืนยันว่ากินแล้ว" (`source='caregiver'`) / "รับทราบ" · ปิดเรื่องเมื่อผู้ป่วยกินทีหลัง · "วันนี้" ของผู้ดูแล · ประวัติแจ้งล่าสุดในหน้า Settings
- cron 03:00 ปิดรอบค้างเป็น `missed` (ก่อนหน้านี้ไม่มีโค้ดตั้ง missed เลย) · โหมดเดโม `POST /api/demo/escalate-now`

### 7B — ยาใกล้หมด
- เกณฑ์เดียวทั้งระบบ (`stock-service.isLow`): `days_left ≤ refill_alert_days` ต่อยา (ค่าเริ่มต้นยาใหม่ 7), ยาเมื่อมีอาการ `remaining_qty ≤ 5` · เว็บใช้ `is_low` จาก API
- กันแจ้งซ้ำด้วย `refill_alerted_at` (จองก่อนส่ง) ล้างเมื่อพ้นเกณฑ์ · cron 09:00 (tab 9-Stock) · โหมดเดโม `POST /api/demo/low-stock-now`

### 7C — Web Push
- VAPID (`scripts/gen-vapid.mjs`), `pushService`, tab 8-Push (subscribe/test/take/notify), หน้า Settings 5 สถานะ
- เลือกช่องทาง: LINE → Web Push → ทั้งสอง · โควตา LINE เต็มแล้ว fallback ไป Web Push · payload ไม่มีชื่อยา
- ปุ่ม "✓ กินแล้ว": token อยู่ใน fragment `#take=` (ไม่เข้า access log)

## Fix ที่รวมใน PR นี้
- **เวลา "เลยมา"** บนการ์ดแจ้งญาติใช้ `now − scheduled_at` จริง (เดิมใช้ `max(late, escalate_after_min)`)
- **มื้อเดียวหลายเวลา**: "วันนี้" ของ LINE/เว็บแยกแถวตามเวลา
- **ข้อความ LINE** ตัดบรรทัดสวยบนจอ 360px + การ์ดปิดเรื่องแสดงเวลาที่กินจริงและช่องทาง
- **`#take=`**: ย้าย token จาก query string ไป fragment
- **1 dose ต่อ (มื้อ, วัน)**: เปลี่ยนเวลามื้อ = ย้ายแถวเดิม ไม่สร้างใหม่ · ตัวสร้างรอบทุกทางเช็ก `NOT EXISTS` · UNIQUE `uq_dose_med_slot_day` บน `scheduled_date` (`GENERATED ALWAYS … STORED NOT NULL`, migration 005 รันซ้ำได้) · `scripts/fix-duplicate-doses.mjs` (dry-run เป็นค่าเริ่มต้น; ล้างข้อมูลซ้ำของ Vitamin C แล้ว dry-run ซ้ำ = 0 กลุ่ม)
- **`gen-vapid`**: private key ถูกตัด 0 นำหน้าได้ 31 ไบต์ (~1/256) → เติมให้ครบ 32 ไบต์ + เทสกันถอยหลัง · `demo-check.sh` ตรวจคีย์ (32/65 ไบต์ ขึ้นต้น 0x04 เป็นคู่กัน) โดยไม่แสดงค่า
- **Web Push ไป Apple ETIMEDOUT**: Node 20 ให้เวลาต่อ IP ละ 250 ms สั้นกว่า RTT ไป `web.push.apple.com` (~0.6 วินาที) → ตั้ง `setDefaultAutoSelectFamilyAttemptTimeout(3000)` ใน `settings.js`
- ส่ง Web Push ลองใหม่เมื่อเครือข่ายสะดุด + log code สาเหตุ

## คำตัดสินในส่วนที่ 3 ของ `docs/day7-plan.md`
1. ปุ่ม "กินแล้ว" บน push: ทาง A (`/today#take=<token>` → `POST /api/push/take`) token อยู่ใน fragment
2. เกณฑ์ใกล้หมด = `refill_alert_days` ต่อยา (ไม่มี `LOW_STOCK_DAYS`), PRN ใช้ `LOW_STOCK_QTY_PRN`
3. ใช้ `refill_alerted_at` เดิม และตรวจทุกที่ที่แก้ `remaining_qty`
4. escalation อยู่ tab 7-LINE · ยาใกล้หมดอยู่ tab 9-Stock
5. โควตา LINE เต็ม + มี subscription → fallback Web Push
6. คง `source='push'`; เว็บแสดงเป็น "จากการแจ้งเตือนบนเครื่อง" / "ญาติยืนยันแล้ว"
7. `escalate-now` ในกลุ่มที่ส่งแล้ว = 409 พร้อมข้อความไทย; `{force:true}` ส่งซ้ำได้ (เฉพาะ DEMO_MODE)
8. ทดสอบ iPhone จริงตอนจบ 7C (ผู้ใช้รัน `gen-vapid.mjs` เอง)
9. ปิดรอบค้างเป็น `missed` (cron 03:00)
10. 1 dose ต่อ (มื้อ, วัน) — ดูหัวข้อ fix ด้านบน

## ผลทดสอบ (`bash scripts/test-all.sh` บน `2db0d3f`, 1273 วินาที)
| ชุด | ผ่าน | ไม่ผ่าน |
|---|---|---|
| unit | 296 | 0 |
| 3a | 92 | 0 |
| 4 | 166 | 0 |
| 5 | 98 | 0 |
| 6 | 135 | 0 |
| 6b | 133 | 0 |
| 6c | 115 | 0 |
| 7a | 140 | 0 |
| 7b | 84 | 0 |
| 7c | 180 | 0 |

หมายเหตุ: ชุด 4 ใช้ LINE จริงและ cron จริง การตรวจ "ข้อมูลผู้ใช้จริง" ขึ้น ✘ เพราะระหว่างรันมีเหตุการณ์จริง (cron แจ้งผู้ดูแล 20:46:00 และผู้ดูแลกดยืนยันผ่าน LINE 20:46:17) ไม่ใช่ผลของเทส · ชุดที่ใช้ LINE ปลอมตรวจข้อมูลจริงตรงทุกชุด
`demo-check.sh` ผ่านทั้งหมด

## ทดสอบกับของจริง
- **LINE จริง**: แจ้งญาติ/ปิดเรื่อง/ปุ่มยืนยัน, เวลา "เลยมา", มื้อหลายเวลา, ข้อความ 360px (ผลทำให้เกิด fix 7A ข้างต้น)
- **มือถือจริง**: iPhone (เพิ่มลงหน้าจอโฮม) และ Android (ปุ่ม action "✓ กินแล้ว") ได้รับ Web Push และกดยืนยันได้ · พบ ETIMEDOUT ไป Apple ระหว่างทดสอบและแก้แล้ว (ดู fix ด้านบน)

## ยกไปวันที่ 8
- หน้า Dashboard adherence 7 วัน (`/overview` ยังเป็น placeholder, tab 5 ยังจอง)
- TTS อ่านรายละเอียดยา
- Capacitor/Android Studio, PWA ตรวจรอบสุดท้าย (วันที่ 9)
- `today.page.scss` เกินงบ 4 kB อยู่ 118 ไบต์ (warning ของ build)
- ถ้า ngrok ฟรียังมีปัญหากับ service worker ให้ย้ายไป Cloudflare Tunnel
- (เสร็จแล้วใน branch chore/remove-tracked-secrets) เอา `.sessions.json` และ `.config.users.json.backup` ออกจาก git + hook กันความลับ

ห้าม merge จนกว่าจะรีวิวเสร็จ

🤖 Generated with [Claude Code](https://claude.com/claude-code)
