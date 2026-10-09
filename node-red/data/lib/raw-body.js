// middleware เก็บ raw bytes ของ POST /line/webhook (ต้องคำนวณ HMAC จาก bytes จริง)
// จับเฉพาะ method POST และ path "/line/webhook" แบบ exact (case-sensitive, ไม่มี trailing slash) — ที่เหลือส่งต่อ next() ทันที
// จึงไม่แตะ body-parser.json ของ admin/http-in ของ route อื่น และไม่ข้ามขั้นตอน auth ของ admin
// (ถ้า path สะกดต่างจากนี้ แต่ Express route ยังตรง เช่น /LINE/webhook → ไม่มี raw body → ตรวจ signature ไม่ผ่าน = 401 ปลอดภัย)
const WEBHOOK_PATH = '/line/webhook';

function createRawBodyMiddleware(expressImpl) {
  const raw = (expressImpl || require('express')).raw({ type: () => true, limit: '1mb' });
  return function lineRawBody(req, res, next) {
    return req.method === 'POST' && req.path === WEBHOOK_PATH ? raw(req, res, next) : next();
  };
}

module.exports = { createRawBodyMiddleware, WEBHOOK_PATH };
