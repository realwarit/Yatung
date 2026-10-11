#!/usr/bin/env node
// สร้างคู่คีย์ VAPID สำหรับ Web Push แล้วเขียนลง .env — ให้ "ผู้ใช้" รันเอง (Claude Code ไม่รันกับ .env จริง)
//   node scripts/gen-vapid.mjs                 # เขียน VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY ลง .env ที่ root ของโปรเจกต์
//   node scripts/gen-vapid.mjs --env path/.env # ชี้ไฟล์อื่น (ใช้ทดสอบ)
//   node scripts/gen-vapid.mjs --dry-run       # สร้างแล้วแสดงเฉพาะ public key โดยไม่เขียนไฟล์
// กฎ:
//   - ไม่เขียนทับคีย์ที่มีอยู่: ถ้ามีทั้งคู่แล้ว = ไม่ทำอะไร (แสดง public key ที่มีอยู่) ; ถ้ามีแค่ตัวเดียว = หยุดพร้อมบอกให้ตรวจเอง
//   - รักษาลำดับ คอมเมนต์ และ CRLF/LF เดิมของ .env : แก้เฉพาะบรรทัด VAPID_PUBLIC_KEY= / VAPID_PRIVATE_KEY= (ไม่มีบรรทัด = ต่อท้ายไฟล์)
//   - แสดงเฉพาะ public key ; ไม่พิมพ์ private key ทางหน้าจอ/log เด็ดขาด ; ไม่แตะ VAPID_SUBJECT
//   - เขียนผ่านไฟล์ชั่วคราวแล้วเปลี่ยนชื่อ (ไฟล์ .env ไม่เสียหายถ้าเขียนไม่จบ)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

// คู่คีย์ P-256 แบบเดียวกับ `web-push generate-vapid-keys` : public = 65 ไบต์ (uncompressed point), private = 32 ไบต์ ทั้งคู่ base64url
export function generateVapidKeys() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  // getPrivateKey() ตัด 0 นำหน้า (~1/256 ของคีย์) → เติมให้ครบ 32 ไบต์
  return { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(Buffer.concat([Buffer.alloc(32), ecdh.getPrivateKey()]).subarray(-32)) };
}

// ค่าของ KEY ในข้อความ .env (ตัดคอมเมนต์ท้ายบรรทัดและเครื่องหมายคำพูด) ; ไม่มีบรรทัด = null
export function readValue(text, key) {
  const m = new RegExp('^' + key + '=([^\\r\\n]*)$', 'm').exec(text);
  if (!m) return null;
  let v = m[1].replace(/\s+#.*$/, '').trim();
  if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
  return v;
}

function setValue(text, key, value) {
  const re = new RegExp('^(' + key + '=)[^\\r\\n]*?(\\s+#[^\\r\\n]*)?(\\r?)$', 'm');
  if (re.test(text)) return text.replace(re, (_, k, cmt, cr) => k + value + (cmt || '') + cr);
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  return text + (text.endsWith('\n') || text === '' ? '' : nl) + key + '=' + value + nl;
}

// คืน { action: 'created'|'exists'|'dry-run'|'partial', publicKey? } ; ไม่เคยคืน private key
export function run({ envPath, dryRun = false, gen = generateVapidKeys } = {}) {
  const text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const pub = readValue(text, 'VAPID_PUBLIC_KEY');
  const priv = readValue(text, 'VAPID_PRIVATE_KEY');
  if (pub && priv) return { action: 'exists', publicKey: pub };
  if (pub || priv) return { action: 'partial' };
  const { publicKey, privateKey } = gen();
  if (dryRun) return { action: 'dry-run', publicKey };
  let next = setValue(text, 'VAPID_PUBLIC_KEY', publicKey);
  next = setValue(next, 'VAPID_PRIVATE_KEY', privateKey);
  const tmp = envPath + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, next, { mode: 0o600 });
  fs.renameSync(tmp, envPath);
  return { action: 'created', publicKey };
}

function main() {
  const args = process.argv.slice(2);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const i = args.indexOf('--env');
  const envPath = i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : path.join(root, '.env');
  if (!fs.existsSync(envPath) && i < 0) { console.error('ไม่พบ ' + envPath + ' — คัดลอก .env.example เป็น .env ก่อน'); process.exit(1); }
  const r = run({ envPath, dryRun: args.includes('--dry-run') });
  if (r.action === 'partial') {
    console.error('✘ .env มี VAPID_PUBLIC_KEY หรือ VAPID_PRIVATE_KEY เพียงตัวเดียว — ไม่เขียนทับ ตรวจเองแล้วลบ/ใส่ให้ครบทั้งคู่ก่อนรันใหม่');
    process.exit(1);
  }
  console.log({ created: '✔ สร้างคีย์ใหม่แล้วเขียนลง .env', exists: '✔ มีคีย์อยู่แล้ว — ไม่เขียนทับ', 'dry-run': '(dry-run — ไม่ได้เขียนไฟล์)' }[r.action]);
  console.log('VAPID_PUBLIC_KEY=' + r.publicKey);
  if (r.action === 'created') {
    console.log('(private key เขียนลง .env แล้ว ไม่แสดงบนหน้าจอ)');
    console.log('ถัดไป: ตั้ง VAPID_SUBJECT ใน .env (mailto:อีเมลที่เป็นของคุณ หรือ https://<NGROK_DOMAIN>) แล้ว docker compose up -d --force-recreate nodered');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
