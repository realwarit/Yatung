const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseChannels, applyLineQuota, rowChannels, HAS_CHANNEL_SQL } = require('../data/lib/notify-service');

const T = (name, input, want) => test('เลือกช่องทาง: ' + name, () => assert.deepEqual(chooseChannels(input), want));

T('เชื่อม LINE อย่างเดียว → LINE', { lineUserId: 'U1', hasPush: false, notifyBoth: 0 }, { line: true, push: false });
T('เชื่อม LINE + มีเครื่อง (ไม่เปิด notify_both) → LINE อย่างเดียว', { lineUserId: 'U1', hasPush: true, notifyBoth: 0 }, { line: true, push: false });
T('เชื่อม LINE + มีเครื่อง + notify_both → ทั้งสองทาง', { lineUserId: 'U1', hasPush: true, notifyBoth: 1 }, { line: true, push: true });
T('notify_both เป็น "1" จาก SQL', { lineUserId: 'U1', hasPush: true, notifyBoth: '1' }, { line: true, push: true });
T('notify_both แต่ไม่มีเครื่อง → LINE อย่างเดียว', { lineUserId: 'U1', hasPush: false, notifyBoth: 1 }, { line: true, push: false });
T('ไม่เชื่อม LINE + มีเครื่อง → Web Push', { lineUserId: null, hasPush: true, notifyBoth: 0 }, { line: false, push: true });
T('ไม่เชื่อม LINE + มีเครื่อง + notify_both → Web Push', { lineUserId: null, hasPush: true, notifyBoth: 1 }, { line: false, push: true });
T('ไม่มีช่องทางเลย → ไม่ส่ง', { lineUserId: null, hasPush: false, notifyBoth: 0 }, { line: false, push: false });
T('ระบบยังไม่ตั้ง VAPID (pushReady=false) → ไม่ใช้ Web Push', { lineUserId: null, hasPush: true, notifyBoth: 0, pushReady: false }, { line: false, push: false });
T('pushReady=false แต่เชื่อม LINE + notify_both → LINE อย่างเดียว', { lineUserId: 'U1', hasPush: true, notifyBoth: 1, pushReady: false }, { line: true, push: false });

test('โควตา LINE เต็ม + มีเครื่อง → ใช้ Web Push แทน', () => {
  assert.deepEqual(applyLineQuota({ line: true, push: false }, false, { hasPush: true }), { line: false, push: true });
});
test('โควตา LINE เต็ม + ไม่มีเครื่อง → ไม่เหลือช่องทาง (ไม่จอง)', () => {
  assert.deepEqual(applyLineQuota({ line: true, push: false }, false, { hasPush: false }), { line: false, push: false });
});
test('โควตา LINE เต็ม + VAPID ไม่พร้อม → ไม่เหลือช่องทาง', () => {
  assert.deepEqual(applyLineQuota({ line: true, push: false }, false, { hasPush: true, pushReady: false }), { line: false, push: false });
});
test('ทั้งสองทาง + โควตา LINE เต็ม → เหลือ Web Push', () => {
  assert.deepEqual(applyLineQuota({ line: true, push: true }, false, { hasPush: true }), { line: false, push: true });
});
test('โควตา LINE ยังพอ → ไม่เปลี่ยน', () => {
  assert.deepEqual(applyLineQuota({ line: true, push: false }, true, { hasPush: true }), { line: true, push: false });
});
test('rowChannels อ่านคอลัมน์จาก SQL', () => {
  assert.deepEqual(rowChannels({ line_user_id: null, has_push: '1', notify_both: 0 }, true), { line: false, push: true });
  assert.deepEqual(rowChannels({ line_user_id: 'U', has_push: 0, notify_both: 1 }, true), { line: true, push: false });
});
test('SQL: มีเงื่อนไขช่องทางครบ', () => assert.match(HAS_CHANNEL_SQL, /line_user_id IS NOT NULL OR EXISTS.*push_subscriptions/));
