# YaTung (ยาตรง)

เว็บแอปแปลงซองยาเป็นตารางกินยา พร้อมแจ้งเตือนผ่าน LINE
Angular + Ionic (หน้า Scan) · Node-RED · MySQL · Docker · PWA · Capacitor

> ไม่ใช่คำแนะนำทางการแพทย์ · รองรับเฉพาะซองยาที่พิมพ์ด้วยเครื่อง

## เริ่มต้น (วันที่ 1)

### 1. สร้าง Angular project แล้ววางไฟล์ starter ทับ

ไฟล์ใน `frontend/` ของ starter นี้ยังไม่ใช่ Angular project เต็มรูปแบบ ต้องสร้าง project ก่อน

```cmd
REM ต้องใช้ Node 22.22.3+ ถ้าจะใช้ Angular CLI เวอร์ชันล่าสุด (22.x)
REM ถ้า Node เก่ากว่า ให้ใช้ @angular/cli@21 (ไฟล์ starter ทดสอบ build ผ่านกับ Angular 21 + Ionic 9)
ren frontend frontend-starter
npx @angular/cli@21 new frontend --routing --style=scss --skip-git --ssr=false
xcopy frontend-starter\* frontend\ /E /I /H /Y
rmdir /S /Q frontend-starter

cd frontend
npm i @ionic/angular ionicons @capacitor/core @capacitor/camera @ionic/pwa-elements
npm i -D @capacitor/cli
npx ng add @angular/pwa
```

ใน `angular.json` ให้ทำ 2 อย่าง

- `serve.options` เพิ่ม `"proxyConfig": "proxy.conf.json"` เพื่อให้ `ng serve` เรียก `/api` ไป Node-RED ได้
- `budgets` ปรับ initial `maximumWarning` เป็น `"1MB"` เพราะ Ionic core ทำให้ bundle เกิน 500 kB

> **Ionic 9:** standalone components import จาก `@ionic/angular` โดยตรง
> (ตัวอย่างบนเว็บที่ใช้ `@ionic/angular/standalone` เป็นของ Ionic 7–8)

### 2. รันทั้งระบบ

```cmd
copy .env.example .env
docker compose up -d --build
```

| URL | |
|---|---|
| http://localhost:8080 | เว็บแอป |
| http://localhost:1880 | Node-RED editor (user `admin` / `demo1234` — เปลี่ยนก่อนเปิด tunnel) |
| http://localhost:8081 | Adminer (`docker compose --profile dev up -d`) |

บัญชีเดโม: `demo@yatung.app` / `demo1234` (มีข้อมูลกินยาย้อนหลัง 7 วัน และ Metformin ที่ใกล้หมด)

> Linux: ถ้า Node-RED เขียนไฟล์ใน `node-red/data` ไม่ได้ ให้รัน `sudo chown -R 1000:1000 node-red/data`

### 3. Dev แบบ hot reload

```cmd
docker compose up -d db nodered
cd frontend
npx ng serve
```

## Android (.apk)

```cmd
cd frontend
npx cap init YaTung app.yatung --web-dir dist/frontend/browser
npx ng build
npx cap add android
npx cap sync android
npx cap open android
```

เปิด Android Studio เพื่อ build ไฟล์ `.apk`

ใน `android/app/src/main/AndroidManifest.xml` เพิ่ม permission กล้อง

```xml
<uses-permission android:name="android.permission.CAMERA" />
```

## AI pipeline (`POST /api/scan`)

```
{image: base64} ──► OCR ──┐
                          ├─► LLM (system prompt + JSON schema) ──► validate-llm-output.js ──► draft
{text: "..."} ────────────┘
```

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `node-red/data/prompts/medicine-parse.system.txt` | system prompt (กฎการตีความ + กัน prompt injection + ตัวอย่าง) |
| `node-red/data/prompts/medicine-parse.user.txt` | template ฝั่ง user — แทน `{{OCR_TEXT}}` ด้วยข้อความ OCR |
| `node-red/data/prompts/medicine-parse.schema.json` | JSON Schema ของผลลัพธ์ ส่งให้ LLM และใช้ validate |
| `node-red/data/lib/validate-llm-output.js` | โค้ด function node: parse → Ajv → business rules → review_flags |

ทั้งหมดถูกโหลดใน `settings.js` และเรียกใช้ผ่าน `global.get('prompts')` / `global.get('medicineValidator')`

**การส่ง schema ให้ LLM แต่ละเจ้า:** แต่ละผู้ให้บริการรองรับ keyword ของ JSON Schema ไม่เท่ากัน
ถ้า API ตอบ error เรื่อง schema ให้ลบ keyword ที่ใช้แค่ตรวจค่า (`minLength`, `maxLength`, `maxItems`,
`uniqueItems`, `minimum`, `maximum`, `exclusiveMinimum`) ออกจากสำเนาที่ส่งให้ LLM
ส่วนไฟล์ต้นฉบับให้เก็บไว้ครบ เพราะ Ajv ฝั่ง Node-RED ใช้ตรวจซ้ำอยู่แล้ว
