const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient, tail6 } = require('../data/lib/line-client');

// fetch ปลอม: คิวคำตอบตามลำดับ
function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift() || { status: 200, body: {} };
    if (r.throw) { const e = new Error('boom'); e.cause = { code: r.throw }; throw e; }
    return { status: r.status, text: async () => (r.body === undefined ? '' : typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) };
  };
  fn.calls = calls;
  return fn;
}
const fakeDb = (usedFromLogs = 0) => {
  const logs = [];
  return {
    logs,
    query: async (sql, params) => {
      if (/FROM notification_logs/.test(sql)) return [{ n: usedFromLogs }];
      if (/INSERT INTO notification_logs/.test(sql)) { logs.push(params); return { insertId: 1 }; }
      throw new Error('unexpected sql ' + sql);
    }
  };
};
const ENV = { LINE_CHANNEL_ACCESS_TOKEN: 'TOKEN-SECRET', LINE_API_BASE: 'http://line.test', LINE_PUSH_MONTHLY_CAP: '200', LINE_PUSH_RESERVE: '30' };
const mk = (f, env = ENV) => createClient({ env, fetch: f, log: () => {}, retryDelayMs: 0 });

test('push: ส่ง Retry-Key (UUID) + Bearer และบันทึก notification_logs', async () => {
  const f = fakeFetch([{ status: 200, body: {} }]);
  const db = fakeDb();
  const r = await mk(f).push('Uabc123456', [{ type: 'text', text: 'x' }], { db, userId: 7, doseLogId: 9, kind: 'reminder' });
  assert.equal(r.ok, true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'http://line.test/v2/bot/message/push');
  assert.match(f.calls[0].init.headers['X-Line-Retry-Key'], /^[0-9a-f-]{36}$/);
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer TOKEN-SECRET');
  assert.deepEqual(db.logs[0], [7, 9, 'line_push', 'reminder', 'patient', 1, null]);
});
test('push: 500 → ลองใหม่ 1 ครั้งด้วย Retry-Key เดิม แล้วสำเร็จ', async () => {
  const f = fakeFetch([{ status: 500, body: { message: 'x' } }, { status: 200, body: {} }]);
  const r = await mk(f).push('U1', [], { db: fakeDb(), userId: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 2);
  assert.equal(f.calls[0].init.headers['X-Line-Retry-Key'], f.calls[1].init.headers['X-Line-Retry-Key']);
});
test('push: 429 สองรอบ → ล้มเหลว (ไม่เกิน 2 request) และ log success=0', async () => {
  const f = fakeFetch([{ status: 429, body: { message: 'limit' } }, { status: 429, body: { message: 'limit' } }, { status: 200 }]);
  const db = fakeDb();
  const r = await mk(f).push('U1', [], { db, userId: 1, kind: 'reminder' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 429);
  assert.equal(f.calls.length, 2);
  assert.equal(db.logs[0][5], 0);
  assert.match(db.logs[0][6], /429/);
});
test('push: 400 ไม่ลองใหม่ ; เครือข่ายล่มลองใหม่', async () => {
  const f1 = fakeFetch([{ status: 400, body: {} }]);
  assert.equal((await mk(f1).push('U', [], {})).attempts, 1);
  const f2 = fakeFetch([{ throw: 'ECONNREFUSED' }, { status: 200 }]);
  const r = await mk(f2).push('U', [], {});
  assert.equal(r.ok, true);
  assert.equal(f2.calls.length, 2);
});
test('log ต้องไม่มี token / userId เต็ม / เนื้อข้อความ', async () => {
  const lines = [];
  const f = fakeFetch([{ status: 200 }]);
  await createClient({ env: ENV, fetch: f, log: (m) => lines.push(m), retryDelayMs: 0 }).push('Uabcdefghij123456', [{ type: 'text', text: 'ความลับ' }], {});
  const all = lines.join('\n');
  assert.ok(!all.includes('TOKEN-SECRET'));
  assert.ok(!all.includes('Uabcdefghij123456'));
  assert.ok(!all.includes('ความลับ'));
  assert.ok(all.includes('123456'));
  assert.equal(tail6('Uabcdefghij123456'), '123456');
});
test('reply: ไม่มี Retry-Key และบันทึกเป็น line_reply', async () => {
  const f = fakeFetch([{ status: 200 }]);
  const db = fakeDb();
  await mk(f).reply('tok', [{ type: 'text', text: 'x' }], { db, userId: 3, kind: 'link' });
  assert.equal(f.calls[0].init.headers['X-Line-Retry-Key'], undefined);
  assert.equal(db.logs[0][2], 'line_reply');
});
test('reply: ไม่รู้ user → ไม่เขียน log (user_id บังคับ)', async () => {
  const db = fakeDb();
  await mk(fakeFetch([{ status: 200 }])).reply('t', [], { db, userId: null });
  assert.equal(db.logs.length, 0);
});
test('getProfile', async () => {
  const f = fakeFetch([{ status: 200, body: { displayName: 'สมชาย' } }, { status: 404, body: {} }]);
  const c = mk(f);
  assert.deepEqual(await c.getProfile('U1'), { displayName: 'สมชาย' });
  assert.equal(await c.getProfile('U2'), null);
});

// ---- โควตา ----
const quotaFetch = (quota, used) => fakeFetch([
  { status: 200, body: quota == null ? { type: 'none' } : { type: 'limited', value: quota } },
  { status: used == null ? 500 : 200, body: used == null ? {} : { totalUsage: used } }
]);
test('quota: effective_cap = min(cap, quota จริง) ; ใช้ยอดจาก LINE', async () => {
  const s = await mk(quotaFetch(150, 40)).quotaStatus(fakeDb());
  assert.equal(s.effective_cap, 150);
  assert.equal(s.used, 40);
  assert.equal(s.used_source, 'line');
  assert.equal(s.remaining_for_reminders, 150 - 30 - 40);
  assert.equal(s.remaining_for_escalation, 110);
  assert.equal((await mk(quotaFetch(1000, 0)).quotaStatus(fakeDb())).effective_cap, 200);
  assert.equal((await mk(quotaFetch(null, 0)).quotaStatus(fakeDb())).effective_cap, 200);
});
test('quota: เรียก consumption ไม่ได้ → นับจาก notification_logs', async () => {
  const s = await mk(quotaFetch(200, null)).quotaStatus(fakeDb(12));
  assert.equal(s.used, 12);
  assert.equal(s.used_source, 'logs');
});
test('quota: cache 5 นาที (เรียก LINE รอบแรกครั้งเดียว)', async () => {
  const f = quotaFetch(200, 5);
  const c = mk(f);
  await c.quotaStatus(fakeDb());
  await c.quotaStatus(fakeDb());
  assert.equal(f.calls.length, 2);   // quota + consumption
});
test('canPush: reminder หยุดที่ cap-reserve ; escalation ไปได้ถึง cap', async () => {
  const at = async (used, kind) => (await mk(quotaFetch(200, used)).canPush(fakeDb(), kind)).allowed;
  assert.equal(await at(169, 'reminder'), true);
  assert.equal(await at(170, 'reminder'), false);
  assert.equal(await at(199, 'escalation'), true);
  assert.equal(await at(200, 'escalation'), false);
  assert.equal(await at(180, 'reminder'), false);
  assert.equal(await at(180, 'escalation'), true);
});
test('canPush: ขอหลายข้อความ n', async () => {
  assert.equal((await mk(quotaFetch(200, 168)).canPush(fakeDb(), 'reminder', 2)).allowed, true);
  assert.equal((await mk(quotaFetch(200, 169)).canPush(fakeDb(), 'reminder', 2)).allowed, false);
});
test('ค่า env ว่าง → ใช้ค่าเริ่มต้น cap 200 / reserve 30', async () => {
  const s = await mk(quotaFetch(null, 0), { ...ENV, LINE_PUSH_MONTHLY_CAP: '', LINE_PUSH_RESERVE: '' }).quotaStatus(fakeDb());
  assert.equal(s.cap, 200);
  assert.equal(s.reserve, 30);
});
