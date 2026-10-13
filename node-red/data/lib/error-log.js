// log ของ group "ข้อผิดพลาดที่ไม่คาดคิด → 500" ทุก tab — ฟังก์ชันกลางตัวเดียว (global `errorLog`)
//   function node ใน catch: global.get('errorLog').report(node, msg)
// log เฉพาะ: err.code · err.message (ปิดข้อมูลส่วนตัว ตัด ≤ 200 ตัวอักษร) · method + path (ไม่รวม query) · id ของ node ต้นเหตุ
// ห้าม log: body, token, header, userId เต็ม, ค่าจาก .env → ไม่อ่านอะไรจาก msg นอก msg.error / msg.req.method / msg.req.originalUrl
const MAX_MESSAGE = 200;
const MAX_PATH = 120;

function clean(text) {
  return String(text == null ? '' : text)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*/g, '[jwt]')                  // JWT
    .replace(/Bearer\s+\S+/gi, 'Bearer [token]')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')                    // อีเมล (เช่น Duplicate entry 'a@b.c' for key …)
    .replace(/(Duplicate entry\s+)'[^']*'/gi, "$1'[value]'")
    .replace(/\b\d{13}\b/g, '[เลข13หลัก]')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// รหัส error: err.code ถ้ามี ไม่งั้นดึง ER_xxx / ECONNxxx จากข้อความ
function codeOf(err) {
  if (err && err.code) return String(err.code).replace(/[^\w.-]/g, '').slice(0, 40) || 'none';
  const m = /\b(ER_[A-Z0-9_]+|E[A-Z]{3,}[A-Z_]*)\b/.exec(String((err && err.message) || ''));
  return m ? m[1] : 'none';
}

// path จากคำขอ http-in : ตัด query/fragment ; segment ยาว/ดูเป็น token → :x
function pathOf(req) {
  const raw = req && (req.originalUrl || req.url);
  if (!raw) return '-';
  const p = String(raw).split('?')[0].split('#')[0];
  const safe = p.split('/').map((seg) => (seg.length > 24 && /^[\w-]+$/.test(seg) ? ':x' : seg)).join('/');
  return truncate(clean(safe), MAX_PATH);
}

function describe(msg) {
  const err = (msg && msg.error) || {};
  const req = (msg && msg.req) || null;
  const src = err.source && err.source.id ? String(err.source.id).replace(/[^\w.-]/g, '').slice(0, 40) : '-';
  return {
    code: codeOf(err),
    message: truncate(clean(err.message || 'unknown error'), MAX_MESSAGE),
    method: req && req.method ? String(req.method).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10) : '-',
    path: pathOf(req),
    node: src
  };
}

function format(msg) {
  const d = describe(msg);
  return `unexpected_error method=${d.method} path=${d.path} code=${d.code} node=${d.node} message="${d.message}"`;
}

// เรียกจาก function node: บันทึกลง log ของ Node-RED (ไม่ส่ง msg เข้า node.error เพื่อไม่ให้ catch วนซ้ำ)
function report(node, msg) {
  const line = format(msg);
  if (node && typeof node.error === 'function') node.error(line);
  else console.error(line);
  return line;
}

module.exports = { describe, format, report, codeOf, pathOf, clean, MAX_MESSAGE };
