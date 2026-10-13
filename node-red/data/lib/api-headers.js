// middleware ของ /api/*: ห้ามแคชทุกคำตอบ (ข้อมูลสุขภาพ + กัน 304)
//   - ตั้ง Cache-Control: private, no-store
//   - ตัด If-None-Match / If-Modified-Since ของคำขอ → Express ไม่ตอบ 304 แม้เบราว์เซอร์/service worker เก็บ ETag ไว้ (iOS เคยเห็น 304 ถูกส่งถึงแอป = error ทั่วไป)
// path อื่น (/line/webhook, editor) ไม่แตะ
function noStoreApi(req, res, next) {
  const p = req.path || (req.url || '').split('?')[0];
  if (p.startsWith('/api/')) {
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];
    res.setHeader('Cache-Control', 'private, no-store');
  }
  next();
}
module.exports = { noStoreApi };
