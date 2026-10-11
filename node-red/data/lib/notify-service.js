// เลือกช่องทางส่งแจ้งเตือนผู้ป่วย (วันที่ 7C) — ใช้กับเตือนปกติ เตือนซ้ำ และยาใกล้หมด (แจ้งญาติใช้ LINE อย่างเดียว ไม่ผ่านที่นี่)
//   เชื่อม LINE แล้ว                                   → LINE
//   ยังไม่เชื่อม LINE แต่มีเครื่องที่เปิดแจ้งเตือนไว้        → Web Push
//   เชื่อม LINE + เปิด users.notify_both + มีเครื่อง        → ทั้งสองทาง
// ช่องทางใดก็ตามต้องผ่านการ "จองก่อนส่ง" ตัวเดียวกัน (reminded_at / followup_at / refill_alerted_at) — ผู้เรียกจองครั้งเดียวแล้วค่อยส่งทุกช่องทาง
// Web Push ไม่นับโควตา LINE ; ถ้าโควตา LINE เต็มแต่มีเครื่องที่เปิดแจ้งเตือน → ใช้ Web Push แทน (fallbackToPush)

// input: { lineUserId, hasPush, notifyBoth, pushReady } → { line, push }
function chooseChannels({ lineUserId, hasPush, notifyBoth, pushReady = true }) {
  const canPush = !!hasPush && !!pushReady;
  const line = !!lineUserId;
  const push = canPush && (!line || !!Number(notifyBoth));
  return { line, push };
}

// หลังรู้ผลโควตา LINE : lineAllowed=false → ตัดช่อง LINE ออก ; ถ้าเหลือไม่มีช่องไหนแต่มีเครื่อง → ใช้ Web Push แทน
function applyLineQuota(channels, lineAllowed, { hasPush, pushReady = true } = {}) {
  const out = { ...channels };
  if (out.line && !lineAllowed) {
    out.line = false;
    if (!out.push && hasPush && pushReady) out.push = true;
  }
  return out;
}

// แถวจาก SQL ที่มีคอลัมน์ line_user_id, has_push, notify_both
const rowChannels = (row, pushReady) => chooseChannels({ lineUserId: row.line_user_id, hasPush: !!Number(row.has_push), notifyBoth: row.notify_both, pushReady });

// SQL ส่วนที่ใช้ซ้ำ : คอลัมน์ + เงื่อนไข "มีช่องทางอย่างน้อยหนึ่ง"
const CHANNEL_COLS = 'u.notify_both, EXISTS(SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = u.id) AS has_push';
const HAS_CHANNEL_SQL = '(u.line_user_id IS NOT NULL OR EXISTS(SELECT 1 FROM push_subscriptions ps2 WHERE ps2.user_id = u.id))';

module.exports = { chooseChannels, applyLineQuota, rowChannels, CHANNEL_COLS, HAS_CHANNEL_SQL };
