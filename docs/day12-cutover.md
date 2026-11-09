# วันที่ 12 — ขั้นตอนสลับ tunnel จาก ngrok เป็น Tailscale Funnel (สำหรับคาเด็ท)

เอกสารนี้บอกทีละขั้นว่า **ต้องกดอะไรตรงไหน** · แผนและเหตุผล: [`day12-plan.md`](day12-plan.md) · ทุกคำสั่งรันในโฟลเดอร์ `D:\yatung`

> **กฎ 4 ข้อ**
> 1. **ห้ามวางค่า key / ชื่อ `*.ts.net` เต็มในแชท** (ใส่ใน `.env` เองเท่านั้น) — ถ้าต้องบอกผม ให้บอกแค่ว่า "ใส่แล้ว" หรือข้อความ error
> 2. **ห้ามลบ volume `yatung_ts_state`** (ดูข้อ "state ของ tunnel" ท้ายเอกสาร)
> 3. คำสั่งที่รีสตาร์ต/สร้าง container ใหม่ของ `nodered` และคำสั่งที่เรียก LINE จริง **ให้บอกผมก่อน** ผมจะเช็กเวลาและยืนยัน (ไม่ทำช่วงใกล้มื้อยา, 23:50–00:15, 02:55–03:10)
> 4. ถ้าติดขัดเกิน ~45 นาที หรือทับซ้อน ngrok+Funnel เกิน 60 นาที → **หยุดแล้วบอกผม** อย่าลองมั่ว

**วันที่ทำ: อังคาร 10 พ.ย. 2569 เริ่ม 13:15 ให้จบก่อน 15:15** (ผมจะ SELECT เวลามื้อซ้ำก่อนเริ่ม ถ้าไม่ว่างวันนั้นบอกเวลาใหม่ในช่วง 12:30–15:30 หรือ 08:30–11:30)

| ขั้น | เวลาโดยประมาณ | สรุป |
|---|---|---|
| 0 | ก่อนวันสลับ (หรือวันเดียวกันก่อน 13:15) | สมัคร/ตั้งค่า Tailscale, สร้าง key, เตรียม `.env` |
| 1 | 13:15 | ย้าย ngrok ไปเป็น service สำรอง (ngrok ดับไม่กี่วินาที) |
| 2 | 13:20 | เปิด Tailscale ขณะ ngrok ยังรัน · ปิด key expiry · รอ DNS |
| 3 | 13:35 | ทดสอบจากภายนอก + มือถือ 4G/5G |
| 4 | 13:45 | เปลี่ยน `PUBLIC_BASE_URL` แล้วรีสตาร์ต nodered (ผมทำ หลังคุณอนุมัติ) |
| 5 | 13:50 | เปลี่ยน Webhook URL ใน LINE Console → Verify |
| 6 | 13:55 | หยุด ngrok · เปลี่ยน rich menu (ผมทำ หลังคุณอนุมัติ) |
| 7 | 14:00 | ติดตั้ง PWA ใหม่บน S23 FE + เปิดแจ้งเตือน |
| 8 | หลังยืนยัน push ใหม่ได้ | ลบไอคอนเก่า |
| 9–10 | วันที่ 3 / วันที่ 7 | เก็บ subscription เก่า / งานปิดท้าย |

ช่วงที่ ngrok กับ Funnel รันพร้อมกันได้คือ **ขั้น 2–6 เท่านั้น**

---

## ขั้น 0 — ตั้งค่า Tailscale (ทำเมื่อไรก็ได้ ไม่กระทบระบบ)

### 0.1 สมัคร
1. เปิดเบราว์เซอร์ไปที่ <https://login.tailscale.com/start>
2. กดสมัครด้วยบัญชี Google / Microsoft / GitHub / Apple บัญชีใดบัญชีหนึ่ง (แพ็กเกจ **Personal ฟรี** ไม่ต้องใส่บัตร)
3. ถ้ามีหน้าให้ "Add your first device" **ข้ามได้** (เราไม่ติดตั้งแอป Tailscale บนพีซี — ใช้ container)

### 0.2 (ไม่บังคับ) เปลี่ยนชื่อ tailnet — **ต้องทำตอนนี้ ก่อนเปิด Funnel ครั้งแรกเท่านั้น**
> ⚠ ชื่อ tailnet อยู่ในชื่อเว็บ (`yatung.<ชื่อ tailnet>.ts.net`) ถ้าเปลี่ยนทีหลัง URL เปลี่ยน = ต้องติดตั้ง PWA ใหม่ + เปลี่ยน Webhook ใหม่ทั้งหมด
1. เมนูบนสุดกด **DNS** (<https://login.tailscale.com/admin/dns>)
2. ในส่วน **Tailnet name** กด **Rename tailnet…** เลือกชื่อที่ชอบ (ไม่จำเป็น ถ้าพอใจชื่อสุ่มก็ข้าม)

### 0.3 เปิด MagicDNS และ HTTPS
1. หน้า **DNS** เดิม เลื่อนหา **MagicDNS** → ต้องเป็น **Enabled** (ถ้าไม่ใช่ กด Enable)
2. เลื่อนลงหา **HTTPS Certificates** → กด **Enable HTTPS…**
3. จะมีข้อความเตือนว่า "ชื่อเครื่องและชื่อ tailnet จะถูกเผยแพร่ใน Certificate Transparency log" → ชื่อเครื่องของเราคือ `yatung` ไม่มีข้อมูลอ่อนไหว → กดยืนยัน

### 0.4 เปิดสิทธิ์ Funnel (ACL)
1. เมนูบนสุดกด **Access controls** (<https://login.tailscale.com/admin/acls/file>)
2. ดูว่ามีส่วนที่ชื่อ **Funnel** / ข้อความเกี่ยวกับ Funnel พร้อมปุ่มเช่น **Add Funnel to policy** → ถ้ามีให้กด แล้วกด **Save**
3. ถ้าไม่เห็นปุ่มและไม่แน่ใจ → **ห้ามแก้ไฟล์ policy เอง** บอกผมว่าเห็นอะไร (ค่าเริ่มต้นของ Tailscale ให้สมาชิกใช้ Funnel ได้อยู่แล้ว ถ้าเปิดใช้ไม่ได้ ขั้น 2 จะมี error บอก)

### 0.5 สร้าง auth key (ใช้ครั้งเดียว)
1. เมนูบนสุดกด **Settings** → เมนูซ้ายกด **Keys** (<https://login.tailscale.com/admin/settings/keys>)
2. ส่วน **Auth keys** กด **Generate auth key…**
3. ตั้งค่า:
   - **Description:** `yatung`
   - **Reusable:** **ปิด** (ใช้ครั้งเดียว)
   - **Ephemeral:** **ปิด**
   - **Pre-approved:** **เปิด** (ถ้ามีตัวเลือกนี้)
   - **Expiration:** **1 วัน** ถ้าทำขั้น 0 วันเดียวกับวันสลับ · **7 วัน** ถ้าทำล่วงหน้า
   - **Tags:** ไม่ต้องเลือก
4. กด **Generate key** → จะเห็นข้อความขึ้นต้น `tskey-auth-…` **แสดงครั้งเดียว** → กดปุ่มคัดลอก (ยังไม่ปิดหน้าต่าง) แล้วไปขั้น 0.6 ทันที

### 0.6 ใส่ค่าใน `.env` (ทำเอง ห้ามวางในแชท)
1. เปิดไฟล์: `notepad .env` (รันในโฟลเดอร์ `D:\yatung`)
2. หาบรรทัด `PUBLIC_BASE_URL=…` (ตอนนี้ยังเป็นของ ngrok — **ยังไม่แก้**) แล้วเพิ่ม 2 บรรทัดนี้ **ไว้เหนือมัน** (ซึ่งอยู่เหนือ `VAPID_SUBJECT=` ด้วยอยู่แล้ว):
   ```
   TS_AUTHKEY=วางค่า key ที่คัดลอกไว้ตรงนี้
   TS_PUBLIC_HOST=
   ```
   (`TS_PUBLIC_HOST` เว้นว่างก่อน — ชื่อจริงจะรู้ในขั้น 2)
3. กด Ctrl+S แล้วปิด Notepad · ปิดหน้าต่างเบราว์เซอร์ของ key ได้
4. สร้างที่เก็บ state (ครั้งเดียว):
   ```bash
   docker volume create yatung_ts_state
   ```

> เสร็จขั้น 0 — ระบบยังใช้ ngrok ตามเดิม ไม่มีอะไรเปลี่ยน

---

## ขั้น 1 — ย้าย ngrok ไปเป็น service สำรอง (13:15)

**ก่อน 13:15 (คาเด็ททำ):** merge PR วันที่ 12 เข้า `main` แล้วรัน `git switch main && git pull` ในโฟลเดอร์ `D:\yatung` (ขั้นนี้ frontend ไม่ต้อง build ใหม่)

**ก่อนรันคำสั่งขั้น 1 ต้องเช็กสถานะเดิมก่อน:**
```bash
docker compose ps
```
ต้องเห็น service `tunnel` (ngrok **ตัวเก่า**) สถานะ running · ถ้าไม่เห็นหรือไม่ running → **หยุด บอกผม** (อย่ารันคำสั่งข้างล่าง) · แล้วบอกผมว่า "เริ่มขั้น 1" ผมจะเช็กเวลา/มื้อซ้ำก่อน

```bash
docker compose --profile tunnel stop tunnel
docker compose --profile tunnel-ngrok up -d tunnel-ngrok
docker compose --profile tunnel rm -f tunnel
bash scripts/demo-check.sh
```
- 3 บรรทัดแรก: หยุด ngrok เดิม → เปิดใหม่ในชื่อ `tunnel-ngrok` (ngrok ดับ ~10–20 วินาที) → ลบ container เก่าที่หยุดแล้ว
- `demo-check.sh` หัวข้อ 7 ต้องเห็น "tunnel (ngrok สำรอง) รันอยู่" · ถ้า ngrok ไม่ขึ้น ดู `docker compose --profile tunnel-ngrok logs tunnel-ngrok`

---

## ขั้น 2 — เปิด Tailscale ขณะ ngrok ยังรัน (13:20)

```bash
docker compose --profile tunnel up -d tunnel
docker compose --profile tunnel logs --tail 40 tunnel
```
- ไม่ควรมีบรรทัด error · ถ้าเห็นลิงก์ให้ล็อกอิน หรือข้อความเรื่อง auth key/ACL/Funnel → **ก๊อปข้อความ (ไม่ใช่ key) มาบอกผม**

### 2.1 ดูชื่อเต็มของเครื่อง
1. เบราว์เซอร์ไปที่ <https://login.tailscale.com/admin/machines>
2. ต้องเห็นเครื่องชื่อ **`yatung`** (สถานะ Connected) — ถ้าเป็น `yatung-1` แปลว่ามีเครื่องชื่อ `yatung` อยู่ก่อนแล้ว บอกผมก่อนทำต่อ
3. กดที่ชื่อ `yatung` → หา **Full domain** / **DNS name** ที่ลงท้าย `.ts.net` → กดไอคอนคัดลอก

### 2.2 ใส่ชื่อเต็ม + ลบ key ออกจาก `.env`
1. `notepad .env`
2. บรรทัด `TS_PUBLIC_HOST=` → วางชื่อเต็ม (ไม่มี `https://`, ไม่มี `/` ท้าย)
3. บรรทัด `TS_AUTHKEY=…` → **ลบทั้งบรรทัด หรือลบค่าให้เหลือ `TS_AUTHKEY=`** (key ใช้เสร็จแล้ว ไม่เก็บไว้)
4. Ctrl+S แล้วใช้คำสั่ง (ไม่กระทบ state):
   ```bash
   docker compose --profile tunnel up -d tunnel
   ```

### 2.3 ปิด key expiry (สำคัญ — ไม่งั้น tunnel จะหลุดเงียบๆ ใน ~180 วัน)
1. หน้า <https://login.tailscale.com/admin/machines> หาแถว `yatung`
2. กดปุ่ม **⋯** (จุดสามจุด) ที่ปลายแถวด้านขวา → เลือก **Disable key expiry**
3. กลับมาดูแถวนั้น ต้องมีป้าย/ข้อความ **"Expiry disabled"**
4. **ผมตรวจชื่อฟิลด์จริงก่อนไปขั้น 3:** รัน `docker compose --profile tunnel exec tunnel tailscale status --json` ดูว่ามี `Self.KeyExpiry` จริงไหมและค่าเป็นอย่างไรหลังปิด expiry แล้ว (ผมดูเฉพาะชื่อฟิลด์/ค่าวันที่ ไม่แสดง key/ชื่อเต็ม) · ถ้า `demo-check.sh` อ่านผิดผมจะแก้สคริปต์ด้วย commit `fix(scripts): …` ก่อนทำต่อ
5. ตรวจด้วย `bash scripts/demo-check.sh` → หัวข้อ 7:
   - เขียว "key expiry ของเครื่อง yatung ปิดอยู่" = ผ่าน
   - เหลือง "ไม่ทราบ" = สคริปต์อ่านฟิลด์ไม่ได้ → ยึดป้าย "Expiry disabled" ใน admin console (ข้อ 3) เป็นหลัก
   - เหลือง "ยังเปิดอยู่" = ยังไม่ได้ปิด ทำข้อ 2 ซ้ำ

### 2.4 รอ DNS
- Funnel ใหม่อาจใช้เวลาถึง **~10–15 นาที** กว่าชื่อจะเปิดจากภายนอกได้ — ระหว่างรอ ngrok ยังรับ LINE อยู่ จึงไม่มีช่วงขาด
- ตรวจว่า Funnel เปิดอยู่: `bash scripts/demo-check.sh` ต้องเห็น "Funnel เปิดอยู่ (AllowFunnel=true)"

---

## ขั้น 3 — ทดสอบจากภายนอก (13:35)

```bash
bash scripts/test-tunnel.sh
```
- ต้องผ่านทุกข้อ (ผมจะรายงานตัวเลข เวลาโหลดไฟล์ใหญ่สุด เกณฑ์ ≤ 10 วินาที)
- ถ้า `/api/config` ได้ HTML หรือเปิดไม่ได้ ให้รออีกสักพัก (DNS) แล้วรันซ้ำ · ถ้าเกิน 15 นาทีบอกผม

**ทดสอบบนมือถือ (S23 FE):**
1. ปิด Wi-Fi เปิด 4G/5G
2. เปิด Chrome ไปที่ `https://<ชื่อเต็ม>` (พิมพ์เอง ไม่ต้องแชร์ให้ใคร)
3. **จับเวลา** ตั้งแต่กด Enter จนเห็นหน้าต้อนรับ (หรือหน้าแอป) แล้วจดตัวเลขไว้บอกผม (ไม่มีเกณฑ์ผ่าน/ตก แค่จดไว้) · ยังไม่ต้องล็อกอิน
4. ต้องไม่เจอหน้าเตือนแบบ ngrok "Visit Site"

---

## ขั้น 4 — เปลี่ยน `PUBLIC_BASE_URL` และ VAPID subject (13:45)

1. **สำรองก่อนแก้** (ใช้ย้อนกลับ) — คัดลอกเฉพาะ 2 บรรทัดเดิมไปไฟล์ใหม่:
   ```bash
   grep -E '^(PUBLIC_BASE_URL|VAPID_SUBJECT)=' .env > .env.before-day12
   ```
   ไฟล์นี้ถูก `.gitignore` และ `check-secrets` กันไม่ให้ commit · เปิดดูด้วยตาได้ แต่ห้ามวางในแชท
2. `notepad .env` แก้ 2 บรรทัด (ถ้ามีอยู่แล้วให้เปลี่ยน):
   ```
   PUBLIC_BASE_URL=https://${TS_PUBLIC_HOST}
   VAPID_SUBJECT=https://${TS_PUBLIC_HOST}
   ```
   และตรวจว่าบรรทัด `TS_PUBLIC_HOST=` อยู่ **เหนือทั้ง** `PUBLIC_BASE_URL=` **และ** `VAPID_SUBJECT=` (ถ้าลำดับสลับ ค่าจะว่าง — Compose แทนค่าจากตัวแปรที่ประกาศก่อนหน้าเท่านั้น ; `VAPID_SUBJECT` อยู่ล่างในไฟล์ จึงต้องดูให้ชัวร์)
3. Ctrl+S แล้วบอกผมว่า "แก้ .env แล้ว" → ผมเช็กเวลา (ต้องไม่ใกล้มื้อ) แล้วขออนุมัติรัน `docker compose up -d --force-recreate nodered`
4. หลัง nodered ขึ้น: `bash scripts/demo-check.sh` → หัวข้อ 7 ต้องเห็นเขียวทั้ง `PUBLIC_BASE_URL` และ `VAPID_SUBJECT` (ไม่ว่าง · ไม่มี `${` ค้าง · ขึ้นต้น `https://` · ตรงกับ tunnel ที่รัน) ถ้าแดง = ลำดับตัวแปรใน `.env` ผิด แก้แล้ว recreate ใหม่ (ถามผมก่อน)

---

## ขั้น 5 — เปลี่ยน Webhook ใน LINE Developers Console (13:50)

1. เปิด <https://developers.line.biz/console/> ล็อกอิน
2. เลือก **Provider** ของคุณ → เลือก **Channel** แบบ Messaging API ของน้องยาตรง
3. แท็บ **Messaging API** → เลื่อนหา **Webhook settings**
4. ช่อง **Webhook URL** กด **Edit** → วาง `https://<ชื่อเต็ม>/line/webhook` (ลงท้าย `/line/webhook`) → **Update**
5. กด **Verify** → ต้องขึ้น **Success**
   - ไม่ผ่าน: ตรวจว่า URL พิมพ์ถูก, `bash scripts/test-tunnel.sh` ยังผ่านไหม, แล้วบอกผม (ngrok ยังรันอยู่ จึงยังไม่มีอะไรเสียหาย — ย้อนกลับด้วยการใส่ URL ngrok เดิม)
6. **Use webhook** ต้องเป็น **เปิด**
7. (ไม่บังคับ) ลองพิมพ์ "วันนี้" ในแชท LINE ของน้องยาตรง → ต้องได้คำตอบ

---

## ขั้น 6 — หยุด ngrok และอัปเดต rich menu (13:55)

บอกผมว่า "Verify ผ่านแล้ว" ผมจะ:
1. ให้คุณรัน `docker compose --profile tunnel-ngrok stop tunnel-ngrok` (หยุด ngrok — ต่อไปนี้มี tunnel ตัวเดียว)
2. รัน `node scripts/line-richmenu.mjs --dry-run` ให้ดูก่อน แล้ว **ถามคุณก่อน** รันจริง (เรียก LINE API: ลบเมนูชื่อเดิม สร้างใหม่ ตั้งเป็นเมนูของทุกคนที่เพิ่ม OA — ไม่ส่งข้อความหาใคร ปุ่มกลางจะชี้ URL ใหม่)

---

## ขั้น 7 — ติดตั้ง PWA ใหม่บน S23 FE (14:00)

1. เปิด Chrome ไปที่ `https://<ชื่อเต็ม>` (ใช้ Wi-Fi หรือ 4G ก็ได้)
2. กดเมนู **⋮** มุมขวาบน → **Add to Home screen** / **Install app** → **Install**
   (ตอนนี้จะมี **ไอคอนซ้ำ 2 อัน** ชื่อเหมือนกัน — ตัวเก่าชี้ ngrok ที่ปิดไปแล้ว)
3. เปิดไอคอน **ตัวใหม่** → ล็อกอินบัญชี **"การ์ตูน"** (ต้องล็อกอินใหม่ เพราะเป็นแอปใหม่ในสายตาเบราว์เซอร์)
4. ไปที่ **ตั้งค่า → แจ้งเตือนบนเครื่องนี้** → เปิด → กด **อนุญาต** เมื่อ Android ถามสิทธิ์แจ้งเตือน
5. ทดลองรับแจ้งเตือน — **ใช้ปุ่มทดสอบเดิมในการ์ดนี้เท่านั้น**: ในแผ่น "แจ้งเตือนบนเครื่องนี้" กดปุ่ม **"ทดลองส่งแจ้งเตือน"** (เรียก `POST /api/push/test` → `pushService.sendTest` : ส่ง Web Push อย่างเดียว **ไปทุกเครื่องที่บัญชีนี้ subscribe ไว้** ไม่ใช่เฉพาะเครื่องที่กด ; ไม่แตะ `dose_logs`/`reminded_at`/`dose_escalations` ไม่ส่ง LINE ; ผลข้างเคียงมีแค่แถว `notification_logs` (channel `web_push`, kind `other`) และ `push_subscriptions.last_success_at/fail_count`) → **เครื่องใหม่ต้องได้แจ้งเตือน** (ถ้าไอคอนเก่ายังมี subscription จะได้แจ้งเตือนซ้ำอีกอัน = ปกติ ดูขั้น 8 ; ถ้าเครื่องเก่าตอบ 404/410 ระบบลบ subscription นั้นเอง)
   > ⛔ **ห้ามใช้ปุ่ม "ทดลองส่งเตือนตอนนี้"** (โหมดเดโม, `remind-now`) กับบัญชี "การ์ตูน" — ปุ่มนั้นส่งการ์ดเตือนยาจริงเข้า LINE และจองรอบยา (`reminded_at`) ของผู้ใช้จริง
6. บอกผมว่า "ตัวใหม่ได้ push แล้ว" (ขั้น 8 ลบไอคอนเก่า ทำหลังยืนยันข้อนี้เท่านั้น · ถ้าอยากยืนยันซ้ำ ให้รอแจ้งเตือนมื้อ 18:00 จริงอีกครั้ง ไม่บังคับ)

---

## ขั้น 8 — ลบไอคอนเก่า (หลังยืนยันว่าตัวใหม่ได้ push แล้วเท่านั้น)

1. หาไอคอนที่ **เปิดแล้วขึ้นหน้าว่าง/ออฟไลน์/เข้าไม่ได้** = ตัวเก่า (ตัวใหม่เปิดได้ปกติ)
2. กดค้างที่ไอคอนตัวเก่า → **Uninstall** (หรือ Remove)
3. ครั้งถัดไปที่ระบบส่งแจ้งเตือน เครื่องเก่าจะตอบ 404/410 และระบบ **ลบแถว subscription เก่าออกเอง** (ดูขั้น 9 ถ้าไม่หาย)

---

## เครื่องอื่นที่เคยติดตั้ง PWA (iPhone ฯลฯ — ไม่บังคับวันนี้)

ทุกเครื่องที่ติดตั้งแอปจากลิงก์ ngrok จะค้างที่ origin เก่า (ลิงก์ ngrok ปิดแล้ว) ต้องทำเหมือนขั้น 7 ต่อเครื่อง:
1. เปิด `https://<ชื่อเต็ม>` ในเบราว์เซอร์ของเครื่องนั้น (iPhone = **Safari**) → ติดตั้งใหม่ (iPhone: แชร์ → เพิ่มลงหน้าจอโฮม)
2. ล็อกอินใหม่ (JWT/localStorage ไม่ย้ายข้าม origin) → เปิดแจ้งเตือนบนเครื่องนี้ใหม่
3. ลบไอคอนเก่าหลังยืนยันว่าตัวใหม่ได้ push (ขั้น 8)
- เครื่องที่ยังไม่ทำ: แจ้งเตือนผ่าน LINE ยังใช้ได้ปกติ (ไม่ขึ้นกับ origin) · push ของไอคอนเก่าจะเงียบไปเอง/ถูกลบตามขั้น 9
- iPhone ที่เคย "ค้าง" ตามหัวข้อใน README ไม่ต้องกู้แบบเดิม เพราะไม่มีหน้าเตือน ngrok อีกแล้ว

## ขั้น 9 — เก็บ subscription เก่า (วันที่ 3 หลังสลับ)

ถ้าครบ 3 วันแล้วยังได้แจ้งเตือนซ้ำ หรือ `demo-check.sh` ยังนับเครื่องเกิน → บอกผม ผมจะ `SELECT` แถวของ user 152 มาให้ดู (ไม่แสดง endpoint เต็ม) แล้ว **ขออนุมัติ DELETE เป็นรายแถว**

## ขั้น 10 — งานปิดท้าย (วันที่ 7 หลังสลับ ถ้าไม่มีปัญหา)

บอกผม ผมจะเสนอ PR ถอด `ngrok.interceptor` + header, html-guard + แถบ "การเชื่อมต่อหมดอายุ", CORS ของ apk, `tunnel-ngrok`, NGROK_*, `test-cors-native.sh` พร้อมกัน

---

## ย้อนกลับไป ngrok (ถ้า Funnel มีปัญหา)

**ก่อนขั้น 5** (ยังไม่เปลี่ยน Webhook): ไม่ต้องทำอะไร — ngrok ยังรับ LINE อยู่ แค่หยุด Funnel: `docker compose --profile tunnel stop tunnel`

**หลังขั้น 5:**
1. เปิด ngrok (ถ้าหยุดไว้): `docker compose --profile tunnel-ngrok up -d tunnel-ngrok`
2. `notepad .env` → เปิด `.env.before-day12` (สำรองไว้ในขั้น 4) แล้วคัดลอก 2 บรรทัด `PUBLIC_BASE_URL=…` และ `VAPID_SUBJECT=…` กลับไปแทนที่ในบรรทัดเดียวกันใน `.env` (ห้ามเดาค่าเอง)
3. บอกผม → ผมขออนุมัติรัน `docker compose up -d --force-recreate nodered`
4. LINE Developers Console → Messaging API → Webhook URL → **Edit** → ใส่ `https://<NGROK_DOMAIN>/line/webhook` → **Update** → **Verify** ต้อง Success
5. rich menu: บอกผม ผมจะรัน `node scripts/line-richmenu.mjs` ใหม่ (ตอนนี้ `.env` ชี้ ngrok จึงได้ปุ่มกลางชี้ ngrok) ตามที่คุณอนุมัติ
6. หยุด Funnel: `docker compose --profile tunnel stop tunnel` (**ห้าม** ลบ volume — เก็บไว้ลองใหม่ทีหลังโดย URL เดิม)
7. PWA: ไอคอนเก่า (ngrok) ใช้ต่อได้ถ้ายังไม่ได้ลบ · ไอคอนใหม่ (Funnel) จะใช้ไม่ได้ขณะ Funnel หยุด

---

## state ของ tunnel — ห้ามหาย

- เครื่อง `yatung` ใน Tailscale เก็บตัวตนไว้ใน Docker volume ชื่อ **`yatung_ts_state`**
- ถ้า volume หาย → Tailscale สร้างเครื่องใหม่ชื่อ `yatung-1` → **URL เปลี่ยน** (ต้องติดตั้ง PWA ใหม่และเปลี่ยน Webhook ใหม่) และขอใบรับรองซ้ำจนอาจโดนจำกัดชั่วคราว
- `docker compose down -v` **ไม่ลบ** volume นี้ (เป็นแบบ external) · แต่ห้าม `docker volume rm yatung_ts_state`, `docker volume prune`, `docker system prune --volumes`, และห้ามกด "Remove volume" ใน Docker Desktop
- เครื่องพีซีต้องไม่ sleep และ **Docker Desktop ต้องเปิดอัตโนมัติตอน sign in** (Docker Desktop → Settings → General → *Start Docker Desktop when you sign in*) — ไม่งั้น tunnel ดับเหมือนเหตุการณ์ 14 ต.ค.

## แก้ปัญหาเบื้องต้น

| อาการ | ลองทำ |
|---|---|
| `docker compose … up` ฟ้อง volume `yatung_ts_state` not found | `docker volume create yatung_ts_state` แล้วรันใหม่ |
| log ของ tunnel ฟ้อง auth key ผิด/หมดอายุ | สร้าง key ใหม่ (ขั้น 0.5) ใส่ `TS_AUTHKEY` แล้ว `docker compose --profile tunnel up -d tunnel` (ใช้เฉพาะเมื่อยังไม่เคยลงทะเบียน) |
| `demo-check.sh` ว่า Funnel ยังไม่เปิด | ดู `docker compose --profile tunnel logs tunnel` · ตรวจขั้น 0.3 (HTTPS) และ 0.4 (ACL Funnel) |
| เปิดชื่อเต็มไม่ได้ ทั้งที่ Funnel เปิดแล้ว | รอ DNS ถึง ~15 นาที · ลองจากมือถือ 4G (บางเครือข่ายในบ้านแคช DNS เก่า) |
| ชื่อเครื่องเป็น `yatung-1` | มีเครื่อง `yatung` เก่าค้างใน Machines → ลบเครื่องเก่าที่ **⋯ → Delete** แล้วบอกผมก่อนเปลี่ยน `TS_PUBLIC_HOST` |
| แจ้งเตือน iPhone ไม่มา มี `BadJwtToken` ใน log | `VAPID_SUBJECT` ต้องเป็น `https://${TS_PUBLIC_HOST}` (ขั้น 4) แล้ว recreate nodered |

## บันทึกเวลาจริง (ผมเติมระหว่างทำ)

| ขั้น | เวลาเริ่ม | เวลาจบ | หมายเหตุ |
|---|---|---|---|
| 0 | | | |
| 1 | | | |
| 2 | | | |
| 3 | | | เวลาเปิดแอปครั้งแรกบน 4G/5G: |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
