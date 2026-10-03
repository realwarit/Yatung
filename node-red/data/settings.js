// Node-RED settings สำหรับ YaTung — ไฟล์นี้อยู่ใน /data (bind mount)
// โมดูลภายนอกติดตั้งใน image ที่ /usr/src/node-red/node_modules (ดู Dockerfile: NODE_PATH)

const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const PROMPT_DIR = path.join(__dirname, 'prompts');
const readPrompt = (file) => fs.readFileSync(path.join(PROMPT_DIR, file), 'utf8');

// compile JSON Schema ครั้งเดียวตอน start
const medicineSchema = JSON.parse(readPrompt('medicine-parse.schema.json'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const medicineValidator = ajv.compile(medicineSchema);

module.exports = {
  uiPort: process.env.PORT || 1880,
  flowFile: 'flows.json',
  flowFilePretty: true,                       // diff ใน git อ่านง่าย
  credentialSecret: process.env.NODE_RED_CREDENTIAL_SECRET,

  // รับรูปซองยาแบบ base64 ได้ (default ของ Node-RED คือ 5mb)
  apiMaxLength: '10mb',

  // ล็อก editor ด้วยรหัสผ่าน (สำคัญเมื่อเปิด tunnel)
  adminAuth: process.env.NODE_RED_ADMIN_HASH ? {
    type: 'credentials',
    users: [{
      username: process.env.NODE_RED_ADMIN_USER || 'admin',
      password: process.env.NODE_RED_ADMIN_HASH,
      permissions: '*'
    }]
  } : undefined,

  // ให้ function node ใช้ผ่าน global.get('jwt') เป็นต้น
  functionGlobalContext: {
    jwt: require('jsonwebtoken'),
    bcrypt: require('bcryptjs'),
    webpush: require('web-push'),
    crypto: require('crypto'),
    medicineValidator,
    prompts: {
      medicineSystem: readPrompt('medicine-parse.system.txt'),
      medicineUser: readPrompt('medicine-parse.user.txt'),
      medicineSchema
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
