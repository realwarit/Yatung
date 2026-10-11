const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const P = require('../data/lib/push-service');

const SECRET = 'unit-test-jwt-secret';
const NOW = 1_800_000_000;
const KEYS = (() => { const e = crypto.createECDH('prime256v1'); e.generateKeys(); return { p256dh: e.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') }; })();
const ENV = { JWT_SECRET: SECRET, VAPID_PUBLIC_KEY: 'PUB', VAPID_PRIVATE_KEY: 'PRIV', VAPID_SUBJECT: 'mailto:t@yatung.example' };
const EP = 'https://fcm.googleapis.com/fcm/send/abc123';
const J = (p) => JSON.stringify(p);

// ---------- action token ----------
test('token: เซ็นแล้วตรวจผ่าน ได้ uid + ids เดิม (ตัดซ้ำ)', () => {
  const t = P.signActionToken(SECRET, { uid: 7, ids: [5, 6, 6, 9], exp: NOW + 100 });
  assert.deepEqual(P.verifyActionToken(SECRET, t, NOW), { ok: true, uid: 7, ids: [5, 6, 9] });
});
test('token: อายุ 12 ชม. นับจากตอนออก ; เกินแล้ว expired', () => {
  const t = P.newActionToken(SECRET, 7, [1], NOW);
  assert.equal(P.verifyActionToken(SECRET, t, NOW + 12 * 3600).ok, true);
  assert.deepEqual(P.verifyActionToken(SECRET, t, NOW + 12 * 3600 + 1), { ok: false, reason: 'expired' });
});
test('token: secret ต่างกัน → signature', () => {
  const t = P.signActionToken(SECRET, { uid: 7, ids: [1], exp: NOW + 10 });
  assert.equal(P.verifyActionToken('other', t, NOW).reason, 'signature');
});
test('token: แก้ uid / ids / exp ในเนื้อ หรือแก้ลายเซ็น → signature', () => {
  const t = P.signActionToken(SECRET, { uid: 7, ids: [1], exp: NOW + 10 });
  const [body, sig] = t.split('.');
  for (const evil of ['8.1.' + (NOW + 10), '7.1-2.' + (NOW + 10), '7.1.' + (NOW + 99999)]) {
    const forged = Buffer.from(evil).toString('base64url') + '.' + sig;
    assert.equal(P.verifyActionToken(SECRET, forged, NOW).reason, 'signature', evil);
  }
  assert.equal(P.verifyActionToken(SECRET, body + '.' + sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A'), NOW).reason, 'signature');
});
test('token: input แปลก ๆ ไม่ throw (ความยาวต่าง, ไม่ใช่ string, ว่าง)', () => {
  for (const bad of [undefined, null, 5, {}, '', 'abc', 'a.b', 'a.b.c', '.', 'x'.repeat(5000), '!!!.???']) {
    assert.equal(P.verifyActionToken(SECRET, bad, NOW).ok, false);
  }
  assert.equal(P.verifyActionToken('', P.signActionToken(SECRET, { uid: 1, ids: [1], exp: NOW + 5 }), NOW).ok, false);
});
test('token: ไม่มี ids ที่ถูกต้อง → format', () => {
  const t = P.signActionToken(SECRET, { uid: 1, ids: ['x', -1, 0], exp: NOW + 10 });
  assert.equal(P.verifyActionToken(SECRET, t, NOW).reason, 'format');
});
test('token: จำกัด ids ไม่เกิน 50', () => {
  const t = P.signActionToken(SECRET, { uid: 1, ids: Array.from({ length: 80 }, (_, i) => i + 1), exp: NOW + 10 });
  assert.equal(P.verifyActionToken(SECRET, t, NOW).ids.length, 50);
});

// ---------- payload ----------
test('payload เตือน: title/body ตามสเปก ไม่มีชื่อยา', () => {
  const p = P.reminderPayload({ slot: 'morning', count: 3, token: 'TOK' });
  assert.equal(p.notification.title, '⏰ ถึงเวลากินยามื้อเช้าแล้ว');
  assert.equal(p.notification.body, '3 รายการ · แตะเพื่อดูและบันทึก');
  assert.equal(p.notification.icon, '/icons/icon-192x192.png');
  assert.equal(p.notification.badge, '/icons/badge-96.png');
  assert.deepEqual(p.notification.actions, [{ action: 'take', title: '✓ กินแล้ว' }]);
  assert.deepEqual(p.notification.data.onActionClick.default, { operation: 'navigateLastFocusedOrOpen', url: '/today' });
  assert.deepEqual(p.notification.data.onActionClick.take, { operation: 'navigateLastFocusedOrOpen', url: '/today#take=TOK' });
  assert.ok(J(p).length < 1500);
});
test('payload เตือนซ้ำ / ทุกมื้อ / ยาใกล้หมด / ทดลอง', () => {
  assert.equal(P.reminderPayload({ slot: 'bedtime', count: 1, token: 'T', followup: true }).notification.title, '⏰ ยังไม่ได้กินยามื้อก่อนนอนนะคะ');
  for (const [s, m] of [['noon', 'กลางวัน'], ['evening', 'เย็น']]) assert.match(P.reminderPayload({ slot: s, count: 1 }).notification.title, new RegExp('มื้อ' + m));
  const low = P.lowStockPayload({ count: 2 });
  assert.equal(low.notification.title, '💊 ยาใกล้หมดแล้วนะคะ');
  assert.equal(low.notification.body, '2 รายการ · แตะเพื่อดูและเติมยา');
  assert.equal(low.notification.data.onActionClick.default.url, '/medications');
  assert.equal(low.notification.actions, undefined);
  assert.equal(P.testPayload().notification.data.onActionClick.default.url, '/settings');
});
test('payload ไม่มี token → ไม่มีปุ่ม กินแล้ว (แตะแล้วเปิด /today อย่างเดียว)', () => {
  const p = P.reminderPayload({ slot: 'morning', count: 1 });
  assert.equal(p.notification.actions, undefined);
  assert.equal(p.notification.data.onActionClick.take, undefined);
});
test('payload: ไม่มีชื่อยาแม้ผู้เรียกพยายามส่งเข้ามา', () => {
  const p = P.reminderPayload({ slot: 'morning', count: 2, token: 't', doses: [{ name: 'Metformin' }], name: 'Metformin' });
  assert.equal(/metformin|mg|เม็ด/i.test(J(p)), false);
});

// ---------- validate ----------
test('endpoint: ผู้ให้บริการ push ที่รู้จักผ่าน ; http / IP / เครื่องภายใน / มี user:pass ไม่ผ่าน', () => {
  for (const ok of [EP, 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/abc', 'https://wns2-par02p.notify.windows.com/w/?token=x'])
    assert.equal(P.validateEndpoint(ok, {}), true, ok);
  for (const bad of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://localhost/x', 'https://evil.example.com/x', 'https://fcm.googleapis.com.evil.com/x',
    'https://user:pw@fcm.googleapis.com/x', 'https://169.254.169.254/latest', 'ftp://x', 'not a url', '', null, 'https://fcm.googleapis.com/' + 'a'.repeat(500)])
    assert.equal(P.validateEndpoint(bad, {}), false, String(bad));
});
test('endpoint: PUSH_ENDPOINT_ALLOW เพิ่มโฮสต์ทดสอบได้', () => {
  assert.equal(P.validateEndpoint('https://host.docker.internal:8799/p/1', {}), false);
  assert.equal(P.validateEndpoint('https://host.docker.internal:8799/p/1', { PUSH_ENDPOINT_ALLOW: 'host.docker.internal' }), true);
});
test('subscription: ตรวจ keys base64url', () => {
  assert.equal(P.validateSubscription({ endpoint: EP, keys: KEYS }, {}), null);
  assert.match(P.validateSubscription({ endpoint: EP, keys: { p256dh: 'a b', auth: 'x' } }, {}), /p256dh/);
  assert.match(P.validateSubscription({ endpoint: EP, keys: { p256dh: KEYS.p256dh } }, {}), /auth/);
  assert.match(P.validateSubscription({ endpoint: EP }, {}), /p256dh/);
  assert.match(P.validateSubscription(null, {}), /endpoint/);
});

// ---------- describeFailure ----------
test('describeFailure: Apple 403 BadJwtToken → คำแนะนำ VAPID_SUBJECT ; ไม่มี JWT/endpoint', () => {
  const d = P.describeFailure({ statusCode: 403, body: '{"reason":"BadJwtToken"}' }, 'web.push.apple.com');
  assert.equal(d.status, 403); assert.equal(d.reason, 'BadJwtToken');
  assert.match(d.hint, /NGROK_DOMAIN/);
  assert.equal(/eyJ/.test(J(d)), false);
});
test('describeFailure: อื่น ๆ', () => {
  assert.match(P.describeFailure({ statusCode: 403, body: 'x' }, 'fcm.googleapis.com').hint, /VAPID/);
  assert.equal(P.describeFailure({ statusCode: 500, body: '' }, 'fcm.googleapis.com').hint, '');
  assert.equal(P.describeFailure(new Error('boom'), '').status, 0);
  assert.equal(P.describeFailure(null, '').status, 0);
});

// ---------- ฐานข้อมูลปลอม + sender ปลอม ----------
function fakeDb(subs = [{ id: 1, endpoint: EP, p256dh: KEYS.p256dh, auth: KEYS.auth }]) {
  const st = { subs: subs.map((s) => ({ user_id: 5, fail_count: 0, last_success_at: null, ...s })), logs: [] };
  return {
    st,
    async query(sql, p = []) {
      if (/^SELECT id, endpoint, p256dh, auth FROM push_subscriptions/.test(sql)) return st.subs.filter((s) => s.user_id === p[0]);
      if (/^SELECT COUNT\(\*\) AS n FROM push_subscriptions/.test(sql)) return [{ n: st.subs.filter((s) => s.user_id === p[0]).length }];
      if (/^UPDATE push_subscriptions SET last_success_at/.test(sql)) { const s = st.subs.find((x) => x.id === p[0]); s.last_success_at = 'now'; s.fail_count = 0; return { affectedRows: 1 }; }
      if (/^UPDATE push_subscriptions SET fail_count = fail_count \+ 1/.test(sql)) { st.subs.find((x) => x.id === p[0]).fail_count++; return { affectedRows: 1 }; }
      if (/^DELETE FROM push_subscriptions WHERE id/.test(sql)) { const n = st.subs.length; st.subs = st.subs.filter((x) => x.id !== p[0]); return { affectedRows: n - st.subs.length }; }
      if (/^DELETE FROM push_subscriptions WHERE user_id = \? AND endpoint/.test(sql)) { const n = st.subs.length; st.subs = st.subs.filter((x) => !(x.user_id === p[0] && x.endpoint === p[1])); return { affectedRows: n - st.subs.length }; }
      if (/^INSERT INTO push_subscriptions/.test(sql)) {
        const [uid, ep, p256dh, auth, ua] = p; const ex = st.subs.find((x) => x.endpoint === ep);
        if (ex) Object.assign(ex, { user_id: uid, p256dh, auth, user_agent: ua, fail_count: 0 }); else st.subs.push({ id: st.subs.length + 10, user_id: uid, endpoint: ep, p256dh, auth, user_agent: ua, fail_count: 0 });
        return { affectedRows: 1 };
      }
      if (/^INSERT INTO notification_logs/.test(sql)) { st.logs.push({ user_id: p[0], dose_log_id: p[1], channel: p[2], kind: p[3], recipient: p[4], success: p[5], error: p[6] }); return { affectedRows: 1 }; }
      throw new Error('fakeDb: SQL ที่ไม่รู้จัก ' + sql);
    }
  };
}
const mk = (sender, env = ENV) => P.createPushService({ env, sender, log: () => {}, retryDelayMs: 0 });
const statusErr = (code, body) => { const e = new Error('x'); e.statusCode = code; if (body) e.body = body; return e; };

test('sendToUser: ส่งสำเร็จ → TTL 3600, urgency high, last_success_at, log web_push', async () => {
  const calls = []; const db = fakeDb();
  const svc = mk(async (sub, body, o) => { calls.push({ sub, body, o }); return { statusCode: 201 }; });
  const r = await svc.sendToUser(db, 5, P.reminderPayload({ slot: 'morning', count: 2, token: 't' }), { kind: 'reminder', doseLogId: 9 });
  assert.deepEqual(r, { subs: 1, sent: 1, failed: 0, removed: 0 });
  assert.equal(calls[0].o.TTL, 3600); assert.equal(calls[0].o.urgency, 'high');
  assert.equal(calls[0].o.vapidDetails.subject, ENV.VAPID_SUBJECT);
  assert.equal(JSON.parse(calls[0].body).notification.title, '⏰ ถึงเวลากินยามื้อเช้าแล้ว');
  assert.equal(db.st.subs[0].last_success_at, 'now');
  assert.deepEqual(db.st.logs[0], { user_id: 5, dose_log_id: 9, channel: 'web_push', kind: 'reminder', recipient: 'patient', success: 1, error: null });
});
for (const code of [404, 410]) {
  test(`sendToUser: ${code} → ลบ subscription + log ล้มเหลว`, async () => {
    const db = fakeDb(); const svc = mk(async () => { throw statusErr(code); });
    const r = await svc.sendToUser(db, 5, P.testPayload(), { kind: 'other' });
    assert.deepEqual(r, { subs: 1, sent: 0, failed: 0, removed: 1 });
    assert.equal(db.st.subs.length, 0);
    assert.equal(db.st.logs[0].success, 0); assert.match(db.st.logs[0].error, new RegExp(String(code)));
  });
}
test('sendToUser: 500 → fail_count+1 ไม่ลบ ; สำเร็จครั้งถัดไปรีเซ็ต', async () => {
  const db = fakeDb(); let fail = true;
  const svc = mk(async () => { if (fail) throw statusErr(500); return {}; });
  assert.deepEqual(await svc.sendToUser(db, 5, P.testPayload()), { subs: 1, sent: 0, failed: 1, removed: 0 });
  await svc.sendToUser(db, 5, P.testPayload());
  assert.equal(db.st.subs[0].fail_count, 2);
  fail = false; await svc.sendToUser(db, 5, P.testPayload());
  assert.equal(db.st.subs[0].fail_count, 0);
});
test('sendToUser: log ไม่มี endpoint/JWT ; Apple 403 มีคำแนะนำ', async () => {
  const lines = []; const db = fakeDb([{ id: 1, endpoint: 'https://web.push.apple.com/SECRETPATH', p256dh: KEYS.p256dh, auth: KEYS.auth }]);
  const svc = P.createPushService({ env: ENV, log: (m) => lines.push(m), sender: async () => { throw statusErr(403, '{"reason":"BadJwtToken"}'); } });
  await svc.sendToUser(db, 5, P.testPayload());
  const all = lines.join('\n') + J(db.st.logs);
  assert.match(all, /BadJwtToken/); assert.match(all, /NGROK_DOMAIN/); assert.match(all, /web\.push\.apple\.com/);
  assert.equal(/SECRETPATH|eyJ/.test(all), false);
});
test('sendToUser: หลายเครื่อง ส่งทุกเครื่อง ; เครื่องที่ 410 ลบ เครื่องอื่นไม่กระทบ', async () => {
  const db = fakeDb([{ id: 1, endpoint: EP }, { id: 2, endpoint: 'https://fcm.googleapis.com/fcm/send/zzz' }].map((s) => ({ p256dh: KEYS.p256dh, auth: KEYS.auth, ...s })));
  const svc = mk(async (sub) => { if (sub.endpoint.endsWith('zzz')) throw statusErr(410); return {}; });
  assert.deepEqual(await svc.sendToUser(db, 5, P.testPayload()), { subs: 2, sent: 1, failed: 0, removed: 1 });
  assert.deepEqual(db.st.subs.map((s) => s.id), [1]);
});
test('sendToUser: ยังไม่ตั้ง VAPID → ไม่ส่ง ไม่ throw', async () => {
  let called = false; const svc = mk(async () => { called = true; }, { JWT_SECRET: SECRET });
  const r = await svc.sendToUser(fakeDb(), 5, P.testPayload());
  assert.equal(r.skipped, 'not_configured'); assert.equal(called, false);
});

// ---------- endpoint logic ----------
test('publicKey: ตั้งค่าแล้ว 200 / ไม่ตั้ง 503 PUSH_NOT_CONFIGURED', () => {
  assert.deepEqual(mk(null).publicKey(), { status: 200, body: { publicKey: 'PUB' } });
  const r = mk(null, { JWT_SECRET: 's' }).publicKey();
  assert.equal(r.status, 503); assert.equal(r.body.error, 'PUSH_NOT_CONFIGURED');
});
test('subscribe: upsert ตาม endpoint ; endpoint เดิมของ user อื่น → ย้ายมาเป็นของผู้เรียก', async () => {
  const db = fakeDb([]); const svc = mk(null);
  let r = await svc.subscribe(db, 5, { endpoint: EP, keys: KEYS }, 'UA/1');
  assert.deepEqual(r, { status: 200, body: { subscribed: true, devices: 1 } });
  r = await svc.subscribe(db, 5, { endpoint: EP, keys: KEYS }, 'UA/2');
  assert.equal(db.st.subs.length, 1); assert.equal(db.st.subs[0].user_agent, 'UA/2');
  r = await svc.subscribe(db, 6, { endpoint: EP, keys: KEYS }, 'UA/3');
  assert.equal(db.st.subs.length, 1); assert.equal(db.st.subs[0].user_id, 6); assert.equal(r.body.devices, 1);
});
test('subscribe: ข้อมูลผิด → 400 VALIDATION', async () => {
  const r = await mk(null).subscribe(fakeDb([]), 5, { endpoint: 'http://x', keys: KEYS }, '');
  assert.equal(r.status, 400); assert.equal(r.body.error, 'VALIDATION');
});
test('unsubscribe: ลบเฉพาะของตัวเอง ; ของคนอื่น/ไม่มี = 404', async () => {
  const db = fakeDb(); const svc = mk(null);
  assert.equal((await svc.unsubscribe(db, 6, { endpoint: EP })).status, 404);
  assert.equal(db.st.subs.length, 1);
  assert.deepEqual(await svc.unsubscribe(db, 5, { endpoint: EP }), { status: 200, body: { subscribed: false } });
  assert.equal((await svc.unsubscribe(db, 5, {})).status, 400);
});
test('sendTest: ไม่มี subscription = 409 NO_SUBSCRIPTION ; ส่งไม่ได้เลย = 502 ; สำเร็จ = 200', async () => {
  assert.equal((await mk(async () => ({})).sendTest(fakeDb([]), 5)).body.error, 'NO_SUBSCRIPTION');
  assert.equal((await mk(async () => { throw statusErr(500); }).sendTest(fakeDb(), 5)).status, 502);
  assert.deepEqual(await mk(async () => ({})).sendTest(fakeDb(), 5), { status: 200, body: { sent: 1, failed: 0, devices: 1 } });
});
test('take: token ถูก → takeMany(…, "push") ; token ผิด/หมดอายุ = 401 ไม่แตะ DB', async () => {
  const calls = []; const doseService = { takeMany: async (db, uid, ids, src) => { calls.push({ uid, ids, src }); return { taken: [ids[0]], already: ids.slice(1), at: '08:01' }; } };
  const svc = mk(null);
  const tok = svc.newActionToken(5, [11, 12]);
  assert.deepEqual(await svc.take({}, doseService, tok), { status: 200, body: { taken: 1, already: 1, at: '08:01' } });
  assert.deepEqual(calls, [{ uid: 5, ids: [11, 12], src: 'push' }]);
  const bad = await svc.take({}, doseService, tok.slice(0, -2) + 'xx');
  assert.equal(bad.status, 401); assert.equal(bad.body.error, 'INVALID_TOKEN');
  const exp = P.signActionToken(SECRET, { uid: 5, ids: [1], exp: 1 });
  assert.match((await svc.take({}, doseService, exp)).body.details, /หมดอายุ/);
  assert.equal(calls.length, 1);
});

test('sendToUser: เครือข่ายล่ม/ไม่ตอบ (ไม่มี status) → ลองใหม่ได้สูงสุด 3 ครั้ง แล้วสำเร็จ', async () => {
  let n = 0; const db = fakeDb();
  const svc = mk(async (sub, body, o) => { n++; assert.equal(o.timeout, 6000); if (n < 3) { const e = new Error('hang up'); e.code = 'ECONNRESET'; throw e; } return {}; });
  assert.deepEqual(await svc.sendToUser(db, 5, P.testPayload()), { subs: 1, sent: 1, failed: 0, removed: 0 });
  assert.equal(n, 3); assert.equal(db.st.subs[0].fail_count, 0);
});
test('sendToUser: ล้มเหลวครบ 3 ครั้ง → นับล้มเหลวครั้งเดียว + log มี code (ECONNRESET) ไม่มี endpoint', async () => {
  let n = 0; const lines = []; const db = fakeDb();
  const svc = P.createPushService({ env: ENV, retryDelayMs: 0, log: (m) => lines.push(m), sender: async () => { n++; const e = new Error('x'); e.code = 'ECONNRESET'; throw e; } });
  assert.deepEqual(await svc.sendToUser(db, 5, P.testPayload()), { subs: 1, sent: 0, failed: 1, removed: 0 });
  assert.equal(n, 3); assert.equal(db.st.subs[0].fail_count, 1);
  assert.match(lines.join(), /status=network code=ECONNRESET/); assert.match(db.st.logs[0].error, /push network ECONNRESET/);
  assert.equal((lines.join() + db.st.logs[0].error).includes('abc123'), false);   // path ของ endpoint ห้ามหลุด
});
test('sendToUser: 4xx (403/410) ไม่ลองใหม่', async () => {
  for (const code of [403, 410]) { let n = 0; const svc = mk(async () => { n++; throw statusErr(code); }); await svc.sendToUser(fakeDb(), 5, P.testPayload()); assert.equal(n, 1); }
});
