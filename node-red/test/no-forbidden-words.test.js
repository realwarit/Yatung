// กันคำที่ทำให้แอปดูเป็นของคนกลุ่มเดียวหลุดไปในข้อความที่ผู้ใช้เห็น (วันที่ 11)
// คำต้องห้าม: ป่วย (รวมผู้ป่วย) / ผู้ดูแล / ญาติ / คนไข้ / ผู้สูงอายุ / คนแก่ / ลูกหลาน → ใช้ "คุณ" หรือ "คนที่ห่วงใย"
// ไม่สแกนไฟล์พรอมต์ Gemini / schema / mock / validate-llm-output (ข้อยกเว้นตามแผน 2.5 : token [ชื่อผู้ป่วย] ฝั่ง server)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../data/lib/line-messages');

const ROOT = path.resolve(__dirname, '..', '..');
const FORBIDDEN = /ป่วย|ผู้ดูแล|ญาติ|คนไข้|ผู้สูงอายุ|คนแก่|ลูกหลาน/;

// ถอด \uXXXX / \u{XXXXX} ก่อนตรวจ (bundle ของ Angular บางไฟล์เข้ารหัสข้อความไทยแบบนี้)
const unescape = (s) => s
  .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
// ข้อยกเว้นที่อนุมัติ (ส่วนที่ 3 / 3.1 ข้อ 4) : อนุญาต *เฉพาะสตริง* `[ชื่อผู้ป่วย]` ในไฟล์ที่ระบุ เพราะเป็น token ปิดชื่อที่พรอมต์ Gemini ใช้
// (หน้า Review แสดงเป็น [ชื่อ]) ; คำต้องห้ามอื่นในไฟล์เดียวกันยังถูกตรวจ ไฟล์อื่นห้ามมี
const ALLOWED_STRING = { 'frontend/src/app/features/review/review.model.ts': ['[ชื่อผู้ป่วย]'] };
const withoutAllowed = (rel, s) => (ALLOWED_STRING[rel] || []).reduce((acc, a) => acc.split(a).join(''), s);
const findForbidden = (s) => { const m = FORBIDDEN.exec(unescape(s)); return m ? m[0] : null; };

// ตัดคอมเมนต์ (// ที่ต้นบรรทัด/หลังช่องว่าง, /* */, <!-- -->) — ไม่ใช่ข้อความที่ผู้ใช้เห็น
const stripComments = (s) => s
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|\s)\/\/.*$/gm, '$1');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!e.name.includes(' ')) walk(p, out); }
    else out.push(p);
  }
  return out;
}

test('ตัวควบคุมบวก: ตัวตรวจจับคำต้องห้ามทั้งแบบปกติและแบบ \\uXXXX', () => {
  assert.equal(findForbidden('สำหรับผู้ป่วยและญาติ'), 'ป่วย');
  assert.equal(findForbidden('ญาติยืนยัน'), 'ญาติ');
  assert.equal(findForbidden('\\u0e1c\\u0e39\\u0e49\\u0e14\\u0e39\\u0e41\\u0e25'), 'ผู้ดูแล');
  assert.equal(findForbidden('\\u0e0d\\u0e32\\u0e15\\u0e34'), 'ญาติ');
  assert.equal(findForbidden('ขอบคุณที่ช่วยดูแลนะคะ'), null);
  assert.equal(findForbidden('คนที่ห่วงใยยืนยันแล้ว'), null);
  // ตัดคอมเมนต์แล้วคำในคอมเมนต์ไม่ถูกนับ แต่คำในสตริงยังถูกนับ
  assert.equal(findForbidden(stripComments("// ผู้ป่วย\nconst a = 1;")), null);
  assert.equal(findForbidden(stripComments("<!-- ญาติ --><p>ok</p>")), null);
  assert.equal(findForbidden(stripComments("const a = 'ผู้ดูแล'; // ok")), 'ผู้ดูแล');
  assert.equal(findForbidden(stripComments("const u = 'https://x.test/ญาติ';")), 'ญาติ');
});

test('ข้อยกเว้น token: ตัดเฉพาะสตริงที่ระบุ คำอื่นยังถูกจับ และไฟล์ที่ไม่อยู่ในรายการไม่ได้รับยกเว้น', () => {
  const rel = 'frontend/src/app/features/review/review.model.ts';
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  assert.ok(stripComments(src).includes('[ชื่อผู้ป่วย]'), 'ข้อยกเว้นต้องตรงกับโค้ดจริง');
  assert.equal(findForbidden(withoutAllowed(rel, stripComments(src))), null);
  assert.equal(findForbidden(withoutAllowed(rel, "const a = '[ชื่อผู้ป่วย]' + 'ผู้ดูแล';")), 'ผู้ดูแล');
  assert.equal(findForbidden(withoutAllowed('frontend/src/app/other.ts', "const a = '[ชื่อผู้ป่วย]';")), 'ป่วย');
});

test('ตัวสแกนไฟล์หาไฟล์เจอจริง (ไม่ผ่านเพราะสแกนไม่ได้อะไร)', () => {
  const fe = walk(path.join(ROOT, 'frontend', 'src', 'app')).filter((f) => /\.(ts|html)$/.test(f) && !/\.spec\.ts$/.test(f));
  assert.ok(fe.length > 100, `พบไฟล์ frontend ${fe.length}`);
  assert.ok(fs.existsSync(path.join(ROOT, 'frontend', 'public', 'manifest.webmanifest')));
});

test('ไฟล์ frontend ที่ผู้ใช้เห็น (ts/html ไม่รวม spec) ไม่มีคำต้องห้าม', () => {
  const files = walk(path.join(ROOT, 'frontend', 'src', 'app')).filter((f) => /\.(ts|html)$/.test(f) && !/\.spec\.ts$/.test(f));
  const hits = [];
  for (const f of files) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    const w = findForbidden(withoutAllowed(rel, stripComments(fs.readFileSync(f, 'utf8'))));
    if (w) hits.push(`${rel}: ${w}`);
  }
  assert.deepEqual(hits, []);
});

test('manifest + index.html ไม่มีคำต้องห้าม', () => {
  for (const f of ['frontend/public/manifest.webmanifest', 'frontend/src/index.html']) {
    assert.equal(findForbidden(stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'))), null, f);
  }
});

test('lib ฝั่ง LINE / Web Push ที่ส่งข้อความหาผู้ใช้ ไม่มีคำต้องห้ามในสตริง', () => {
  const libs = ['line-messages', 'line-flex', 'line-service', 'caregiver-service', 'escalation-service', 'labels-th', 'push-service',
    'reminder-service', 'stock-service', 'notify-service', 'dose-service', 'medication-service', 'stats-service', 'adherence-level'];
  const hits = [];
  for (const n of libs) {
    const f = path.join(ROOT, 'node-red', 'data', 'lib', n + '.js');
    if (!fs.existsSync(f)) continue;
    const w = findForbidden(stripComments(fs.readFileSync(f, 'utf8')));
    if (w) hits.push(`${n}.js: ${w}`);
  }
  assert.deepEqual(hits, []);
});

test('ข้อความ LINE จริงทุกแบบ (samples + TEXT) ที่สร้างตอนรัน ไม่มีคำต้องห้าม', () => {
  const env = { PUBLIC_BASE_URL: 'https://demo.example.test', DEMO_MODE: 'true' };
  const blob = JSON.stringify(M.samples(env)) + JSON.stringify([
    M.TEXT.caregiverOnly(['สมชาย', 'มาลี']), M.TEXT.cgNoAuth(), M.TEXT.cgAck(), M.TEXT.conflict(), M.TEXT.help(), M.TEXT.notLinked(), M.TEXT.invalid(10),
    M.caregiverTakeResult({ taken: [{ name: 'ก', slot: 'noon' }], already: [{ name: 'ข', slot: 'noon', at: '12:00', by: 'caregiver' }, { name: 'ค', slot: 'noon', at: '12:01', by: 'self' }] }),
  ]);
  assert.ok(blob.length > 5000, 'ต้องมีข้อความให้ตรวจจริง');
  assert.ok(blob.includes('คนที่ห่วงใย'), 'ตัวควบคุมบวก: ข้อความใหม่ต้องปรากฏ');
  assert.equal(findForbidden(blob), null);
});
