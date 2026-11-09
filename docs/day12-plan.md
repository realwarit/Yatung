# วันที่ 12 — เปลี่ยน tunnel จาก ngrok เป็น Tailscale Funnel

> อ่าน CLAUDE.md ก่อน แล้วทำตาม convention เดิมทั้งหมด
> เริ่มจาก `main` ล่าสุด (หลัง merge PR #37) branch `feat/day12-tailscale`
> ห้ามแก้โค้ดจนกว่าจะเสนอ "ส่วนที่ 2 — แผน" และคาเด็ทอนุมัติ

---

# ส่วนที่ 1 — โจทย์ (ข้อความต้นฉบับ)

## เป้าหมาย
- เลิกใช้ ngrok ฟรี (หน้าเตือน interstitial, โควตาคำขอ, ต้องส่ง header ข้าม) → ใช้ **Tailscale Funnel** แพ็กเกจ Personal ฟรี ได้ URL `https://<ชื่อเครื่อง>.<tailnet>.ts.net` คงที่ พร้อม HTTPS
- **ไม่มีงบ** ทุกอย่างต้องฟรี ไม่ซื้อโดเมน
- **ไม่ทำ apk ต่อแล้ว** (เว็บ/PWA อย่างเดียว) ยอมรับว่า apk เดิมจะต่อเซิร์ฟเวอร์ไม่ได้ ไม่ต้องแก้ไฟล์ Capacitor/android และไม่ต้องลบ

## ส่วน A — สำรวจ (ใส่ในแผน)
1. **อ่านเอกสาร Tailscale ทางการก่อน** (Funnel, Docker image `tailscale/tailscale`, `TS_AUTHKEY`, `TS_SERVE_CONFIG`, userspace networking บน Docker Desktop for Windows, การเปิด HTTPS certificates และ Funnel ใน admin console/ACL) แล้วเสนอ 2 แบบเทียบกัน:
   - (ก) container `tailscale` ใน docker-compose แทน service `tunnel` เดิม ชี้ไป `frontend:80`
   - (ข) แอป Tailscale บน Windows แล้วสั่ง funnel ไป `localhost:8080`
   - เทียบเรื่อง: เปิดคอมแล้วขึ้นเองไหม, ความง่ายสำหรับคาเด็ท (ไม่ถนัดฮาร์ดแวร์/ระบบ), ความลับที่ต้องเก็บ, state ที่ต้อง persist, การ restart, ข้อจำกัด (พอร์ต 443/8443/10000 เท่านั้น, แบนด์วิดท์จำกัดที่ตั้งเองไม่ได้)
2. ลิสต์ **ทุกจุดที่ผูกกับ ngrok**: docker-compose (`tunnel`, inspector 4040), `.env.example` (NGROK_*), `PUBLIC_BASE_URL`, `LINE_MASCOT_URL`, `ngrok.interceptor` และที่ register ใน app config, nginx (header/CORS ที่เกี่ยว), `environment*.ts`, scripts (demo-check.sh, test-day*.sh, check-secrets, git grep กันโดเมนรั่ว), README, CLAUDE.md, ลิงก์ใน Flex/LINE (ปุ่ม "เปิดแอป", รูป mascot, oaMessage), Web Push (VAPID subject/URL ที่แนบใน payload)
3. **ผลต่อ PWA/Web Push:** origin ใหม่ = แอปใหม่ในสายตาเบราว์เซอร์ ระบุให้ชัดว่าอะไรหายบ้าง (ไอคอน WebAPK, localStorage/ล็อกอิน, push subscription) และ subscription เก่าใน DB จะเป็นอย่างไร (ตอบ 404/410 แล้วถูกลบเองไหม — ตรวจโค้ด push-service จริง) VAPID key ใช้ชุดเดิม ไม่สร้างใหม่
4. **CORS เดิมสำหรับ apk** (`https://localhost` ใน nginx `location /api/`): เสนอว่าจะคงไว้หรือถอด พร้อมเหตุผล (apk เลิกใช้แล้ว)

## ส่วน B — สิ่งที่ต้องทำ
5. ตั้ง tunnel ใหม่ตามแบบที่คาเด็ทเลือก ชื่อเครื่องใน tailnet = `yatung` (ถ้าแบบที่เลือกตั้งชื่อได้)
6. **ความลับ:** `TS_AUTHKEY` และค่าที่ระบุ tailnet (ชื่อ `*.ts.net` เต็ม) อยู่ใน `.env` เท่านั้น ถือว่าเป็นความลับระดับเดียวกับโดเมน ngrok เดิม: ห้าม commit ห้ามอยู่ในภาพ/log; state ของ tailscale (ถ้ามี volume/โฟลเดอร์) ต้องอยู่ใน .gitignore; ขยาย `check-secrets.mjs` และ git grep ก่อน commit ให้จับ `.ts.net` เต็มด้วย (มีตัวควบคุมบวก)
7. ตั้ง `PUBLIC_BASE_URL` จากค่าใหม่ แล้วให้ทุกจุดในข้อ 2 ใช้ค่านี้ (ห้าม hardcode)
8. **ถอด ngrok ออกจากโค้ด** ได้แก่ `ngrok.interceptor` และ header ข้ามหน้าเตือน แต่ **เก็บ service ngrok ไว้เป็น profile สำรอง** (เช่น `tunnel-ngrok`) จนกว่าคาเด็ทใช้ Funnel ครบ 1 สัปดาห์ไม่มีปัญหา โดย default ต้องไม่รัน และห้ามรันพร้อมกับ Funnel
9. **ห้าม Node-RED editor/admin API เข้าจากภายนอก** เหมือนเดิม: ผ่าน URL ใหม่ต้องเข้าถึงได้แค่ SPA, `/api/` และ `/line/webhook` (มีเทสยืนยัน เช็กเนื้อหาไม่ใช่แค่สถานะ แบบเทส 6A)
10. **พิสูจน์ด้วย curl จากภายนอกผ่าน URL จริง** (ไม่ส่ง header พิเศษ): หน้าแรกได้ HTML ของแอป ไม่ใช่หน้าเตือน, `GET /api/config` ได้ JSON, webhook ที่ไม่มี signature ได้ 401, `/flows` และ `/red` ไม่ได้ Node-RED, manifest + service worker โหลดได้ (content-type ถูก), ไฟล์ใหญ่สุดของ bundle โหลดเสร็จในเวลาที่รับได้ (วัดเวลาไว้)
11. อัปเดต demo-check.sh ให้แสดงสถานะ tunnel ใหม่ (ขึ้น/ไม่ขึ้น, URL แบบย่อที่ไม่เผยชื่อเต็ม), README (ส่วน tunnel เป็นขั้นตอนภาษาไทยทีละขั้นสำหรับคนไม่ถนัดระบบ), CLAUDE.md, `.env.example` (ตัวแปรใหม่พร้อมคอมเมนต์ไทย, ย้าย NGROK_* ไปส่วน "สำรอง")

## ส่วน C — ขั้นตอนที่คาเด็ทต้องทำเอง
12. เขียน `docs/day12-cutover.md` เป็นภาษาไทยทีละขั้น (บอกว่าต้องกดอะไรตรงไหน) ครอบ:
    - สมัคร Tailscale (Personal ฟรี) และขั้นตอนใน admin console ที่ต้องทำ (เปิด HTTPS, เปิด Funnel/ACL, สร้าง auth key ถ้าใช้แบบ ก) และวิธีใส่ค่าใน `.env` เอง (ห้ามวางค่าในแชท)
    - เปลี่ยน Webhook URL ใน **LINE Developers Console** → กด Verify → ต้องผ่าน
    - ติดตั้ง PWA ใหม่บน S23 FE จาก URL ใหม่ ล็อกอินบัญชี "การ์ตูน" เปิด "แจ้งเตือนบนเครื่องนี้" ใหม่ และลบไอคอนเก่าทีหลัง (หลังยืนยันว่าตัวใหม่ได้ push แล้ว)
    - วิธีย้อนกลับไป ngrok ถ้า Funnel มีปัญหา (สั่งอะไร เปลี่ยน webhook กลับอย่างไร)
13. **ลำดับวันสลับ (cutover)** ต้องอยู่นอกเวลามื้อของบัญชีทดสอบ ±30 นาที (ตรวจเวลามื้อจาก DB ด้วย SELECT) ห้ามช่วง 23:50–00:15, 02:55–03:10 และระหว่างสลับต้องไม่มีช่วงที่ไม่มี tunnel เลยนานเกินจำเป็น

## ตอนทำ
14. ทำทีละช่วง → รันเทส → รายงาน → commit แยก
15. ถามก่อนรันเทสที่ recreate container, ก่อน restart nodered (ห้ามช่วงเวลาตามข้อ 13), ก่อน push และก่อนเปิด PR — คาเด็ท merge เอง
16. ถ้าเจอว่า Funnel ทำงานบนเครื่องคาเด็ทไม่ได้ (เช่น Docker Desktop/เครือข่าย) หรือติดเกิน ~45 นาที ให้หยุดแล้วรายงานทางเลือก ห้ามลองมั่ว
17. ชุดเทสเดิมทั้งหมดต้องผ่าน (test-all.sh, ng test 444, node --test 408, first-screen 830/0, overflow 360/360 ชุดเต็ม, state-check 171/171, review-e2e 67/0, demo-check เขียวทุกข้อ) และจำนวนเทสต้องไม่ลด ใส่คอลัมน์ "ก่อน" ด้วยเลขเหล่านี้
18. ห้ามส่งอะไรจริงไปบัญชี "การ์ตูน" และคนที่ห่วงใยของบัญชีนั้น ใช้ fake-line/fake-push กับผู้ใช้ `@example.test` เหมือนเดิม

## ส่วนที่ 2 ที่ต้องเสนอ
19. ผลสำรวจข้อ 1–4 (ตารางเปรียบเทียบแบบ ก/ข พร้อมคำแนะนำ, ตารางจุดผูก ngrok ไฟล์:บรรทัด, สิ่งที่หายเมื่อเปลี่ยน origin)
20. คำถามที่ต้องให้คาเด็ทตัดสิน และร่างลำดับวันสลับพร้อมเวลาที่แนะนำ

---

# ส่วนที่ 2 — แผน (ร่างเสนอ รออนุมัติ — ยังไม่ได้แก้โค้ดใดๆ)

สำรวจเมื่อ 9 พ.ย. 2569 บน branch `feat/day12-tailscale` (แยกจาก `origin/main` ที่ merge PR #37 แล้ว)

## 2.1 ข้อเท็จจริงจากเอกสาร Tailscale (ข้อ 1)

แหล่ง: tailscale.com/kb/1223/funnel, /kb/1153/enabling-https, /kb/1085/auth-keys, /docs/features/containers/docker/docker-params (อ่านแล้ว) ; รูปแบบไฟล์ serve config (`TCP/Web/AllowFunnel` + `${TS_CERT_DOMAIN}`) ได้จากตัวอย่างชุมชน/ScaleTail **ไม่ใช่หน้าทางการ — ต้องทดสอบจริงตอนทำ**

| เรื่อง | ข้อเท็จจริง |
|---|---|
| ข้อกำหนด Funnel | Tailscale ≥ 1.38.3 · MagicDNS เปิด · HTTPS certificates เปิด · ACL มี `funnel` ใน `nodeAttrs` (ค่าเริ่มต้น `autogroup:member` ใช้ได้; สั่ง `tailscale funnel` ครั้งแรกจะขอเพิ่มให้) |
| พอร์ตภายนอก | 443, 8443, 10000 เท่านั้น (เราใช้ 443) · ใช้ได้เฉพาะชื่อ `*.ts.net` ของ tailnet นั้น |
| แบนด์วิดท์ | จำกัด ตั้งเองไม่ได้ เอกสารไม่ระบุตัวเลข → **ต้องวัดเอง** (ข้อ 10) |
| แผน Personal | เอกสารระบุว่า Funnel ใช้ได้ทุกแผนรวม Personal ไม่มีเงื่อนไขเฉพาะแผน |
| DNS | เรคคอร์ดสาธารณะอาจใช้เวลาถึง ~10 นาทีกว่าจะขึ้น → **นี่คือความเสี่ยงเรื่อง "ช่วงไม่มี tunnel" ของวันสลับ** |
| ใบรับรอง | Let's Encrypt 90 วัน (Tailscale ต่ออายุให้เมื่อมี state) · ขอซ้ำบ่อยๆ ชน rate limit → **ต้อง persist state ห้ามสร้าง node ใหม่ทุกครั้งที่ recreate** |
| ความเป็นส่วนตัว | ชื่อเครื่อง + tailnet จะถูกเผยใน Certificate Transparency log (ใครก็ค้นได้) — ชื่อเต็ม `yatung.<tailnet>.ts.net` จึง **ไม่ใช่ความลับจริง** แต่เรายังถือเป็นความลับตามข้อ 6 (ไม่ลง git/log/ภาพ) ; ชื่อ `yatung` ไม่มีข้อมูลอ่อนไหว |
| Docker | `TS_USERSPACE` เปิดเป็นค่าเริ่มต้น (ไม่ต้องใช้ `/dev/net/tun` → เหมาะกับ Docker Desktop for Windows) · `TS_STATE_DIR` ต้อง persist ไม่งั้นเป็น node ใหม่ทุกครั้ง · `TS_SERVE_CONFIG` รับ JSON ของ Serve/Funnel (ให้ mount เป็น **โฟลเดอร์** ไม่ใช่ไฟล์เดี่ยว) · `TS_AUTH_ONCE=true` = ล็อกอินเฉพาะตอนยังไม่เคยล็อกอิน · `TS_HOSTNAME` ตั้งชื่อ node |
| auth key | อายุ 1–90 วัน (ค่าเริ่มต้น 90) · one-off/reusable/ephemeral/pre-approved · **key หมดอายุไม่กระทบ node ที่ลงทะเบียนแล้ว** · แต่ **node key หมดอายุทุก 180 วัน** (ปิดได้ต่อเครื่องที่หน้า Machines) |

## 2.2 เปรียบเทียบแบบ (ก) container vs (ข) แอป Windows

| หัวข้อ | (ก) container `tailscale` ใน compose | (ข) แอป Tailscale บน Windows + `tailscale funnel` ไป `localhost:8080` |
|---|---|---|
| เปิดคอมแล้วขึ้นเองไหม | ขึ้นพร้อม Docker Desktop (`restart: unless-stopped`) — **ต้องตั้ง Docker Desktop ให้เปิดตอน sign in** ซึ่งต้องมีอยู่แล้วเพราะ nodered/db อยู่ใน Docker | แอปรันเป็นบริการ Windows ขึ้นเองตอนบูต และ `tailscale funnel --bg` จำค่าไว้ — แต่เว็บ/Node-RED ก็ยังต้องรอ Docker อยู่ดี จึงไม่ได้ประโยชน์จริง |
| ความง่ายสำหรับคาเด็ท | ใส่ค่า 2 ตัวใน `.env` แล้ว `docker compose --profile tunnel up -d` · คำสั่งเดียวกับ ngrok เดิม | ติดตั้งโปรแกรม + ล็อกอินผ่านเบราว์เซอร์ + สั่ง CLI เอง (ต้องเปิด PowerShell, จำคำสั่ง) |
| ความลับ | `TS_AUTHKEY` ใน `.env` (**ใช้ครั้งเดียว**: ลงทะเบียนเสร็จลบออกจาก `.env` ได้ → อายุความลับสั้น) + ชื่อ `*.ts.net` | ไม่มี key ใน `.env` (ล็อกอินด้วยบัญชี) · มีแค่ชื่อ `*.ts.net` |
| state ที่ต้อง persist | named volume `ts_state` (อยู่นอก repo จึงไม่ต้อง gitignore; ถ้าเปลี่ยนเป็น bind mount ต้อง gitignore) · **ทำหาย = node ใหม่ชื่อ `yatung-1` URL เปลี่ยน + ชน rate limit ใบรับรอง** | อยู่ในแอป Windows จัดการเอง |
| restart / recreate | recreate container ได้ถ้า volume อยู่ ; `docker compose down -v` **ทำลาย state** (ต้องระวัง — เตือนใน README) | restart Docker ไม่กระทบ tunnel |
| ตั้งชื่อ `yatung` | `TS_HOSTNAME=yatung` | ต้องเปลี่ยนชื่อเครื่อง Windows หรือ `tailscale set --hostname=yatung` (กระทบชื่อพีซีใน tailnet) |
| ชี้ปลายทาง | ภายใน Docker network → `frontend:80` ไม่เปิดพอร์ตเพิ่ม | ชี้ `localhost:8080` (พอร์ต 8080 เปิดให้ LAN อยู่แล้ว) |
| ตรวจสถานะใน demo-check / เทส | `docker compose exec tailscale tailscale status --json` เหมือน pattern เดิมของ `tunnel` | ต้องพึ่ง CLI ของ Windows จากสคริปต์ bash (ไม่แน่ใจว่าอยู่ใน PATH ของ Git Bash — ตอนนี้เครื่องนี้ **ยังไม่ได้ติดตั้ง `tailscale`**) |
| ทำซ้ำบนเครื่องอื่น (ส่งงาน/อาจารย์) | clone + `.env` + compose จบ | ต้องติดตั้ง + ตั้งค่าเองอีกชุด |
| เสี่ยง | ต้องทดสอบว่า userspace networking ของ container ส่งต่อไป `frontend:80` ผ่าน Docker DNS ได้จริงบน Docker Desktop (ตามตัวอย่างชุมชนทำได้ — ยังไม่ได้พิสูจน์บนเครื่องนี้) | Windows sleep แล้ว Funnel หยุดเหมือนกัน (ไม่ต่างกัน) |

**คำแนะนำ: แบบ (ก)** — ขั้นตอนเหมือน ngrok เดิม (profile `tunnel`), ประกาศใน repo ทำซ้ำได้, ตรวจด้วยสคริปต์ได้, และไม่ต้องให้คาเด็ทจำคำสั่ง CLI ข้อแลกเปลี่ยนคือมี `TS_AUTHKEY` ชั่วคราวใน `.env` (ลดด้วยการใช้ one-off อายุ 1–7 วัน แล้วลบทิ้งหลังลงทะเบียน) และต้องดูแล volume ไม่ให้ถูก `down -v`

**เงื่อนไขหยุด (ข้อ 16):** ถ้า container ขึ้นไม่ได้/Funnel ไม่ตอบจากภายนอกภายใน ~45 นาที จะหยุดและรายงาน ไม่ลองมั่ว (ทางเลือกสำรองที่จะเสนอตอนนั้น: แบบ ข, หรือ Cloudflare Tunnel แบบ quick tunnel ที่ URL ไม่คงที่ — ไม่เหมาะกับ LINE webhook)

**โครงที่จะทำ (ถ้าเลือก ก):**
- `docker-compose.yml`: service `tunnel` → image `tailscale/tailscale:<เวอร์ชันที่ pin>` (profile `tunnel`), `TS_HOSTNAME=yatung`, `TS_AUTHKEY`, `TS_STATE_DIR`, `TS_AUTH_ONCE=true`, `TS_SERVE_CONFIG=/config/serve.json`, volume `ts_state`, mount โฟลเดอร์ `tailscale/` (ไฟล์ `serve.json` ใน repo ใช้ `${TS_CERT_DOMAIN}` จึงไม่มีชื่อ tailnet อยู่ใน repo) ; ngrok ย้ายเป็น service `tunnel-ngrok` (profile `tunnel-ngrok`, ยังมี inspector 4040)
- `serve.json`: `TCP 443 HTTPS:true` → `Web ${TS_CERT_DOMAIN}:443` `Handlers "/"` → `Proxy http://frontend:80` + `AllowFunnel ${TS_CERT_DOMAIN}:443 = true`
- nginx **ไม่เปลี่ยนเส้นทาง** (ยังส่งต่อแค่ `/api/` กับ `= /line/webhook` — Node-RED editor จึงเข้าไม่ได้ผ่าน Funnel เหมือนเดิม)

## 2.3 จุดที่ผูกกับ ngrok (ข้อ 2) — ไฟล์:บรรทัด

(เลขบรรทัดจาก `origin/main` ณ วันสำรวจ ; "ทำ" = สิ่งที่แผนนี้จะทำ)

**โครงสร้าง / ตัวแปร**

| ไฟล์:บรรทัด | เกี่ยวกับอะไร | ทำ |
|---|---|---|
| `docker-compose.yml:95–107` | service `tunnel` (image ngrok, `NGROK_DOMAIN`/`NGROK_AUTHTOKEN`, inspector `127.0.0.1:4040`) | แทนด้วย Tailscale ; ngrok → `tunnel-ngrok` |
| `docker-compose.yml:81` | `PUBLIC_BASE_URL` เข้า nodered | คงเดิม (ค่ามาจาก `.env`) |
| `docker-compose.yml:68–69` | `LINE_ASSET_BASE`, `LINE_MASCOT_URL` | คงเดิม (ค่าเริ่มต้นอิง `PUBLIC_BASE_URL`) |
| `docker-compose.yml:78` | `VAPID_SUBJECT` | คงเดิม ; แนะนำค่า `https://${TS_PUBLIC_HOST}` |
| `.env.example:32–40` | หัวข้อ Public URL, `NGROK_AUTHTOKEN`, `NGROK_DOMAIN`, `PUBLIC_BASE_URL=https://${NGROK_DOMAIN}`, `API_BASE_URL=https://${NGROK_DOMAIN}` | ใหม่: `TS_AUTHKEY`, `TS_PUBLIC_HOST`, `PUBLIC_BASE_URL=https://${TS_PUBLIC_HOST}` (คงกฎ "ประกาศก่อนอ้าง") ; NGROK_* + `API_BASE_URL` → ส่วน "สำรอง" |
| `.env.example:54–57` | `LINE_ASSET_BASE` (คอมเมนต์พูดถึงหน้าเตือน ngrok), `LINE_MASCOT_URL` | แก้คอมเมนต์ |
| `.env.example:73, 76` | คอมเมนต์/ตัวอย่าง `VAPID_SUBJECT` อ้าง `<NGROK_DOMAIN>` | แก้เป็นชื่อใหม่ |
| `.gitignore` | ยังไม่มีกฎเรื่อง tailscale | เพิ่ม `tailscale/state/` ฯลฯ กันไว้ (ถ้ามี bind mount) |

**Frontend**

| ไฟล์:บรรทัด | เกี่ยวกับอะไร | ทำ |
|---|---|---|
| `frontend/src/app/core/network/ngrok.interceptor.ts` (ทั้งไฟล์) | ใส่ header `ngrok-skip-browser-warning` ให้ทุก `/api` | **ลบ** |
| `frontend/src/app/app.config.ts:8, 19` | import + register interceptor | ถอด |
| `core/network/html-response.ts:3–4` | ค่าคงที่ `NGROK_SKIP_HEADER` | ลบค่าคงที่ |
| `core/network/connection.service.ts:5, 35` (+ คอมเมนต์ :55, :93) | probe `/api/config` ใส่ header ngrok | ถอด header |
| `core/offline/online.service.ts:7, 10` | probe ใส่ header ngrok | ถอด header |
| `core/network/html-guard.interceptor.ts`, `connection.service.ts` (แถบ "การเชื่อมต่อหมดอายุ" / `RECONNECT_URL`) | ตรวจ "API ตอบ HTML 2xx" + ลิงก์ไปกด Visit Site | **คงไว้ช่วงทดลอง** (ใช้ได้กับ captive portal และกับ ngrok สำรอง) แก้ข้อความ/คอมเมนต์ให้เป็นกลาง — ดูคำถามข้อ 5 |
| `app.ts:25`, `core/api/error-ref.ts:6`, `core/push/push-take.service.ts:8` | คอมเมนต์ที่อ้าง ngrok | แก้คอมเมนต์ |
| `frontend/src/environments/environment.native.ts:2` | ไฟล์ **gitignored** สร้างจาก `cap:env` มีโดเมน ngrok จริง | ไม่แตะ (apk เลิกแล้ว ; ไม่อยู่ใน git) |
| `frontend/tools/gen-native-env.mjs:31, 33, 44–50` | สร้าง env ของ apk จาก `NGROK_DOMAIN` | ไม่แตะ (Capacitor) |
| สเปก: `interceptors.spec.ts` (10 จุด), `api-base.interceptor.spec.ts:19–29`, `connection.service.spec.ts:49`, `html-response.spec.ts:5` | ทดสอบ interceptor/header | อัปเดต + **เพิ่มเทสใหม่ให้จำนวนไม่ลด** (เช่น "ไม่ใส่ header พิเศษให้ /api" เป็นเทสเชิงลบ) |

**nginx**

| ไฟล์:บรรทัด | เกี่ยวกับอะไร | ทำ |
|---|---|---|
| `frontend/nginx.conf:41` | `Access-Control-Allow-Headers` มี `ngrok-skip-browser-warning` | คงไว้ช่วงสำรอง ถอดพร้อม CORS ตอนจบสัปดาห์ (ข้อ 2.6) |
| `frontend/nginx.conf:45, 62` | คอมเมนต์ `https://<tunnel>/line/webhook` | ไม่ต้องแก้ (เป็นกลางอยู่แล้ว) |

**Backend / LINE / Web Push**

| ไฟล์:บรรทัด | เกี่ยวกับอะไร | ทำ |
|---|---|---|
| `node-red/data/lib/line-flex.js:34, 48` | รูป mascot = `LINE_ASSET_BASE` หรือ `${PUBLIC_BASE_URL}/line` ; ปุ่ม "เปิดแอป" = `PUBLIC_BASE_URL + path` | **ไม่แก้โค้ด** ใช้ค่าจาก env อยู่แล้ว (ตรงข้อ 7) |
| `node-red/data/lib/line-env.js:3` | ส่ง `PUBLIC_BASE_URL` เข้า lib | ไม่แก้ |
| `node-red/data/lib/push-service.js:109` | ข้อความ hint (log) อ้าง `<NGROK_DOMAIN>` | แก้ข้อความ + เทสที่ match (`push-service.test.js`) |
| payload Web Push (`push-service.js` `reminderPayload/lowStockPayload`) | URL ในการแจ้งเตือน | **ต้องตรวจตอนทำ** ว่าเป็น path สัมพัทธ์ (`/today`) ไม่ใช่โดเมนเต็ม — ถ้าสัมพัทธ์ ไม่ต้องแก้ |
| `oaMessage` (`https://line.me/R/oaMessage/…`) | ลิงก์เชื่อมบัญชี | ไม่ผูกโดเมนเรา ไม่ต้องแก้ |
| **Rich menu ที่ลงทะเบียนไว้กับ LINE แล้ว** (`scripts/line-richmenu.mjs:34`, ปุ่มกลาง = `PUBLIC_BASE_URL/today`) | URL ถูก "ฝัง" ในเมนูฝั่ง LINE | **ต้องรันสคริปต์ใหม่ตอน cutover** (เรียก LINE API จริง เปลี่ยนเมนูของทุกคนที่เป็นเพื่อนกับ OA → ต้องขออนุมัติ) |
| ข้อความ Flex เก่าในแชท LINE | ปุ่ม "เปิดแอป" เก่าชี้ ngrok | **หายไปเอง** (ลิงก์เก่าใช้ไม่ได้หลังปิด ngrok) ยอมรับ |

**สคริปต์ / เทส**

| ไฟล์:บรรทัด | เกี่ยวกับอะไร | ทำ |
|---|---|---|
| `scripts/demo-check.sh:4, 124, 133–135, 138–153` | ตรวจ tunnel ผ่าน inspector `:4040`, `NGROK_DOMAIN`, `/api/me` ด้วย header ngrok, `/flows` | เขียนส่วน tunnel ใหม่ (container `tunnel` + `tailscale status/serve status` + curl เปล่า) แสดง URL แบบย่อ `https://yatung.…ts.net` |
| `scripts/demo-check.sh:155–166, 253, 270–275` | รูป mascot (UA ไม่ใช่เบราว์เซอร์), SW/manifest ผ่าน tunnel, คำเตือนหน้า "Visit Site" | ปรับให้ curl เปล่า **ต้องได้ไฟล์จริงโดยไม่ต้องมี header** (ถ้าได้ HTML = ✗) ; ลบคำเตือน Visit Site |
| `scripts/demo-check.sh:219–230` | ตรวจ `VAPID_SUBJECT` + คำแนะนำ `https://<NGROK_DOMAIN>` | แก้ข้อความ |
| `scripts/gen-vapid.mjs:74` | ข้อความแนะนำ `<NGROK_DOMAIN>` | แก้ข้อความ |
| `scripts/line-export-messages.mjs:17` | `PUBLIC_BASE_URL: 'https://example.ngrok-free.dev'` (ตัวอย่าง) | เปลี่ยนเป็น `example.test`-style + export JSON ใหม่ (`docs/line-messages/*.json` มีโดเมนตัวอย่างอยู่) |
| `scripts/lib/secret-scan.mjs:13–14` | กฎจับ `NGROK_AUTHTOKEN` | คงไว้ (ngrok สำรอง) + **เพิ่มกฎใหม่** ข้อ 2.5 |
| `scripts/test-cors-native.sh:4, 14, 33, 45–58, 73–75` | เทส CORS ของ apk + โหมด `--ngrok` | ไม่แตะจนจบสัปดาห์สำรอง |
| `scripts/test-day6/6b/6c/7a/7b/7c/8.sh` | ใช้ `PUBLIC_BASE_URL="$PUBLIC"` (URL ปลอมของเทส) ไม่ผูก ngrok | ไม่แก้ |
| `node-red/test/{line-flex,line-messages,adherence-flex,escalation-service,reminder-channels,reminder-service,stock-service}.test.js` | ใช้โดเมนตัวอย่าง `*.ngrok-free.dev` ใน `ENV` | เปลี่ยนเป็นโดเมนตัวอย่างกลางๆ (ไม่กระทบจำนวนเทส) |

**เอกสาร**

| ไฟล์ | ทำ |
|---|---|
| `README.md:53–72` (หัวข้อ LINE + ngrok), `:114, :119–125` (Web Push), `:128–143` (iPhone ค้าง ngrok), `:173, :187`, `:208–209`, `:231, :237`, `:296–297` | เขียนหัวข้อ tunnel ใหม่เป็นขั้นตอนไทยทีละขั้น ; ย้ายเรื่อง ngrok/Visit Site ไป "สำรอง" |
| `CLAUDE.md` หัวข้อ "สภาพแวดล้อม" (บรรทัดรันระบบ/ngrok), LINE 6A (nginx + ห้ามเปิด tunnel), 6B/6C/7C (ngrok ฟรี), 8C-C0, กฎลำดับตัวแปร `.env`, ชุดทดสอบรวม (`--profile tunnel`) | อัปเดตตอนจบงาน |
| `docs/line-console-checklist.md` (6), `docs/web-push-test.md` (8), `docs/day8-device-checklist.md` (1), `docs/day9w-device-checklist.md` (1) | อัปเดต URL/ขั้นตอน (หมายเหตุ: `day8-device-checklist.md` มีการแก้ค้างอยู่ใน working tree ที่ไม่ใช่ของงานนี้ — จะไม่ commit รวม) |
| `docs/day6-plan.md`, `day7-plan.md`, `day8-plan.md`, `day9-*.md`, `docs/motion/*` | **เอกสารประวัติศาสตร์ ไม่แก้** |

ผล git grep ที่ตรวจแล้ว: ไม่พบโดเมน ngrok จริงหรือชื่อ `*.ts.net` ในไฟล์ที่ถูก track (พบเฉพาะโดเมนตัวอย่างและในไฟล์ gitignored `environment.native.ts`)

## 2.4 ผลต่อ PWA / Web Push เมื่อ origin เปลี่ยน (ข้อ 3)

**ที่หายไปทันที (ผูกกับ origin เดิม):**
1. ไอคอน WebAPK/PWA เดิมบน S23 FE — ยังเปิดได้แต่ชี้ URL ngrok เดิม (ตายเมื่อปิด ngrok) ; ต้องติดตั้งใหม่จาก URL ใหม่
2. `localStorage` / JWT / ขนาดตัวอักษร / ค่าเสียงอ่าน (`yatung_tts`) / snapshot ออฟไลน์ / error log — แยกต่อ origin → ล็อกอินใหม่, ตั้งค่าบนเครื่องใหม่
3. service worker + แคชของเดิม — เริ่มใหม่
4. **push subscription** — ผูกกับ service worker ของ origin เดิม ต้อง "เปิดแจ้งเตือนบนเครื่องนี้" ใหม่ในแอปตัวใหม่ (ได้ subscription ใหม่ endpoint ใหม่)

**subscription เก่าใน DB จะไม่ถูกลบเอง ณ ตอนสลับ** (ตรวจ `node-red/data/lib/push-service.js:171–180`):
- ลบแถวเฉพาะเมื่อผู้ให้บริการ push ตอบ **404/410** ; error อื่น = `fail_count + 1` เท่านั้น (ไม่เคยลบ — ตรงกับ "งานอนาคต" ใน CLAUDE.md)
- endpoint ของ FCM ไม่ผูกกับโดเมนเว็บ และ VAPID key ชุดเดิม → **การส่งไป subscription เก่ายังสำเร็จต่อไป** ตราบที่ไอคอนเก่ายังติดตั้งอยู่บนเครื่อง (service worker ปลุกได้แม้ไม่มีเน็ต) = **ได้แจ้งเตือนซ้ำ 2 ครั้ง** (ตัวเก่า+ตัวใหม่) ระหว่างช่วงทดสอบ ; กดแจ้งเตือนเก่าจะเปิด URL ngrok เดิม
- เมื่อถอนไอคอนเก่า/ล้างข้อมูลไซต์ → ครั้งถัดไปที่ส่งได้ 410 → แถวถูกลบเอง ; ผู้ใช้เองอาจมีแถวค้างจากเครื่องที่ไม่เปิดอีกแล้ว (ปัจจุบัน DB มี subscription อยู่ 3 ผู้ใช้ fail_count = 0 ทั้งหมด)
- VAPID: ใช้คู่คีย์เดิม ไม่สร้างใหม่ (ข้อกำหนดข้อ 3) ; `VAPID_SUBJECT` ไม่ผูกกับ subscription — เปลี่ยนเป็น `https://yatung.<tailnet>.ts.net` ได้โดยไม่กระทบ (Apple ชอบ https subject)
- การลบแถวเก่าด้วยมือ (DELETE) จะทำเฉพาะเมื่อคาเด็ทอนุมัติ และหลังยืนยันว่าตัวใหม่ได้ push แล้ว

## 2.5 ความลับและตัวควบคุมบวก (ข้อ 6)

- `.env`: `TS_AUTHKEY` (one-off, ไม่ ephemeral, อายุ 1–7 วัน → ลบออกจาก `.env` หลังลงทะเบียนสำเร็จ), `TS_PUBLIC_HOST=yatung.<tailnet>.ts.net` ; `PUBLIC_BASE_URL=https://${TS_PUBLIC_HOST}` ประกาศหลัง `TS_PUBLIC_HOST`
- `scripts/lib/secret-scan.mjs` เพิ่ม: (1) `TS_AUTHKEY`/รูปแบบ `tskey-(auth|client|api)-…` (2) ชื่อ `*.ts.net` จริง (ยกเว้น placeholder `<tailnet>`, `example`, `.test`) ทั้งใน diff และประวัติ (`--log HEAD --not --remotes`)
- เทสใหม่ใน `node-red/test/secret-scan.test.js`: ตัวควบคุมบวก (ค่าจำลองต้อง **ถูกจับ**) + ตัวควบคุมลบ (placeholder ในเอกสารต้อง **ไม่ถูกจับ**) ; ค่าทดสอบสร้างสุ่มตอนรัน ไม่ใช้ค่าจาก `.env`
- เอกสาร/ภาพ/log ใช้รูปย่อ `yatung.<tailnet>.ts.net` ; `demo-check.sh` พิมพ์ `https://yatung.•••.ts.net`
- ก่อน commit ทุกครั้ง: `git grep -n -E '\.ts\.net|tskey-'` + `check-secrets.mjs`

## 2.6 CORS ของ apk (ข้อ 4)

**ข้อเสนอ: คงไว้ก่อน แล้วถอดพร้อม ngrok ตอนจบสัปดาห์ทดลอง** (ไม่ถอดวันนี้)
- เหตุผลคง: ngrok ยังเป็นทางสำรองหนึ่งสัปดาห์ — apk เก่า (ที่ส่ง header ngrok) จะกลับมาใช้ได้ถ้าย้อนกลับ ; การคงไว้ไม่เพิ่มความเสี่ยง (อนุญาตเฉพาะ origin `https://localhost` ซึ่งเว็บไซต์อื่นปลอม origin นี้ในเบราว์เซอร์ไม่ได้) ; ถอดตอนนี้ต้องแตะ `test-cors-native.sh` และ `docs/day9-android.md` ซึ่งอยู่นอกโจทย์ "ไม่แตะ Capacitor"
- ตอนถอด (งานปิดท้ายสัปดาห์): ลบ `map $yt_cors_origin` + บล็อก CORS ใน `location /api/`, ลบ `test-cors-native.sh`, ลบ service `tunnel-ngrok` + NGROK_* + `html-guard`/แถบเชื่อมต่อหมดอายุ (ถ้าไม่ใช้แล้ว)

## 2.7 เทส / การยืนยัน (ข้อ 9, 10, 17)

**สคริปต์ใหม่ `scripts/test-tunnel.sh <URL>` (อ่านอย่างเดียว ไม่ส่งข้อความจริง ไม่ส่ง header พิเศษ)** — URL มาจาก `.env` ไม่พิมพ์ชื่อเต็ม:
- `GET /` → 200 `text/html` และเนื้อหามี `<app-root`/ชื่อแอป (ไม่ใช่หน้าเตือน)
- `GET /api/config` → 200 JSON `{demoMode}` เท่านั้น
- `POST /line/webhook` ไม่มี signature → 401
- `/flows`, `/red`, `/settings`, `/admin` → เนื้อหา **ไม่ใช่ JSON ของ Node-RED และไม่ใช่หน้า editor** (SPA fallback ตอบ 200 เป็น HTML ของแอปได้ — เช็กเนื้อหา แบบเทส 6A)
- `/manifest.webmanifest` → `application/manifest+json`, `/ngsw.json` → JSON จริง, `/ngsw-worker.js` → JavaScript
- วัดเวลาโหลดไฟล์ bundle ใหญ่สุดใน `dist` (3 ครั้ง, รายงานค่ากลาง + ขนาด) ; เป้า "รับได้" เสนอ ≤ 10 วินาทีต่อไฟล์ ที่สัญญาณบ้าน (คาเด็ทยืนยันเกณฑ์ได้)
- ทดสอบจริงอย่างน้อย 1 ครั้งจากเครือข่ายอื่น (มือถือเปิด 4G/5G โดยไม่ใช้ Wi-Fi บ้าน) ให้คาเด็ทเปิด URL เอง — เพราะพีซีนี้เมื่อใช้แบบ (ก) ไม่ได้อยู่ใน tailnet จึง curl จากพีซีนี้เป็น "ภายนอก" จริงอยู่แล้ว

**ตาราง "ก่อน / หลัง"** (ค่า "ก่อน" ตามที่คาเด็ทระบุ ; "หลัง" จะเติมตอนรันจริง):

| ชุด | ก่อน | หลัง |
|---|---|---|
| `test-all.sh` | ผ่านทั้งหมด | _เติม_ |
| `ng test` | 444 | _≥ 444_ (เทส ngrok ที่ลบ จะมีเทสใหม่ชดเชย) |
| `node --test` | 408 | _≥ 408_ (+ secret-scan ใหม่, + เทส serve.json) |
| first-screen | 830 / 0 | _เติม_ |
| overflow | 360 / 360 | _เติม_ |
| state-check | 171 / 171 | _เติม_ |
| review-e2e | 67 / 0 | _เติม_ |
| demo-check | เขียวทุกข้อ | _เติม_ |

ข้อ 18: ทุกเทสอัตโนมัติใช้ fake-line/fake-push กับผู้ใช้ `@example.test` ; ไม่มีการเรียกที่ส่งข้อความจริงไปบัญชี "การ์ตูน"/คนที่ห่วงใย (ปุ่มเดโมและการทดสอบ push บนเครื่องจริงเป็นการกดของคาเด็ทเองใน `docs/day12-cutover.md`)

## 2.8 ลำดับการทำงาน (ข้อ 14) — commit แยกช่วง

1. **ช่วง 1** โครง Tailscale: compose (`tunnel` ใหม่, `tunnel-ngrok`), `tailscale/serve.json`, `.env.example`, `.gitignore` + secret-scan ใหม่และเทสบวก/ลบ → รัน `node --test`
2. **ช่วง 2** frontend: ถอด ngrok interceptor/header, ปรับสเปก + เทสชดเชย → `ng test`, `ng build`
3. **ช่วง 3** สคริปต์: `test-tunnel.sh`, `demo-check.sh` ใหม่, `push-service.js` hint, ตัวอย่างโดเมนในเทส
4. **ช่วง 4** เอกสาร: README, CLAUDE.md, `docs/day12-cutover.md`
5. **ช่วง 5** ขึ้นของจริง (ต้องขออนุมัติทีละขั้น ตามข้อ 15): ดูลำดับวันสลับด้านล่าง → รันชุดเทสเต็ม → ตารางก่อน/หลัง → ขออนุมัติ push / เปิด PR (คาเด็ท merge เอง)

## 2.9 ร่างลำดับวันสลับ (ข้อ 13, 20)

**เวลามื้อจาก DB (SELECT อ่านอย่างเดียว):** ผู้ใช้ส่วนใหญ่ 08:00 / 12:00 / 18:00 / 21:00 ; มีค่าไม่ปกติ: เย็น 16:00 (1 บัญชี), ก่อนนอน 19:45 และ 21:18 (บัญชีละ 1) → ช่วงห้าม (±30 นาที): 07:30–08:30, 11:30–12:30, 15:30–16:30, 17:30–18:30, 19:15–20:15, 20:30–21:48, + 23:50–00:15, 02:55–03:10
**ช่วงปลอดภัย: 12:30–15:30** (และ 08:30–11:30) → **แนะนำวันถัดไป (อังคาร 10 พ.ย. 2569) เริ่ม 13:15 ให้จบก่อน 15:15** (ตอนนี้ 15:04 วันจันทร์ ใกล้ช่วงห้าม 15:30 จึงไม่ควรเริ่มวันนี้) ; ผมยังไม่รู้ว่าบัญชี "การ์ตูน" คือ user id ไหน (ต้องถามข้อ 8)

**ปัญหาหลักที่ต้องออกแบบ:** DNS ของ Funnel อาจใช้ ~10 นาทีหลังเปิดครั้งแรก และข้อ 8 ห้ามรัน ngrok กับ Funnel พร้อมกัน → ถ้าปิด ngrok ก่อนเปิด Funnel จะมีช่วงไม่มี tunnel (LINE webhook ตก) อย่างน้อย ~10 นาที **ข้อเสนอ:** ให้ "ทับซ้อนสั้นๆ" เฉพาะช่วงตรวจสอบ (ไม่ใช่สถานะปกติ) ดังนี้

| ขั้น | เวลาโดยประมาณ | ทำอะไร | ใครทำ | tunnel ที่ใช้งานจริง |
|---|---|---|---|---|
| 0 | (วันก่อน/เวลาใดก็ได้ ไม่กระทบระบบ) | สมัคร Tailscale, เปิด HTTPS + Funnel ใน admin console, สร้าง auth key, ใส่ `.env` เอง | คาเด็ท | ngrok |
| 1 | 13:15 | merge โค้ด (หลังคาเด็ท merge) → `docker compose up -d --build frontend` (รีสตาร์ท nginx ไม่กี่วินาที) | คาเด็ท/ผม (ถามก่อน) | ngrok |
| 2 | 13:20 | `docker compose --profile tunnel up -d` เริ่ม Tailscale **ขณะ ngrok ยังรัน** (ngrok ย้ายเป็น `tunnel-ngrok` ก่อนด้วย 1 คำสั่ง) · รอ DNS ≤ 10–15 นาที · ลบ `TS_AUTHKEY` ออกจาก `.env` | คาเด็ท | ngrok (Funnel ขึ้นแต่ยังไม่มีใครใช้) |
| 3 | 13:35 | รัน `scripts/test-tunnel.sh` ผ่าน URL ใหม่ (curl เปล่า) + เปิดจาก 4G ด้วยมือถือ | ผม + คาเด็ท | ngrok |
| 4 | 13:45 | ตั้ง `PUBLIC_BASE_URL`/`VAPID_SUBJECT` ใหม่ใน `.env` → `docker compose up -d --force-recreate nodered` (ถามก่อน ; ห้ามช่วงห้ามเวลา) | คาเด็ทอนุมัติ | ngrok + Funnel |
| 5 | 13:50 | LINE Developers Console: เปลี่ยน Webhook URL → **Verify ต้องผ่าน** → จากนี้ LINE ส่งเข้า Funnel | คาเด็ท | Funnel |
| 6 | 13:55 | **หยุด ngrok** (`docker compose stop tunnel-ngrok`) → จุดนี้ไม่มีการทับซ้อนอีก · รัน rich menu script ใหม่ (ถ้าอนุมัติ) | คาเด็ท/ผม | Funnel |
| 7 | 14:00 | ติดตั้ง PWA ใหม่บน S23 FE, ล็อกอินบัญชี "การ์ตูน", เปิด "แจ้งเตือนบนเครื่องนี้", ทดลองส่งเตือน | คาเด็ท | Funnel |
| 8 | หลังยืนยัน push ใหม่ได้ | ลบไอคอนเก่า → รอ 410 ลบแถวเก่าเอง (หรือ DELETE ถ้าอนุมัติ) | คาเด็ท | Funnel |
| 9 | ครบ 7 วัน ไม่มีปัญหา | งานปิดท้าย: ลบ `tunnel-ngrok`, NGROK_*, CORS, `test-cors-native.sh`, (ตามข้อ 2.6) | ผม (แผนแยก) | Funnel |

ถ้า Funnel มีปัญหาก่อนขั้น 6: ngrok ยังรันอยู่ ไม่ต้องย้อนกลับ ; หลังขั้น 6: `docker compose stop tunnel` → `docker compose --profile tunnel-ngrok up -d tunnel-ngrok` → ตั้ง `PUBLIC_BASE_URL` เดิม + recreate nodered → เปลี่ยน Webhook กลับ (รายละเอียดใน `docs/day12-cutover.md`)

ข้อควรทราบ: เหตุการณ์ 14 ต.ค. (พีซีหลับ) ใช้กับ Funnel เหมือนเดิม — คอมต้องไม่ sleep และ Docker Desktop ต้องเปิดตอน sign in

## 2.10 คำถามที่ต้องให้คาเด็ทตัดสิน

1. **แบบ (ก) หรือ (ข)?** — แนะนำ (ก)
2. **อนุญาตให้ ngrok กับ Funnel รันทับซ้อนชั่วคราว (ขั้น 2–6 ≈ 35 นาที) ไหม?** — แนะนำ "อนุญาต" เพื่อไม่ให้ LINE webhook ตกระหว่างรอ DNS ; ถ้าไม่อนุญาตจะมีช่วงไม่มี tunnel ~10–15 นาที
3. **บัญชี "การ์ตูน" คือ user id ไหน / อีเมลโดเมนอะไร?** (บอกเลข id ก็พอ ไม่ต้องวางอีเมลเต็ม) — เพื่อ SELECT เวลามื้อของบัญชีนั้นจริงและยืนยันช่วงปลอดภัย
4. **วัน/เวลา cutover** — แนะนำ อังคาร 10 พ.ย. 13:15–14:15
5. **ช่วงทดลอง 7 วัน คงแถบ "การเชื่อมต่อหมดอายุ" (html-guard) ไว้ไหม?** — แนะนำคงไว้ (ใช้กับ ngrok สำรองได้ ถอดตอนจบสัปดาห์) ; ทางเลือก: ถอดทันที (สะอาดกว่า แต่ย้อนกลับ ngrok แล้วอาจเจอหน้าเตือนโดยไม่มีแถบช่วย)
6. **CORS ของ apk:** คงไว้ถึงจบสัปดาห์ทดลองแล้วถอดพร้อม ngrok ตามข้อ 2.6 ใช่ไหม?
7. **อนุมัติให้รัน `scripts/line-richmenu.mjs` ตอน cutover ไหม?** (เรียก LINE API จริง ไม่ส่งข้อความหาใคร แต่เปลี่ยน rich menu ของทุกคนที่เพิ่ม OA ให้ปุ่มกลางชี้ URL ใหม่) ถ้าไม่รัน ปุ่มกลางของเมนูจะชี้ URL ngrok ที่ตายแล้ว
8. **ลบแถว `push_subscriptions` เก่าอย่างไร** — แนะนำ "รอ 410 หลังถอนไอคอนเก่า" ; ถ้า 2–3 วันแล้วยังไม่หาย ผมจะเสนอ SELECT ดูแล้วขออนุมัติ DELETE เป็นรายแถว
9. **เกณฑ์ "โหลด bundle ใหญ่สุดเสร็จในเวลาที่รับได้"** — ขอเสนอ ≤ 10 วินาที (ผ่านสัญญาณบ้าน) ตกลงไหม?
10. **ชื่อ tailnet** — Tailscale ตั้งชื่อสุ่มให้ตอนสมัคร (เปลี่ยนได้ที่ admin console → DNS) ต้องการเปลี่ยนให้อ่านง่ายไหม (ไม่จำเป็น ; ไม่ต้องแจ้งผมในแชท)

---

**สถานะ:** ส่วนที่ 1 บันทึกแล้ว · ส่วนที่ 2 รออนุมัติ · ยังไม่แก้โค้ด/compose/.env/nodered ใดๆ · ยังไม่ commit/push

---

# ส่วนที่ 3 — คำตอบที่ตัดสินแล้ว (ลำดับยึด ส่วนที่ 3 → 2 → 1)

1. **Q1:** แบบ (ก) container · pin เวอร์ชัน image (`tailscale/tailscale:v1.104.4` = tag stable ล่าสุดตอนสำรอง 9 พ.ย.) · รูปแบบ `serve.json` ต้องพิสูจน์ด้วยการรันจริงในขั้น 2–3 ของวันสลับ ถ้าใช้ไม่ได้ให้หยุดตามเงื่อนไข 45 นาที
2. **Q2:** ทับซ้อนชั่วคราวได้เฉพาะขั้น 2–6 ตามตาราง 2.9 (สถานะปกติห้ามรัน ngrok พร้อม Funnel) เกิน 60 นาทีให้หยุดและรายงาน
3. **Q3:** บัญชี "การ์ตูน" = user_id 152 (SELECT อย่างเดียว ไม่พิมพ์อีเมลในรายงาน)
4. **Q4:** วันสลับ = อังคาร 10 พ.ย. 2569 เริ่ม 13:15 จบก่อน 15:15 · SELECT เวลามื้อซ้ำก่อนเริ่ม
5. **เก็บ ngrok interceptor ไว้ก่อน** — ช่วง 2 (ถอด interceptor/header) **ย้ายเป็นงานปิดท้ายหลังครบ 7 วัน** รวมกับ html-guard, CORS, `tunnel-ngrok`, NGROK_* · เพิ่มเทสยืนยันว่า `GET /api/config` ผ่าน Funnel ทั้งมีและไม่มี header `ngrok-skip-browser-warning` ได้ผลเหมือนกัน
6. **Q5:** คง html-guard ไว้ช่วงทดลอง
7. **Q6:** คง CORS ของ apk ไว้ ถอดพร้อมงานปิดท้าย
8. **Q7:** รัน `scripts/line-richmenu.mjs` ในขั้น 6 หลัง Verify webhook ผ่าน ถามก่อนรันจริง · วิธีรันกลับ (ชี้ ngrok) อยู่ในขั้นตอนย้อนกลับของ `docs/day12-cutover.md`
9. **Q8:** รอ 410 หลังถอนไอคอนเก่า ครบ 3 วันยังไม่หาย → เสนอ SELECT แล้วขออนุมัติ DELETE เป็นรายแถว
10. **Q9:** เกณฑ์ ≤ 10 วินาทีต่อไฟล์ผ่านสัญญาณบ้าน · คาเด็ทจับเวลาเปิดแอปครั้งแรกผ่าน 4G/5G จดในรายงาน (ไม่มีเกณฑ์ผ่าน/ตก)
11. **ชื่อ tailnet:** ถ้าจะเปลี่ยนต้องทำในขั้น 0 ก่อนเปิด Funnel ครั้งแรก (เปลี่ยนทีหลัง = URL ใหม่ = ติดตั้ง PWA + เปลี่ยน webhook ใหม่ทั้งหมด)
12. **ปิด key expiry:** ขั้น 0 และ 2 ของ cutover ให้กด Disable key expiry ของเครื่อง `yatung` · `demo-check.sh` แสดงสถานะ key expiry (จาก `tailscale status --json`) เตือนเหลืองถ้ายังไม่ปิด
13. **auth key:** one-off, ไม่ ephemeral, pre-approved, อายุสั้นสุด (1 วันถ้าทำขั้น 0 วันเดียวกับวันสลับ ไม่งั้น 7 วัน) · ลบออกจาก `.env` หลังลงทะเบียน
14. **ป้องกัน volume `ts_state` หาย:** ตรวจ `down -v` / `volume rm` / `prune` ทั้งโปรเจกต์ (ตารางในรายงานช่วง 1) · เทสที่ recreate container ต้องไม่ recreate service `tunnel`
15. **demo-check.sh:** แสดง tunnel ที่รัน (Funnel/ngrok/ทั้งคู่ → เตือน), URL ปิดชื่อ, key expiry, `PUBLIC_BASE_URL` ตรงกับ tunnel ที่รันหรือไม่
16. **วันสลับ:** ทุกคำสั่งที่ recreate/restart/เรียก LINE จริง ถามก่อนทีละขั้น และบอกเวลาจริงทุกขั้น
17. ช่วง 1, 3, 4 เสร็จแล้วรันเทสตามข้อ 17 ของส่วนที่ 1 (ยกเว้นข้อที่ต้องมี Funnel จริง) แล้วรายงาน ยังไม่ push จนกว่าคาเด็ทดู `docs/day12-cutover.md`

**ผลต่อแผนส่วนที่ 2:** ช่วง 2 ถูกย้ายไปปิดท้าย → ตาราง 2.3 แถว interceptor/`NGROK_SKIP_HEADER`/probe header/สเปก **ไม่แก้ในรอบนี้** · `.env.example` ยังต้องมี NGROK_* (ย้ายไปส่วน "สำรอง") เพราะ `tunnel-ngrok` ยังใช้

---

# ส่วนที่ 3.1 — หลังรีวิว `day12-cutover.md` (วันที่ 12)

1. **เวลาเทสหนัก:** `test-all.sh`, first-screen, overflow, state-check, review-e2e, demo-check เต็ม ทำเฉพาะ 16:30–17:30 (ไม่ทัน = พรุ่งนี้ 08:30–11:30) · ไม่แตะ service `tunnel` (ngrok) · เสร็จแล้วคืนสถานะ (AI_MOCK เดิม, 4 container รัน)
2. **ขั้น 7.5:** ใช้ปุ่ม "ทดลองส่งแจ้งเตือน" (`POST /api/push/test`, ไม่แตะรอบยา) ; ห้ามใช้ remind-now กับบัญชี "การ์ตูน"
3. **สำรอง `.env.before-day12`** (เฉพาะ `PUBLIC_BASE_URL`/`VAPID_SUBJECT`) ; `.gitignore` ครอบ `.env.*` (ยกเว้น `.env.example`) ; `check-secrets` ถือเป็นไฟล์ต้องห้าม ; ย้อนกลับคัดลอกจากไฟล์นี้
4. **`TS_PUBLIC_HOST` อยู่เหนือทั้ง `PUBLIC_BASE_URL` และ `VAPID_SUBJECT`** ; demo-check ตรวจทั้งสองค่าใน container: ไม่ว่าง · ไม่มี `${` · `https://` · ตรง tunnel ที่รัน (VAPID `mailto:` = แดงเมื่อ Funnel รัน)
5. **ขั้น 1:** merge + `git pull` ก่อน 13:15 และ `docker compose ps` ต้องเห็น ngrok เก่า running ก่อนรันคำสั่ง
6. **หัวข้อ "เครื่องอื่นที่เคยติดตั้ง PWA"** เพิ่มใน cutover
7. **`Self.KeyExpiry`:** ยืนยันกับ `tailscale status --json` จริงในขั้น 2.3 ; demo-check ขึ้นเหลือง "ไม่ทราบ" ถ้าไม่มีฟิลด์ ; ผิด = commit `fix(scripts): …`
8. **ปิดงาน:** รายงานตารางก่อน→หลัง แล้ว push `feat/day12-tailscale` + Draft PR (`docs/day12-pr.md`) หลัง `git grep` + check-secrets
