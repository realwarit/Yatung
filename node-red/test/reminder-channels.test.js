// เตือนผ่านหลายช่องทาง (7C): reminderService.run / runFollowup + stockService.run เลือก LINE / Web Push / ทั้งสอง ด้วย db / client / push ปลอม
const test = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../data/lib/reminder-service');
const stock = require('../data/lib/stock-service');

// DB ปลอม: dose_logs (จองด้วย reminded / followup) — ตอบ SQL ของ run() / runFollowup() ด้วยแถวที่ตั้งไว้
function makeDb(rows) {
  const table = rows.map((r) => ({ reminded: false, followed: false, status: 'pending', ...r }));
  let chain = Promise.resolve();
  const toRow = (r) => ({
    id: r.id, user_id: r.user_id, slot: r.slot || 'morning', scheduled_at: r.scheduled_at || '2026-10-09 08:00:00', was_reminded: r.reminded ? 1 : 0, late_sec: 60,
    name: r.name || 'SECRET-DRUG', strength: '500 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'after',
    line_user_id: r.line === undefined ? 'U' + r.user_id : r.line, notify_both: r.notify_both || 0, has_push: r.has_push ? 1 : 0
  });
  return {
    table,
    async query(sql) {
      if (/d\.reminded_at IS NULL AND d\.scheduled_at <= NOW\(\)/.test(sql)) return table.filter((r) => r.status === 'pending' && !r.reminded).map(toRow);
      if (/d\.reminded_at IS NOT NULL AND d\.followup_at IS NULL/.test(sql)) return table.filter((r) => r.status === 'pending' && r.reminded && !r.followed).map(toRow);
      throw new Error('unexpected sql ' + sql.slice(0, 60));
    },
    withTransaction(fn) {
      const run = chain.then(() => fn({
        query: async (sql, params) => {
          if (/FOR UPDATE/.test(sql)) {
            const flag = /followup_at IS NULL/.test(sql) ? 'followed' : 'reminded';
            return [table.filter((r) => params[0].includes(r.id) && r.status === 'pending' && !r[flag]).map((r) => ({ id: r.id }))];
          }
          if (/SET reminded_at/.test(sql)) { table.filter((r) => params[0].includes(r.id)).forEach((r) => { r.reminded = true; }); return [{}]; }
          if (/SET followup_at/.test(sql)) { table.filter((r) => params[0].includes(r.id)).forEach((r) => { r.followed = true; }); return [{}]; }
          throw new Error('unexpected tx sql');
        }
      }));
      chain = run.catch(() => {});
      return run;
    }
  };
}
const fakeLine = (opts = {}) => {
  const pushes = [];
  return {
    pushes,
    canPush: async () => ({ allowed: opts.allowed !== false, left: 5, status: {} }),
    push: async (to, messages, meta) => { pushes.push({ to, messages, meta }); await new Promise((r) => setTimeout(r, 3)); return { ok: true, status: 200 }; }
  };
};
const fakePush = (opts = {}) => {
  const sent = [];
  return {
    sent,
    configured: () => opts.configured !== false,
    newActionToken: (uid, ids) => `T-${uid}-${ids.join('_')}`,
    sendToUser: async (db, userId, payload, meta) => { sent.push({ userId, payload, meta }); await new Promise((r) => setTimeout(r, 3)); return { subs: 1, sent: opts.fail ? 0 : 1, failed: opts.fail ? 1 : 0, removed: 0 }; }
  };
};
const ENV = { PUBLIC_BASE_URL: 'https://x.ngrok-free.dev' };

test('ไม่เชื่อม LINE + มีเครื่อง → Web Push อย่างเดียว (จอง reminded_at, payload ไม่มีชื่อยา)', async () => {
  const db = makeDb([{ id: 1, user_id: 7, line: null, has_push: true }]);
  const line = fakeLine(), push = fakePush();
  const r = await svc.run(db, line, ENV, push);
  assert.equal(line.pushes.length, 0);
  assert.equal(push.sent.length, 1);
  assert.deepEqual([r.groups, r.sent, r.push_sent], [1, 0, 1]);
  assert.equal(push.sent[0].payload.notification.title, '⏰ ถึงเวลากินยามื้อเช้าแล้ว');
  assert.equal(push.sent[0].payload.notification.data.onActionClick.take.url, '/today?take=T-7-1');
  assert.equal(push.sent[0].meta.kind, 'reminder');
  assert.equal(JSON.stringify(push.sent[0].payload).includes('SECRET-DRUG'), false);
  assert.equal(db.table[0].reminded, true);
});
test('เชื่อม LINE อย่างเดียว / มีเครื่องแต่ notify_both ปิด → LINE ทางเดียว', async () => {
  const db = makeDb([{ id: 1, user_id: 7 }, { id: 2, user_id: 8, has_push: true }]);
  const line = fakeLine(), push = fakePush();
  await svc.run(db, line, ENV, push);
  assert.equal(line.pushes.length, 2);
  assert.equal(push.sent.length, 0);
});
test('notify_both → ทั้งสองทาง อย่างละ 1 ครั้ง และจองครั้งเดียว', async () => {
  const db = makeDb([{ id: 1, user_id: 7, has_push: true, notify_both: 1 }, { id: 2, user_id: 7, has_push: true, notify_both: 1 }]);
  const line = fakeLine(), push = fakePush();
  const r = await svc.run(db, line, ENV, push);
  assert.equal(line.pushes.length, 1); assert.equal(push.sent.length, 1);
  assert.equal(push.sent[0].payload.notification.body, '2 รายการ · แตะเพื่อดูและบันทึก');
  assert.equal(push.sent[0].payload.notification.data.onActionClick.take.url, '/today?take=T-7-1_2');
  await svc.run(db, line, ENV, push);   // รันซ้ำ
  assert.equal(line.pushes.length, 1); assert.equal(push.sent.length, 1);
  assert.equal(r.groups, 1);
});
test('ไม่มีช่องทาง (ไม่เชื่อม LINE ไม่มีเครื่อง) → ไม่นับ ไม่จอง', async () => {
  const db = makeDb([{ id: 1, user_id: 7, line: null }]);
  const line = fakeLine(), push = fakePush();
  const r = await svc.run(db, line, ENV, push);
  assert.equal(r.groups, 0); assert.equal(db.table[0].reminded, false);
});
test('ระบบยังไม่ตั้ง VAPID (push.configured=false) หรือไม่ส่ง push เข้ามา → เครื่องอย่างเดียวถือว่าไม่มีช่องทาง ไม่จอง', async () => {
  for (const p of [fakePush({ configured: false }), null]) {
    const db = makeDb([{ id: 1, user_id: 7, line: null, has_push: true }]);
    const r = await svc.run(db, fakeLine(), ENV, p);
    assert.equal(r.groups, 0); assert.equal(db.table[0].reminded, false);
  }
});
test('โควตา LINE เต็ม + มีเครื่อง → Web Push แทน (จอง) ; ไม่มีเครื่อง → ไม่ส่ง ไม่จอง', async () => {
  const db = makeDb([{ id: 1, user_id: 7, has_push: true }, { id: 2, user_id: 8 }]);
  const line = fakeLine({ allowed: false }), push = fakePush();
  const r = await svc.run(db, line, ENV, push);
  assert.equal(line.pushes.length, 0);
  assert.equal(push.sent.length, 1); assert.equal(push.sent[0].userId, 7);
  assert.equal(db.table[0].reminded, true);
  assert.equal(db.table[1].reminded, false);
  assert.equal(r.quota_skipped, 1);
});
test('run() 2 รอบพร้อมกัน → LINE 1 + Web Push 1 (จองก่อนส่งตัวเดียวกัน)', async () => {
  const db = makeDb([{ id: 1, user_id: 7, has_push: true, notify_both: 1 }]);
  const line = fakeLine(), push = fakePush();
  await Promise.all([svc.run(db, line, ENV, push), svc.run(db, line, ENV, push)]);
  assert.equal(line.pushes.length, 1); assert.equal(push.sent.length, 1);
});
test('Web Push ล้มเหลว → นับ push_failed แต่ไม่คืนการจอง', async () => {
  const db = makeDb([{ id: 1, user_id: 7, line: null, has_push: true }]);
  const r = await svc.run(db, fakeLine(), ENV, fakePush({ fail: true }));
  assert.equal(r.push_failed, 1); assert.equal(db.table[0].reminded, true);
});
test('เตือนซ้ำ (REMINDER_FOLLOWUP_MIN) ผ่าน Web Push: หัวข้อ "ยังไม่ได้กินยา" + จอง followup_at ครั้งเดียว', async () => {
  const db = makeDb([{ id: 1, user_id: 7, line: null, has_push: true, reminded: true }]);
  const line = fakeLine(), push = fakePush();
  const env = { ...ENV, REMINDER_FOLLOWUP_MIN: '30' };
  const r = await svc.runFollowup(db, line, env, push);
  assert.equal(push.sent.length, 1); assert.equal(r.push_sent, 1);
  assert.equal(push.sent[0].payload.notification.title, '⏰ ยังไม่ได้กินยามื้อเช้านะคะ');
  await svc.runFollowup(db, line, env, push);
  assert.equal(push.sent.length, 1);
  assert.equal(line.pushes.length, 0);
});
test('เตือนซ้ำปิดอยู่ (0) → ไม่ทำอะไร', async () => {
  const r = await svc.runFollowup(makeDb([]), fakeLine(), ENV, fakePush());
  assert.equal(r.groups, 0);
});

// ---------- ยาใกล้หมด ----------
function stockDb(rows) {
  const meds = rows.map((r) => ({ alerted: 0, is_active: 1, as_needed: 0, remaining_qty: 3, days_left: 3, refill_alert_days: 7, strength: '500 mg', unit: 'tablet', name: 'SECRET-DRUG', ...r }));
  let chain = Promise.resolve();
  return {
    meds,
    async query(sql, p) {
      if (/^UPDATE medications SET refill_alerted_at = NULL/.test(sql)) return { affectedRows: 0 };
      if (/WHERE m\.refill_alerted_at IS NOT NULL/.test(sql)) return meds.filter((m) => m.alerted).map((m) => ({ ...m }));
      if (/WHERE m\.is_active = 1 AND m\.remaining_qty IS NOT NULL/.test(sql)) return meds.map((m) => ({ ...m }));
      throw new Error('unexpected sql ' + sql.slice(0, 80));
    },
    withTransaction(fn) {
      const run = chain.then(() => fn({
        query: async (sql, params) => {
          if (/FOR UPDATE/.test(sql)) return [meds.filter((m) => params[0].includes(m.id) && !m.alerted).map((m) => ({ id: m.id }))];
          if (/SET refill_alerted_at = NOW/.test(sql)) { meds.filter((m) => params[0].includes(m.id)).forEach((m) => { m.alerted = 1; }); return [{}]; }
          throw new Error('unexpected tx sql');
        }
      }));
      chain = run.catch(() => {});
      return run;
    }
  };
}
const mrow = (id, user, extra = {}) => ({ id, user_id: user, line_user_id: 'U' + user, notify_both: 0, has_push: 0, ...extra });

test('ยาใกล้หมด: ไม่เชื่อม LINE + มีเครื่อง → Web Push (ไม่มีชื่อยา) ครั้งเดียว', async () => {
  const db = stockDb([mrow(1, 7, { line_user_id: null, has_push: 1 }), mrow(2, 7, { line_user_id: null, has_push: 1, name: 'B' })]);
  const line = fakeLine(), push = fakePush();
  const r = await stock.run(db, line, {}, push);
  assert.equal(line.pushes.length, 0); assert.equal(push.sent.length, 1); assert.equal(r.sent, 1);
  assert.equal(push.sent[0].payload.notification.title, '💊 ยาใกล้หมดแล้วนะคะ');
  assert.equal(push.sent[0].payload.notification.body, '2 รายการ · แตะเพื่อดูและเติมยา');
  assert.equal(push.sent[0].meta.kind, 'low_stock');
  assert.equal(JSON.stringify(push.sent[0].payload).includes('SECRET-DRUG'), false);
  await stock.run(db, line, {}, push);
  assert.equal(push.sent.length, 1);
});
test('ยาใกล้หมด: notify_both ได้ทั้งสองทาง ; LINE อย่างเดียวไม่ได้ Web Push', async () => {
  const db = stockDb([mrow(1, 7, { has_push: 1, notify_both: 1 }), mrow(2, 8, { has_push: 1 })]);
  const line = fakeLine(), push = fakePush();
  await stock.run(db, line, {}, push);
  assert.equal(line.pushes.length, 2); assert.deepEqual(push.sent.map((s) => s.userId), [7]);
});
test('ยาใกล้หมด: โควตา LINE เต็ม + มีเครื่อง → Web Push แทน ; ไม่มีเครื่อง → ไม่จอง', async () => {
  const db = stockDb([mrow(1, 7, { has_push: 1 }), mrow(2, 8)]);
  const line = fakeLine({ allowed: false }), push = fakePush();
  const r = await stock.run(db, line, {}, push);
  assert.deepEqual(push.sent.map((s) => s.userId), [7]);
  assert.equal(db.meds[0].alerted, 1); assert.equal(db.meds[1].alerted, 0); assert.equal(r.quota_skipped, 1);
});
test('ยาใกล้หมด: ไม่ส่ง push เข้ามา → เหมือนเดิม (LINE อย่างเดียว, ไม่เชื่อม LINE ข้าม)', async () => {
  const db = stockDb([mrow(1, 7, { line_user_id: null, has_push: 1 }), mrow(2, 8)]);
  const line = fakeLine();
  await stock.run(db, line, {});
  assert.equal(line.pushes.length, 1); assert.equal(db.meds[0].alerted, 0);
});
