// ตั้งค่า editor/admin API ของ Node-RED แบบ fail closed
// - NODE_RED_ADMIN_HASH ต้องเป็น bcrypt hash ที่ถูกรูปแบบ ; ว่าง/ไม่มี/รูปแบบผิด = ปิด editor และ admin API ทั้งหมด (httpAdminRoot: false)
//   โดย http-in (/api/*, /line/webhook) ยังทำงานตามปกติ — ไม่มี hash สำรอง ไม่ใช้ค่าเริ่มต้น
// - ห้าม log ค่า hash ; log ได้แค่เหตุผล
const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
// hash ของรหัส "demo1234" ที่อยู่ใน .env.example — ยังใช้ได้แต่เตือนเสียงดัง (เฉพาะเครื่อง dev)
const SAMPLE_HASH = '$2a$10$JlkiZMzaRrvZFFKXT3ZhT.B4k9YWBUEIdj8L5xje3rXu2Ir6jVZzC';

function resolveAdmin(env = process.env) {
  const hash = String(env.NODE_RED_ADMIN_HASH || '').trim();
  const user = String(env.NODE_RED_ADMIN_USER || 'admin').trim() || 'admin';
  if (!hash) return { enabled: false, reason: 'NODE_RED_ADMIN_HASH ว่างหรือไม่ได้ตั้ง' };
  if (!BCRYPT.test(hash)) return { enabled: false, reason: 'NODE_RED_ADMIN_HASH ไม่ใช่ bcrypt hash ที่ถูกรูปแบบ' };
  return {
    enabled: true,
    sample: hash === SAMPLE_HASH,
    adminAuth: { type: 'credentials', users: [{ username: user, password: hash, permissions: '*' }] }
  };
}

module.exports = { resolveAdmin, BCRYPT, SAMPLE_HASH };
