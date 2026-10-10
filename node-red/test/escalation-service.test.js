const test = require('node:test');
const assert = require('node:assert/strict');
const esc = require('../data/lib/escalation-service');
const M = require('../data/lib/line-messages');
const F = require('../data/lib/line-flex');

const ENV = { PUBLIC_BASE_URL: 'https://x.ngrok-free.dev' };
const dose = (id, name = 'ยา' + id) => ({ id, name, strength: '500 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'after' });
const group = (extra = {}) => ({ patient: 'สมชาย ใจดี', slot: 'evening', scheduled_at: '2026-10-09 18:00:00', late_min: 65, doses: [dose(11), dose(12)], escalation_ids: [5, 6], ...extra });
const flat = (n) => (n && typeof n === 'object' ? [n, ...Object.values(n).flatMap(flat)] : []);

// ---------- Flex ญาติ ----------
test('Flex แจ้งญาติ: altText, หัวพื้นเหลือง, ป้ายมื้อ+เวลา+เลยมา, ข้อความโทรถาม, ปุ่มหลัก/รอง', () => {
  const m = M.buildEscalation(group(), ENV);
  assert.equal(m.altText, '⚠️ คุณสมชายยังไม่ได้กินยามื้อเย็น · เลยมา 1 ชม. 5 นาที');
  const bubble = m.contents;
  assert.equal(bubble.header.backgroundColor, F.COLOR.warningSoft);
  const texts = flat(bubble).filter((n) => n.type === 'text').map((n) => n.text);
  assert.ok(texts.includes('คุณสมชายยังไม่ได้กินยานะคะ'));
  assert.ok(texts.includes('🌆 มื้อเย็น 18:00 น. · เลยมา 1 ชม. 5 นาที'));
  assert.ok(texts.includes('ลองโทรถามคุณสมชายได้นะคะ'));
  const [take, ack] = bubble.footer.contents;
  assert.equal(take.action.label, '✓ ยืนยันว่ากินแล้ว');
  assert.equal(take.action.data, 'a=cg_take&d=11,12');
  assert.equal(take.style, 'primary');
  assert.equal(ack.action.label, 'รับทราบ');
  assert.equal(ack.action.data, 'a=cg_ack&e=5,6');
  assert.ok(flat(bubble.header).some((n) => n.type === 'image' && /mascot-bell\.png$/.test(n.url)));
});

test('Flex แจ้งญาติ: ยา 15 รายการ → postback ≤ 300 ตัวอักษร, แสดงยา 6 + "อีก n รายการ"', () => {
  const doses = Array.from({ length: 15 }, (_, i) => dose(1000000 + i * 7919));
  const m = M.buildEscalation(group({ doses, escalation_ids: doses.map((_, i) => 2000000 + i) }), ENV);
  const [take, ack] = m.contents.footer.contents;
  assert.ok(take.action.data.length <= F.MAX_POSTBACK, take.action.data.length);
  assert.ok(ack.action.data.length <= F.MAX_POSTBACK);
  assert.ok(flat(m.contents.body).some((n) => n.text === '+ อีก 9 รายการ'));
  assert.ok(JSON.stringify(m).length < F.MAX_BUBBLE_BYTES);
});

test('chunkDoses กับ postback ญาติ: ไม่เกิน 15 รายการและ ≤ 300 ตัวอักษรต่อก้อน', () => {
  const doses = Array.from({ length: 40 }, (_, i) => dose(900000000000 + i));   // id ยาว 12 หลัก
  const chunks = F.chunkDoses(doses, M.cgTakeData);
  assert.ok(chunks.length > 1);
  for (const c of chunks) { assert.ok(c.length <= 15); assert.ok(M.cgTakeData(c.map((d) => d.id)).length <= 300); }
  assert.equal(chunks.flat().length, 40);
});

test('ชื่อผู้ป่วยยาว/ตกแต่ง → หัวข้อยังสั้นพอ (ชื่อแรก ≤ 10 ตัวอักษร)', () => {
  assert.equal(M.firstName('สมชาย ใจดี'), 'สมชาย');
  assert.equal(M.firstName('𝐒𝐨𝐦𝐜𝐡𝐚𝐢 𝐉𝐚𝐢𝐝𝐞𝐞'), 'Somchai');
  assert.equal(M.firstName('ประเสริฐศักดิ์วงศ์สกุล').length, 10);
});

test('Flex ปิดเรื่อง: altText ตามสเปก "💚 คุณ…กินยามื้อ…แล้วค่ะ"', () => {
  const m = M.buildEscalationResolved(group(), ENV);
  assert.equal(m.altText, '💚 คุณสมชายกินยามื้อเย็นแล้วค่ะ · 18:00 น.');
  assert.equal(flat(m.contents).filter((n) => n.type === 'button').length, 0);
});

test('Flex ปิดเรื่อง: เนื้อหา = เวลาที่ผู้ป่วยกดจริง + จำนวน · ช่องทาง + ขอบคุณ (ไม่ซ้ำหัวการ์ด)', () => {
  const m = M.buildEscalationResolved(group({ at: '16:33', source: 'push', doses: [dose(1), dose(2), dose(3)] }), ENV);
  const texts = flat(m.contents.body).filter((n) => n.type === 'text').map((n) => n.text);
  assert.deepEqual(texts, ['✅ บันทึกเมื่อ 16:33 น.', '3 รายการ · ผ่านทาง แจ้งเตือนบนเครื่อง', 'ขอบคุณที่ช่วยดูแลนะคะ']);
  assert.match(m.altText, /คุณสมชาย.*มื้อเย็น/);
  const line = flat(M.buildEscalationResolved(group({ at: '08:01', source: 'line', doses: [dose(1)] }), ENV).contents.body).filter((n) => n.type === 'text').map((n) => n.text);
  assert.equal(line[1], '1 รายการ · ผ่านทาง LINE');
  const app = flat(M.buildEscalationResolved(group({ at: '08:01', source: 'app', doses: [dose(1)] }), ENV).contents.body).filter((n) => n.type === 'text').map((n) => n.text);
  assert.equal(app[1], '1 รายการ · ผ่านทาง แอป');
});

test('Flex แจ้งญาติ: เลยมาตามเวลาจริง (now − scheduled_at) ไม่ใช่ escalate_after_min', () => {
  const m = M.buildEscalation(group({ late_min: 2.4 }), ENV);   // เดโมส่งตอนเลยมา 2 นาที
  assert.equal(m.altText, '⚠️ คุณสมชายยังไม่ได้กินยามื้อเย็น · เลยมา 2 นาที');
  const texts = flat(m.contents).filter((n) => n.type === 'text').map((n) => n.text);
  assert.ok(texts.includes('🌆 มื้อเย็น 18:00 น. · เลยมา 2 นาที'));
  assert.ok(!texts.some((t) => /30 นาที/.test(t)));
  assert.match(M.buildEscalation(group({ late_min: 0.3 }), ENV).altText, /เลยมาไม่ถึง 1 นาที/);
});

test('Flex แจ้งญาติ: ยังไม่ถึงเวลา (late_min < 0) = "ใกล้ถึงเวลา" ไม่แสดงว่าเลยมา', () => {
  const m = M.buildEscalation(group({ late_min: -4.2 }), ENV);
  assert.equal(m.altText, '⏰ คุณสมชายใกล้ถึงเวลากินยามื้อเย็น · อีก 5 นาที');
  assert.equal(m.contents.header.backgroundColor === F.COLOR.warningSoft, false);
  const texts = flat(m.contents).filter((n) => n.type === 'text').map((n) => n.text);
  assert.ok(texts.includes('คุณสมชายใกล้ถึงเวลากินยา'));
  assert.ok(texts.includes('🌆 มื้อเย็น 18:00 น. · อีก 5 นาที'));
  assert.ok(!texts.some((t) => /เลยมา|ยังไม่ได้กินยา/.test(t)));
});

test('เดโมแจ้งญาติ: escalateNow ส่ง late_min ตามเวลาจริง ไม่บวก escalate_after_min', async () => {
  const sent = [];
  const rows = [{ id: 1, user_id: 1, slot: 'evening', scheduled_at: '2026-10-09 16:30:00', late_sec: 125, name: 'ยา', strength: null, dose_per_time: 1, unit: 'tablet', meal_relation: 'after', patient: 'การ์ตูน' }];
  const db = {
    async query(sql) {
      if (/SELECT email FROM users/.test(sql)) return [{ email: 'a@b.c' }];
      if (/FROM caregivers/.test(sql)) return [{ id: 7, line_user_id: 'Ucg', escalate_after_min: 30 }];
      if (/FROM dose_logs d JOIN medications/.test(sql)) return rows;
      return [];
    },
    async withTransaction(fn) {
      return fn({ async query(sql) { return /INSERT IGNORE/.test(sql) ? [{ affectedRows: 1 }] : [rows.map((r) => ({ id: r.id }))]; } });
    }
  };
  const client = {
    async quotaStatus() { return { remaining_for_escalation: 10, reserve: 30 }; },
    async canPush() { return { allowed: true, left: 10 }; },
    async push(to, messages) { sent.push(messages[0]); return { ok: true }; }
  };
  const r = await esc.escalateNow(db, client, 1, {}, {});
  assert.equal(r.status, 200);
  assert.match(sent[0].altText, /เลยมา 2 นาที/);
  assert.doesNotMatch(sent[0].altText, /30 นาที/);
});

test('Flex เตือนซ้ำ (followup) = หัวพื้นเหลือง "ยังไม่ได้กินยา…" แม้เลยเวลาแค่ 10 นาที', () => {
  const g = { slot: 'morning', scheduled_at: '2026-10-09 08:00:00', late_min: 10, doses: [dose(1)] };
  const normal = F.buildReminder(g, ENV);
  const follow = F.buildReminder(g, ENV, { followup: true });
  assert.match(normal.altText, /ถึงเวลากินยามื้อเช้าแล้ว/);
  assert.match(follow.altText, /ยังไม่ได้กินยามื้อเช้า · เลยเวลามา 10 นาที/);
  assert.equal(follow.contents.header.backgroundColor, F.COLOR.warningSoft);
});

test('reply ผู้ดูแลกดยืนยัน: บันทึกแล้ว / ผู้ป่วยกินไปแล้วก่อนหน้า / ญาติคนอื่นยืนยันแล้ว', () => {
  const a = M.caregiverTakeResult({ taken: [{ name: 'สมชาย ใจดี', slot: 'evening' }] }).text;
  assert.equal(a, '✅ บันทึกแล้วค่ะ\nคุณสมชาย ใจดี · มื้อเย็น\nขอบคุณที่ช่วยดูแลนะคะ');
  const b = M.caregiverTakeResult({ already: [{ name: 'สมชาย ใจดี', slot: 'evening', at: '18:12', by: 'self' }] }).text;
  assert.equal(b, '✅ กินไปแล้วค่ะ\nคุณสมชาย ใจดี · มื้อเย็น\nผู้ป่วยกินเมื่อ 18:12 น.\nไม่ต้องกดซ้ำนะคะ');
  const c = M.caregiverTakeResult({ already: [{ name: 'ก', slot: 'noon', at: '12:00', by: 'caregiver' }] }).text;
  assert.equal(c, '✅ กินไปแล้วค่ะ\nคุณก · มื้อกลางวัน\nญาติยืนยันเมื่อ 12:00 น.\nไม่ต้องกดซ้ำนะคะ');
  for (const t of [a, b, c, M.TEXT.cgAck().text, M.TEXT.cgNoAuth().text]) {
    for (const line of t.split('\n')) assert.ok((line.match(/\p{Extended_Pictographic}/gu) || []).length <= 1, line);
  }
});

test('"วันนี้" ของผู้ดูแล: ไม่แสดงชื่อยา, แสดงความคืบหน้าและมื้อที่ยังไม่ครบต่อผู้ป่วย', () => {
  const shaped = (slots) => {
    const all = slots.flatMap((s) => s.doses);
    return { status: 200, body: { slots, summary: { total: all.length, taken: all.filter((d) => d.status === 'taken').length, pending: all.filter((d) => d.status === 'pending').length, missed: 0 } } };
  };
  const d = (id, status, is_due) => ({ ...dose(id, 'ลับมาก-ชื่อยา'), status, is_due });
  const m = M.buildCaregiverToday([
    { name: 'สมชาย ใจดี', shaped: shaped([{ slot: 'morning', time: '08:00', doses: [d(1, 'taken')] }, { slot: 'evening', time: '18:00', doses: [d(2, 'pending', true)] }]) },
    { name: 'มาลี', shaped: shaped([]) }
  ], '2026-10-09', ENV);
  const texts = flat(m.contents).filter((n) => n.type === 'text').map((n) => n.text);
  assert.ok(!JSON.stringify(m).includes('ลับมาก-ชื่อยา'));
  assert.ok(texts.includes('คุณสมชาย ใจดี') && texts.includes('คุณมาลี'));
  assert.ok(texts.includes('กินแล้ว 1 จาก 2 รายการ'));
  assert.ok(texts.includes('🌆 มื้อเย็น 18:00 น. · ยังไม่ได้กิน'));
  assert.ok(texts.includes('วันนี้ไม่มียาที่ต้องกินค่ะ'));
  assert.equal(m.altText, '📋 ยาวันนี้ของผู้ที่คุณดูแล 2 คน');
});

// ---------- SQL / กลุ่ม ----------
test('SQL เลือก dose : pending/missed, ยา active ไม่ใช่ as_needed, หน้าต่าง escalate_after_min…+60, ยังไม่เคยแจ้ง, ผู้ดูแลเชื่อม LINE', () => {
  const sql = esc.DUE_SQL.replace(/\s+/g, ' ');
  assert.match(sql, /d\.status IN \('pending', 'missed'\)/);
  assert.match(sql, /m\.is_active = 1 AND m\.as_needed = 0/);
  assert.match(sql, /d\.scheduled_at <= NOW\(\) - INTERVAL c\.escalate_after_min MINUTE/);
  assert.match(sql, /d\.scheduled_at >= NOW\(\) - INTERVAL \(c\.escalate_after_min \+ 60\) MINUTE/);
  assert.match(sql, /LEFT JOIN dose_escalations e ON e\.dose_id = d\.id AND e\.caregiver_id = c\.id/);
  assert.match(sql, /e\.id IS NULL/);
  assert.match(sql, /c\.is_active = 1 AND c\.line_user_id IS NOT NULL/);
  assert.match(esc.dueSql(" AND u.email LIKE ? ESCAPE '!'"), /u\.email LIKE/);
});

test('groupRows: 1 กลุ่มต่อ (ผู้ดูแล, ผู้ป่วย, scheduled_at)', () => {
  const r = (id, cg, user, t) => ({ id, caregiver_id: cg, cg_line: 'U' + cg, user_id: user, patient: 'p' + user, slot: 'morning', scheduled_at: '2026-10-09 ' + t, late_sec: 4000, escalate_after_min: 60, name: 'n' + id });
  const g = esc.groupRows([r(1, 1, 7, '08:00:00'), r(2, 1, 7, '08:00:00'), r(3, 2, 7, '08:00:00'), r(4, 1, 7, '12:00:00'), r(5, 1, 8, '08:00:00')]);
  assert.equal(g.length, 5 - 1);
  assert.deepEqual(g.map((x) => x.doses.length), [2, 1, 1, 1]);
});

// ---------- sendGroup ด้วย db/client ปลอม ----------
function fakeEnv({ allowed = true, ok = true, takenDuring = false } = {}) {
  const claimed = new Set();
  const calls = { queries: [], pushes: [] };
  let chain = Promise.resolve();
  const db = {
    async query(sql, params) {
      calls.queries.push(sql);
      if (/FROM dose_escalations WHERE caregiver_id/.test(sql)) return params[1].map((id) => ({ id: id * 10, dose_id: id }));
      return [];
    },
    withTransaction(fn) {
      const run = chain.then(() => fn({
        query: async (sql, params) => {
          if (/FOR UPDATE/.test(sql)) return [takenDuring ? [] : params[0].map((id) => ({ id }))];
          if (/INSERT IGNORE INTO dose_escalations/.test(sql)) {
            const key = params[0] + '|' + params[1];
            if (claimed.has(key)) return [{ affectedRows: 0 }];
            claimed.add(key); return [{ affectedRows: 1 }];
          }
          return [{ affectedRows: 1 }];
        }
      }));
      chain = run.catch(() => {});
      return run;
    }
  };
  const client = {
    canPush: async (_db, kind) => { calls.kind = kind; return { allowed, left: allowed ? 5 : 0, status: {} }; },
    push: async (to, messages, meta) => { calls.pushes.push({ to, messages, meta }); await new Promise((r) => setTimeout(r, 5)); return { ok, status: ok ? 200 : 500 }; }
  };
  return { db, client, calls };
}
const G = () => ({ caregiver_id: 3, cg_line: 'Ucg', user_id: 7, patient: 'สมชาย ใจดี', slot: 'evening', scheduled_at: '2026-10-09 18:00:00', late_sec: 3900, doses: [dose(11), dose(12)] });

test('sendGroup: 1 ข้อความ kind=escalation recipient=caregiver ถึง LINE ผู้ดูแล + ปุ่มรับทราบมี id ของแถว dose_escalations', async () => {
  const { db, client, calls } = fakeEnv();
  const r = await esc.sendGroup(db, client, G(), { env: ENV });
  assert.deepEqual([r.sent, r.failed, r.doses], [1, 0, 2]);
  assert.equal(calls.kind, 'escalation');
  assert.equal(calls.pushes.length, 1);
  assert.equal(calls.pushes[0].to, 'Ucg');
  assert.equal(calls.pushes[0].meta.kind, 'escalation');
  assert.equal(calls.pushes[0].meta.recipient, 'caregiver');
  assert.equal(calls.pushes[0].messages[0].contents.footer.contents[1].action.data, 'a=cg_ack&e=110,120');
});

test('sendGroup: รันพร้อมกัน 2 รอบ → ส่ง 1 ข้อความ (อีกรอบถูกจองไปแล้ว)', async () => {
  const { db, client, calls } = fakeEnv();
  const [a, b] = await Promise.all([esc.sendGroup(db, client, G(), { env: ENV }), esc.sendGroup(db, client, G(), { env: ENV })]);
  assert.equal(calls.pushes.length, 1);
  assert.equal(a.sent + b.sent, 1);
  assert.ok([a, b].some((x) => x.skipped === 'claimed'));
});

test('sendGroup: โควตาหมด → ไม่ส่ง และไม่จอง (ลองใหม่ได้)', async () => {
  const { db, client, calls } = fakeEnv({ allowed: false });
  const r = await esc.sendGroup(db, client, G(), { env: ENV });
  assert.equal(r.skipped, 'quota');
  assert.equal(calls.pushes.length, 0);
  assert.ok(!calls.queries.some((q) => /INSERT/.test(q)));
});

test('sendGroup: ผู้ป่วยกินไปแล้วระหว่างรอ (ไม่มีแถว pending/missed) → ไม่ส่ง', async () => {
  const { db, client, calls } = fakeEnv({ takenDuring: true });
  const r = await esc.sendGroup(db, client, G(), { env: ENV });
  assert.equal(r.skipped, 'claimed');
  assert.equal(calls.pushes.length, 0);
});

test('sendGroup: push ล้มเหลว → ตั้งสถานะ failed แต่ไม่คืนการจอง', async () => {
  const { db, client, calls } = fakeEnv({ ok: false });
  const r = await esc.sendGroup(db, client, G(), { env: ENV });
  assert.deepEqual([r.sent, r.failed], [0, 1]);
  assert.ok(calls.queries.some((q) => /SET status = 'failed'/.test(q)));
  assert.ok(!calls.queries.some((q) => /DELETE/.test(q)));
});
