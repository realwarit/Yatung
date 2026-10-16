# ยาตรง บน Android — build และติดตั้ง apk ทีละขั้น

เอกสารนี้สำหรับคนที่ยังไม่เคยใช้ Android Studio ทำตามลำดับได้เลย ใช้เวลาครั้งแรกประมาณ 30–45 นาที (ส่วนใหญ่คือรอดาวน์โหลด)

แอปนี้คือเว็บ Angular เดิมที่ห่อด้วย Capacitor 8 เป็น apk หน้าเว็บอยู่ในตัวแอป เปิดได้แม้เซิร์ฟเวอร์ไม่พร้อม ส่วนข้อมูลยิงไปที่ API ผ่าน tunnel

## 0. สิ่งที่ต้องมี

- Windows + Node 22 ขึ้นไป + Git
- Android Studio รุ่นล่าสุด (ติดตั้ง SDK platform 36 และ build-tools ตอนที่ Studio ถาม)
- ไฟล์ `.env` ที่ตั้ง `API_BASE_URL` แล้ว (ดู `.env.example`) — ค่านี้ถูกฝังใน apk ตอน build ดังนั้น **apk ห้ามแนบใน GitHub Release หรือส่งต่อสาธารณะ**
- มือถือ Android และสาย USB (หรือใช้ทางสำรองข้อ 6)

## 1. ตั้ง JDK 21 ให้ Gradle (ทำครั้งเดียว)

Capacitor 8 ต้องใช้ Java 21 ส่วน JDK ที่มากับ Studio รุ่นใหม่เป็น Java 25 ซึ่ง Gradle ของโปรเจกต์ยังรันไม่ได้

1. เปิดโปรเจกต์ (ข้อ 2) ก่อน
2. *File → Settings → Build, Execution, Deployment → Build Tools → Gradle*
3. ช่อง **Gradle JDK** เลือก *Download JDK…* → Version **21** → Vendor Eclipse Temurin (หรือ JetBrains) → *Download*
4. กด OK แล้วรอ Gradle sync

## 2. สร้างเว็บแล้วซิงก์เข้าโปรเจกต์ Android

เปิด PowerShell ที่โฟลเดอร์ `frontend`:

```powershell
npm ci
npm run cap:sync
npm run cap:open
```

- `cap:sync` อ่าน `.env` → build เว็บโหมด native (`ng build -c production,native`) → คัดลอกเข้า `android/`
- `cap:open` เปิดโฟลเดอร์ `frontend/android` ใน Android Studio
- **ทุกครั้งที่แก้โค้ดเว็บ ต้องรัน `npm run cap:sync` ใหม่** แล้วค่อยกด Run

## 3. ต่อเครื่องจริงด้วย USB แล้ว Run

บนมือถือ:
1. ตั้งค่า → เกี่ยวกับโทรศัพท์ → ข้อมูลซอฟต์แวร์ → แตะ "หมายเลขบิลด์" 7 ครั้ง
2. ตั้งค่า → ตัวเลือกนักพัฒนา → เปิด **USB debugging**
3. ต่อสาย USB → กด "อนุญาต" บนเครื่อง (ถ้า Windows ไม่เห็นเครื่อง ติดตั้ง USB driver ของยี่ห้อนั้น)

ใน Studio:
1. แถบบนเลือกชื่อเครื่องของคุณ
2. กดปุ่มสามเหลี่ยมเขียว **Run**
3. รอ build ครั้งแรก (ดาวน์โหลด Gradle และไลบรารีหลายร้อย MB) แอปจะเปิดเองบนเครื่อง

### คำเตือน: ห้ามกด Upgrade

ถ้า Studio เด้ง **"AGP Upgrade Assistant"** หรือ **"Upgrade Gradle"** ให้กด *Remind me later* หรือปิดไป **ห้ามอัปเกรด** เพราะจะไปแก้ไฟล์ใน `android/` ที่ Capacitor ควบคุมอยู่ แล้ว build พัง

## 4. ทดสอบ splash ต้อง cold start

splash (พื้นมิ้นต์ + น้องยาตรง) แสดงเฉพาะตอนเปิดแอปใหม่จากศูนย์ ถ้าแอปยังค้างอยู่เบื้องหลังจะไม่เห็น

1. ตั้งค่า → แอป → ยาตรง → **บังคับหยุด**
2. กลับหน้าโฮม แตะไอคอนยาตรง
3. ต้องเห็น splash จังหวะเดียว แล้วเข้าหน้าแอปโดยไม่มีจอขาวแวบ

## 5. ไอคอนและ splash

ภาพต้นฉบับอยู่ที่ `frontend/resources/` สร้างด้วย `node tools/make-icons.mjs` และ `node tools/make-splash.mjs` (ใน `frontend/`) ถ้าแก้ภาพแล้วต้องสร้างไฟล์ของ Android ใหม่:

```powershell
cd frontend
npx @capacitor/assets generate --android
npm run cap:sync
```

แล้ว Run ใหม่ และถอนการติดตั้งแอปเก่าก่อน เพราะ launcher บางรุ่นแคชไอคอนเดิม

## 6. ทางสำรอง: ติดตั้ง apk โดยส่งไฟล์เข้าเครื่อง

ใช้เมื่อ USB ไม่ติด

1. ใน Studio: *Build → Build Bundle(s) / APK(s) → Build APK(s)*
2. เมื่อเสร็จ กด *locate* ในกล่องแจ้งที่มุมล่างขวา จะได้ `app-debug.apk`
3. ส่งไฟล์เข้ามือถือ (สายต่อเครื่อง, อีเมลให้ตัวเอง, Drive ส่วนตัว)
4. บนมือถือเปิดไฟล์ → อนุญาต "ติดตั้งแอปจากแหล่งที่ไม่รู้จัก" ให้แอปที่ใช้เปิดไฟล์ → ติดตั้ง
5. อย่าเผยแพร่ไฟล์นี้ต่อ เพราะมีที่อยู่เซิร์ฟเวอร์ฝังอยู่ข้างใน

## 7. ปัญหาที่เจอแล้ว และวิธีแก้

| อาการ | สาเหตุ | วิธีแก้ |
|---|---|---|
| Gradle sync ล้ม ข้อความเกี่ยวกับ Java เวอร์ชัน / `Unsupported class file` | Gradle JDK เป็น Java 25 (JDK ที่มากับ Studio) หรือ Java 8 ใน PATH | ทำข้อ 1: ตั้ง Gradle JDK เป็น 21 |
| `docker compose build frontend` ช้ามาก หรือ `ECONNRESET` | `npm ci` เปิดการเชื่อมต่อพร้อมกันมากเกินจนเครือข่ายรีเซ็ต | Dockerfile ตั้ง `--maxsockets=4` กับ retry และแคช npm ไว้แล้ว รอบแรกราว 3 นาที รอบถัดไปเร็วขึ้น อย่าใส่ `--fetch-timeout` เล็กๆ เพราะเกิด `EIDLETIMEOUT` ที่ไม่ถูก retry |
| แอปเปิดแล้ว login ไม่ได้ ในคอนโซลเห็น CORS / preflight ล้ม | คำขอ `OPTIONS` ที่เบราว์เซอร์ส่งก่อนคำขอจริงไม่ได้คำตอบที่ถูก | nginx ใน `frontend/nginx.conf` ตอบ preflight ให้เอง (อนุญาตเฉพาะ origin ของแอป, แคช 10 นาที) ตรวจด้วย `bash scripts/test-cors-native.sh` ถ้าเพิ่งแก้ nginx ต้อง build และ up frontend ใหม่ |
| ทุกหน้าได้ข้อความเกี่ยวกับ "การเชื่อมต่อหมดอายุ" หรือเป็น HTML | tunnel ฟรีแสดงหน้าเตือนก่อนเข้า | แอปส่ง header ข้ามหน้าเตือนให้ทุกคำขอ `/api` แล้ว ถ้ายังเกิด ให้ตรวจว่า `API_BASE_URL` ใน `.env` ตรงกับ tunnel ที่เปิดอยู่ แล้ว `cap:sync` ใหม่ |
| แก้เว็บแล้วบนมือถือไม่เปลี่ยน | ลืมซิงก์ | `npm run cap:sync` แล้ว Run ใหม่ |
| ปุ่ม 🔊 ไม่ขึ้น | WebView ของ Android อ่านออกเสียงไทยเองไม่ได้ | เป็นพฤติกรรมที่ตั้งใจใน apk (ใช้งานเสียงอ่านได้บนเว็บ) |

## 8. ข้อควรจำ

- ห้าม commit ไฟล์ `.env`, `environment.native.ts`, `local.properties`, `*.apk`, `*.aab`
- ก่อน commit ทุกครั้งตรวจว่าไม่มีโดเมน tunnel ในไฟล์ที่จะ commit
- แอป Android ล็อกแนวตั้ง และตัวแอปไม่ทำคิวบันทึกออฟไลน์ (ออฟไลน์ดูข้อมูลล่าสุดได้อย่างเดียว)
