## เปลี่ยน tunnel จาก ngrok เป็น Tailscale Funnel (วันที่ 12)

**สถานะ: Draft** — merge โดยคาเด็ทก่อน 13:15 วันอังคาร 10 พ.ย. 2569 แล้วสลับตาม [`docs/day12-cutover.md`](day12-cutover.md) (ทำเสร็จก่อน 15:15)
แผนและคำตัดสิน: [`docs/day12-plan.md`](day12-plan.md)

### ในพีอาร์นี้
- `docker-compose.yml`: service `tunnel` = Tailscale Funnel (image pin `v1.104.4`, userspace, `tailscale/serve.json`) · ngrok ย้ายเป็น `tunnel-ngrok` (profile `tunnel-ngrok`, สำรอง) · volume `yatung_ts_state` เป็น `external` (`down -v` ไม่ลบ)
- `.env.example`: `TS_AUTHKEY`, `TS_PUBLIC_HOST` (ประกาศก่อน `PUBLIC_BASE_URL`/`VAPID_SUBJECT`)
- ความลับ: `secret-scan` จับ `tskey-…`, `TS_AUTHKEY` ค่าจริง, `*.ts.net` เต็ม ; `.env.*` (เช่น `.env.before-day12`) ถูก ignore และเป็นไฟล์ต้องห้าม ยกเว้น `.env.example`
- `scripts/demo-check.sh`: แสดง tunnel ที่รัน, URL ปิดชื่อ, key expiry (ไม่พบฟิลด์ = เหลือง "ไม่ทราบ"), `PUBLIC_BASE_URL` และ `VAPID_SUBJECT` ใน container ตรงกับ tunnel ที่รัน
- `scripts/test-tunnel.sh`: ตรวจจากภายนอกด้วย curl เปล่า (อ่านอย่างเดียว)
- เอกสาร: README, CLAUDE.md, `docs/day12-cutover.md` (ขั้นตอนทีละขั้น, ย้อนกลับ, state ห้ามหาย, PWA เครื่องอื่น)

### ไม่อยู่ในพีอาร์นี้ (ตั้งใจ)
ถอด `ngrok.interceptor`/header/html-guard/CORS/`tunnel-ngrok`/NGROK_* — ทำเป็นงานปิดท้ายหลังใช้ Funnel ครบ 7 วัน

### ผลทดสอบ ก่อน → หลัง (9 พ.ย. 16:30–17:00 ระบบยังใช้ ngrok ตามเดิม ไม่ได้แตะ service `tunnel`)

| รายการ | ก่อน | หลัง |
|---|---|---|
| `node --test` | 408 ผ่าน | 421 ผ่าน / 0 ไม่ผ่าน |
| `ng test` | 444 | 444 (ไม่มีโค้ด frontend เปลี่ยน ; รันครั้งก่อนหน้านี้) |
| `test-all.sh` (13 ชุด) | ผ่านทั้งหมด | ผ่านทั้งหมด (1407 วินาที ; ข้อมูลผู้ใช้จริงไม่เปลี่ยน) |
| first-screen-check | 830 / 0 | 830 / 0 |
| overflow-check (เต็ม) | 360 / 360 | 360 / 360 |
| state-check | 171 / 171 | 171 / 171 |
| review-e2e | 67 / 0 | 67 / 0 (รอบแรกหลัง recreate ได้ 66 / 1 รอบที่สองผ่าน 67 / 0 — ไม่ทราบข้อที่ล้ม ไม่ได้บันทึกไว้) |
| demo-check (เต็ม, Gemini 1 call) | พร้อมนำเสนอ | พร้อมนำเสนอ |

**ยังไม่ได้ทดสอบจริง (รอวันสลับ ขั้น 2–3):** รูปแบบ `serve.json`, Docker DNS จาก userspace networking ไป `frontend:80`, ฟิลด์ `Self.KeyExpiry` ของ `tailscale status --json`, `test-tunnel.sh` กับ Funnel จริง (ซ้อมแล้วกับ `http://localhost:8080` เท่านั้น)
