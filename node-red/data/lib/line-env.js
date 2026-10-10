// ตัวแปรสภาพแวดล้อมที่ lib ฝั่ง LINE ใช้ (สร้างลิงก์/รูป/โหมดเดโม) — function node ใน flow ไม่มี process.env จึงอ่านผ่าน env.get() แล้วส่งเป็นอ็อบเจกต์
// ใช้: global.get('lineEnv').pick((k) => env.get(k))
const KEYS = ['PUBLIC_BASE_URL', 'LINE_ASSET_BASE', 'LINE_MASCOT_URL', 'DEMO_MODE', 'REMINDER_ONLY_EMAIL_SUFFIX', 'LINE_OA_BASIC_ID', 'REMINDER_FOLLOWUP_MIN'];

function pick(get) {
  const out = {};
  for (const k of KEYS) {
    const v = get(k);
    if (v !== undefined && v !== null && v !== '') out[k] = String(v);
  }
  return out;
}

module.exports = { pick, KEYS };
