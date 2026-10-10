// Node-RED settings สำหรับ YaTung — ไฟล์นี้อยู่ใน /data (bind mount)
// โมดูลภายนอกติดตั้งใน image ที่ /usr/src/node-red/node_modules (ดู Dockerfile: NODE_PATH)

const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const db = require('./lib/db');
const medicationService = require('./lib/medication-service');
const doseService = require('./lib/dose-service');
const scanService = require('./lib/scan-service');
const prescriptionService = require('./lib/prescription-service');
const llmOutput = require('./lib/validate-llm-output');
const lineService = require('./lib/line-service');
const caregiverService = require('./lib/caregiver-service');
const lineClient = require('./lib/line-client').createClient();
const { createRawBodyMiddleware } = require('./lib/raw-body');
const { resolveAdmin } = require('./lib/admin-auth');
const reminderService = require('./lib/reminder-service');
const escalationService = require('./lib/escalation-service');
const stockService = require('./lib/stock-service');
const lineEnv = require('./lib/line-env');

const PROMPT_DIR = path.join(__dirname, 'prompts');
const readPrompt = (file) => fs.readFileSync(path.join(PROMPT_DIR, file), 'utf8');

// compile JSON Schema ครั้งเดียวตอน start
const medicineSchema = JSON.parse(readPrompt('medicine-parse.schema.json'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const medicineValidator = ajv.compile(medicineSchema);

// editor/admin API แบบ fail closed: ไม่มี NODE_RED_ADMIN_HASH ที่ถูกต้อง = ปิดทั้งหมด (http-in ยังทำงาน)
const admin = resolveAdmin();
if (!admin.enabled) console.warn('[yatung] editor/admin API ถูกปิด: ' + admin.reason + ' — ตั้ง NODE_RED_ADMIN_HASH ใน .env แล้ว docker compose up -d --force-recreate nodered');
else if (admin.sample) console.warn('[yatung] NODE_RED_ADMIN_HASH เป็นค่าตัวอย่าง (รหัส demo1234) — เปลี่ยนก่อนเปิด tunnel');
const rawBody = createRawBodyMiddleware();

// ผู้ป่วยกินยา (ทุกช่องทาง) หลังแจ้งญาติไปแล้ว → บอกญาติ "ปิดเรื่อง" 1 ครั้ง (ล้มเหลวไม่กระทบการบันทึกกินยา)
doseService.setAfterTaken((ids) => escalationService.notifyResolved(db, lineClient, ids, lineEnv.pick((k) => process.env[k])));

// อุ่น Gemini 1 ครั้งตอนเริ่ม (ไม่บล็อก ไม่ล้มเหลวทั้งระบบ)
require('./lib/gemini-warmup').warmup().catch(() => {});

module.exports = {
  uiPort: process.env.PORT || 1880,
  flowFile: 'flows.json',
  flowFilePretty: true,                       // diff ใน git อ่านง่าย
  credentialSecret: process.env.NODE_RED_CREDENTIAL_SECRET,

  // รับรูปซองยาแบบ base64 ได้ (default ของ Node-RED คือ 5mb; รูป 8 MB เป็น base64 ≈ 10.7 MB จึงตั้ง 12mb)
  apiMaxLength: '12mb',

  // ล็อก editor ด้วยรหัสผ่าน (สำคัญเมื่อเปิด tunnel) ; ไม่มี hash ที่ถูกต้อง = ปิด editor + admin API ทั้งหมด
  ...(admin.enabled ? { adminAuth: admin.adminAuth } : { httpAdminRoot: false }),

  // เก็บ raw bytes ของ POST /line/webhook ไว้ใน req.body (Buffer) — ต้องคำนวณ HMAC จาก bytes จริง ห้าม JSON.stringify ซ้ำ (lib/raw-body.js จับเฉพาะ POST + path นี้แบบ exact)
  // httpAdminMiddleware: admin app ผูกที่ "/" และมี bodyParser.json ของตัวเองรันก่อน route ของ http-in ทุกตัว (middleware นี้อยู่ก่อน parser นั้น แต่หลัง CORS ; ไม่ข้าม auth เพราะ admin ไม่มี route นี้)
  // httpNodeMiddleware: ใช้ตอน editor/admin ถูกปิด (httpAdminRoot: false → ไม่มี admin app) — ตั้งคู่กันเสมอ ตัวที่สองข้ามเองเมื่อ req._body ถูกตั้งแล้ว
  httpAdminMiddleware: rawBody,
  httpNodeMiddleware: rawBody,

  // ให้ function node ใช้ผ่าน global.get('jwt') เป็นต้น
  functionGlobalContext: {
    jwt: require('jsonwebtoken'),
    bcrypt: require('bcryptjs'),
    webpush: require('web-push'),
    crypto: require('crypto'),
    medicineValidator,
    db,                                       // db.query / db.withTransaction (ดู lib/db.js)
    medicationService,
    doseService,
    scanService,
    prescriptionService,
    lineClient,                               // reply/push/getProfile/quota (lib/line-client.js)
    lineService,                              // signature, รหัสเชื่อม, event ของ webhook
    caregiverService,
    reminderService,                          // cron ส่งเตือน / demo (lib/reminder-service.js)
    escalationService,                        // แจ้งญาติเมื่อลืมกินยา / ปิดเรื่อง / demo (lib/escalation-service.js)
    stockService,                             // แจ้งยาใกล้หมด / is_low / demo (lib/stock-service.js)
    lineEnv,                                  // pick(env.get) → env ที่ lib ฝั่ง LINE ใช้ (lib/line-env.js)
    llmOutput,                                // process / reviewFlags / redactPii (lib/validate-llm-output.js)
    prompts: {
      medicineSystem: readPrompt('medicine-parse.system.txt'),
      medicineUserImage: readPrompt('medicine-parse.user.image.txt'),
      medicineUserText: readPrompt('medicine-parse.user.text.txt'),
      medicineSchema,
      medicineGeminiSchema: scanService.toGeminiSchema(medicineSchema),   // สำเนาที่ตัด keyword ที่ Gemini ไม่รองรับ
      mockResponse: JSON.parse(readPrompt('mock-response.json'))
    }
  },
  functionExternalModules: true,

  // frontend เรียกผ่าน nginx (same origin) จึงไม่ต้องเปิด CORS
  // ถ้า dev ด้วย ng serve แบบไม่ใช้ proxy ให้เปิดบรรทัดด้านล่าง
  // httpNodeCors: { origin: 'http://localhost:4200', methods: 'GET,PUT,POST,PATCH,DELETE' },

  logging: {
    console: { level: 'info', metrics: false, audit: false }
  },

  editorTheme: {
    page: { title: 'YaTung · Node-RED' },
    header: { title: 'YaTung (ยาตรง)' },
    projects: { enabled: false }
  }
};
