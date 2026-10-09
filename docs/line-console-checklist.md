# Checklist: ตั้งค่า LINE Developers Console แล้วทดลองแจ้งเตือน (วันที่ 6)

ทำตามลำดับ ติ๊กทีละข้อ — ข้อ 0 ต้องผ่านก่อนเสมอ

## 0. ก่อนเริ่ม (บนเครื่องที่รันระบบ)
- [ ] `.env` มี `NGROK_AUTHTOKEN`, `NGROK_DOMAIN` และบรรทัด `PUBLIC_BASE_URL=https://${NGROK_DOMAIN}` อยู่ **หลัง** `NGROK_DOMAIN=` (ถ้าอยู่ก่อน ค่าจะว่าง)
- [ ] `.env` มี `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` (long-lived), `LINE_OA_BASIC_ID` (ขึ้นต้น `@`)
- [ ] **เปลี่ยนรหัส editor แล้ว:** `NODE_RED_ADMIN_HASH` ไม่ใช่ค่าตัวอย่าง `demo1234` (ห้ามเปิด tunnel ถ้ายังไม่เปลี่ยน)
- [ ] `docker compose up -d --build` แล้วเปิด tunnel: `docker compose --profile tunnel up -d`
- [ ] `docker compose up -d --build frontend` (ถ้าเพิ่งแก้หน้าเว็บ — หน้าเว็บใน container ไม่อัปเดตเอง)
- [ ] รัน `bash scripts/demo-check.sh` ต้องไม่มีข้อ ✗ (เช็ก tunnel, `PUBLIC_BASE_URL`, รูปน้องยาตรง, โควตา)
- [ ] เปิด `https://<NGROK_DOMAIN>` ในเบราว์เซอร์ 1 ครั้ง ถ้าเจอหน้า ngrok ให้กด **Visit Site** (ngrok ฟรีแสดงหน้านี้ครั้งแรกเท่านั้น; ไม่กระทบ LINE webhook)

## 1. ตั้ง Webhook URL
- [ ] LINE Developers Console → เลือก Channel ของ Official Account → แท็บ **Messaging API**
- [ ] ช่อง **Webhook URL** ใส่ `https://<NGROK_DOMAIN>/line/webhook` (แทน `<NGROK_DOMAIN>` ด้วยโดเมนจริง) แล้วกด **Update**

## 2. กด Verify
- [ ] กดปุ่ม **Verify** ต้องขึ้น **Success** (ระบบตอบ 200 ให้ events ว่าง)
- [ ] ถ้าไม่ผ่าน: ดู http://127.0.0.1:4040 (ngrok inspector) ว่ามี request เข้ามาไหม และ `docker compose logs nodered` — `401` = Channel secret ใน `.env` ไม่ตรง (แก้แล้ว `docker compose up -d --force-recreate nodered`)

## 3. เปิด Use webhook
- [ ] เปิดสวิตช์ **Use webhook**
- [ ] (แนะนำ) ปิด **Auto-reply messages** และ **Greeting messages** ใน LINE Official Account Manager เพื่อไม่ให้ซ้อนกับข้อความของน้องยาตรง

## 4. เพิ่มเพื่อน
- [ ] สแกน QR ของ Official Account (แท็บ Messaging API) หรือกดลิงก์เพิ่มเพื่อนในหน้า ตั้งค่า → เชื่อม LINE
- [ ] ต้องได้ข้อความต้อนรับจากน้องยาตรงพร้อมวิธีเชื่อมบัญชี 3 ขั้น

## 5. เชื่อมบัญชี
- [ ] เปิดแอป → **ตั้งค่า → เชื่อม LINE → รับรหัสเชื่อม LINE**
- [ ] กด **เปิด LINE แล้วกดส่ง** (หรือสแกน QR) — รหัสจะถูกพิมพ์ในแชทให้แล้ว กดส่ง
- [ ] หน้าแอปเปลี่ยนเป็น "เชื่อม LINE สำเร็จแล้ว" พร้อมชื่อ LINE ภายในไม่กี่วินาที และได้ข้อความยินดีในแชท
- [ ] พิมพ์ **วันนี้** ในแชท ได้สรุปยาของวันนี้

## 6. ทดลองส่งเตือน
- [ ] ใน `.env` ตั้ง `DEMO_MODE=true` แล้ว `docker compose up -d --force-recreate nodered` (ตอนใช้งานจริงตั้งเป็น `false`)
- [ ] ให้บัญชีมียาที่มีรอบวันนี้ยังไม่กิน (เพิ่มยา หรือกด "ยกเลิก" ของรอบที่กินไปแล้วในหน้าวันนี้)
- [ ] หน้า **ตั้งค่า → โหมดเดโม → ทดลองส่งเตือนตอนนี้**
- [ ] ในแชท LINE ได้ข้อความ "ถึงเวลากินยามื้อ…แล้วนะคะ" มีรูปน้องยาตรง ชื่อยาตัวใหญ่ ปุ่มเขียว **✓ กินแล้ว** และปุ่ม **เปิดแอป**
- [ ] ถ้ารูปน้องยาตรงไม่ขึ้น: ตั้ง `LINE_MASCOT_URL` เป็นลิงก์ https ของรูปที่โฮสต์ที่อื่น (ดู `docs/line-console-checklist.md` ข้อ 0 และ README)

## 7. กด "กินแล้ว"
- [ ] กดปุ่ม **✓ กินแล้ว** ในข้อความ → ได้คำตอบ "บันทึกแล้วค่ะ ✓ กินยา N รายการ เมื่อ HH:MM น."
- [ ] เปิดหน้า **วันนี้** ในแอป รอบนั้นเป็น "กินแล้ว" และจำนวนยาคงเหลือลดลง
- [ ] กดปุ่มซ้ำ → ได้ "บันทึกไว้แล้วค่ะ ✓" และจำนวนยาไม่ลดซ้ำ
- [ ] ปุ่ม **เปิดแอป**: ครั้งแรกอาจเจอหน้า ngrok ให้กด Visit Site

## ตรวจโควตาข้อความ
- [ ] `bash scripts/demo-check.sh` แสดง โควตาจริงจาก LINE / ใช้ไป / เหลือสำหรับเตือน / เหลือสำหรับแจ้งญาติ — แพ็กเกจฟรี 200 ข้อความ/เดือน (ข้อความตอบกลับ reply ไม่นับ)
