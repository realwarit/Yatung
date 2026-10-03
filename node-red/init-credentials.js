// สร้าง node-red/data/flows_cred.json (เข้ารหัสแบบเดียวกับ Node-RED) จากค่าใน .env
// ใช้เพราะ node-red-node-mysql อ่าน user/password ได้จาก credentials เท่านั้น (ไม่รองรับ ${ENV})
// รัน: node node-red/init-credentials.js   (ต้องหยุด nodered ก่อน: docker compose stop nodered)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
}
for (const k of ['NODE_RED_CREDENTIAL_SECRET', 'DB_USER', 'DB_PASSWORD']) {
  if (!env[k]) throw new Error(k + ' ไม่มีใน .env');
}

const creds = { mysql_cfg: { user: env.DB_USER, password: env.DB_PASSWORD } };
const key = crypto.createHash('sha256').update(env.NODE_RED_CREDENTIAL_SECRET).digest();
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv('aes-256-ctr', key, iv);
const enc = iv.toString('hex') + cipher.update(JSON.stringify(creds), 'utf8', 'base64') + cipher.final('base64');
fs.writeFileSync(path.join(__dirname, 'data', 'flows_cred.json'), JSON.stringify({ $: enc }, null, 4));
console.log('wrote node-red/data/flows_cred.json');
