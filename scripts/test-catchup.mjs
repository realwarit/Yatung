// ทดสอบ ensureToday (catch-up) กับ DB จริง — รันใน container nodered: bash scripts/test-catchup.sh
// ใช้ผู้ใช้ทดสอบ @example.test ที่สร้างเองเท่านั้น ; LINE = ตัวดักปลอม (ไม่มีข้อความออกจริง) ; ลบข้อมูลและคืน marker ของวันนี้ตอนจบ
const { createRequire } = require('module');
const req = createRequire('/data/lib/');
const db = req('./db');
const doseService = req('./dose-service');
const reminder = req('./reminder-service');
const escalation = req('./escalation-service');
const stats = req('./stats-service');
const crypto = require('crypto');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✔ ' + m); } else { fail++; console.log('  ✘ ' + m); } };
const eq = (a, b, m) => ok(String(a) === String(b), `${m} (ได้ ${a}, ต้อง ${b})`);
const section = (s) => console.log('\n== ' + s);

const calls = [];
const client = {
  canPush: async () => ({ allowed: true, status: {} }),
  quotaStatus: async () => ({ cap: 200, used: 0 }),
  push: async (to, msgs, meta) => { calls.push({ to, kind: meta && meta.kind, dose: meta && meta.doseLogId, user: meta && meta.userId }); return { ok: true }; },
};
const env = { ...process.env, REMINDER_ONLY_EMAIL_SUFFIX: '@example.test', REMINDER_FOLLOWUP_MIN: '10' };
const rnd = crypto.randomBytes(5).toString('hex');
const email = `test-catchup-${rnd}@example.test`;

async function main() {
  const origMarker = await db.query('SELECT gen_date, generated_at, source, inserted, catchup FROM daily_generation WHERE gen_date = CURDATE()');
  let uid;
  try {
    // ---------- เตรียมผู้ใช้ทดสอบ ----------
    const u = await db.query('INSERT INTO users (email, password_hash, display_name, line_user_id) VALUES (?, ?, ?, ?)',
      [email, '$2b$10$' + 'x'.repeat(53), 'ผู้ทดสอบ catchup', 'Utest' + rnd]);
    uid = u.insertId;
    await db.query('INSERT INTO caregivers (user_id, name, line_user_id, escalate_after_min, is_active) VALUES (?, ?, ?, 10, 1)', [uid, 'ญาติทดสอบ', 'Ucg' + rnd]);
    // เช้า = 2 ชม.ก่อน, กลางวัน = 25 นาทีก่อน (อยู่ในหน้าต่างเตือน/แจ้งญาติ — ถ้าไม่มี guard จะถูกส่ง), เย็น = อีก 90 นาที
    await db.query("UPDATE user_slot_times SET slot_time = TIME(NOW() - INTERVAL 120 MINUTE) WHERE user_id = ? AND slot = 'morning'", [uid]);
    await db.query("UPDATE user_slot_times SET slot_time = TIME(NOW() - INTERVAL 25 MINUTE) WHERE user_id = ? AND slot = 'noon'", [uid]);
    await db.query("UPDATE user_slot_times SET slot_time = TIME(NOW() + INTERVAL 90 MINUTE) WHERE user_id = ? AND slot = 'evening'", [uid]);
    const mk = async (name) => {
      const r = await db.query("INSERT INTO medications (user_id, name, strength, dose_per_time, unit, meal_relation, total_qty, remaining_qty, start_date, created_at) VALUES (?, ?, '500 mg', 1, 'tablet', 'after', 30, 30, CURDATE() - INTERVAL 3 DAY, NOW() - INTERVAL 2 DAY)", [uid, name]);
      return r.insertId;
    };
    const M1 = await mk('ยาทดสอบ catchup 1');
    for (const s of ['morning', 'noon', 'evening']) await db.query('INSERT INTO medication_slots (medication_id, slot) VALUES (?, ?)', [M1, s]);
    const M2 = await mk('ยาทดสอบ ปกติ');   // ไม่มี slot → ensureToday ไม่สร้างให้ ; ใช้ seed แถวปกติเอง
    const rows = () => db.query("SELECT id, slot, status, catchup, reminded_at IS NOT NULL AS rem, DATE_FORMAT(scheduled_at,'%H:%i') AS hm FROM dose_logs WHERE user_id = ? AND scheduled_date = CURDATE() ORDER BY scheduled_at", [uid]);
    const by = (rs, slot) => rs.find((r) => r.slot === slot);

    // ---------- 1: สร้างครั้งแรก ----------
    section('ensureToday: สร้างรอบย้อนหลัง');
    await db.query('DELETE FROM daily_generation WHERE gen_date = CURDATE()');
    const r1 = await doseService.ensureToday(db);
    ok(r1.skipped === false, 'วันนี้ยังไม่มี marker → สร้าง');
    let rs = await rows();
    eq(rs.length, 3, 'ผู้ใช้ทดสอบมี 3 รอบ (เช้า/กลางวัน/เย็น)');
    eq(by(rs, 'morning').catchup, 1, 'เช้า (เลยมา 2 ชม.) = catchup');
    eq(by(rs, 'morning').rem, 1, '  และตั้ง reminded_at กันเตือน');
    eq(by(rs, 'noon').catchup, 1, 'กลางวัน (เลยมา 25 นาที) = catchup');
    eq(by(rs, 'evening').catchup, 0, 'เย็น (ยังไม่ถึงเวลา) = แถวปกติ');
    eq(by(rs, 'evening').rem, 0, '  reminded_at ว่าง');
    eq(by(rs, 'morning').status, 'pending', 'แถว catch-up เป็น pending (ผู้ใช้ยังกดกินได้)');
    const marker = (await db.query("SELECT source FROM daily_generation WHERE gen_date = CURDATE()"))[0];
    eq(marker && marker.source, 'ensure', 'เขียน marker ของวันนี้');

    // ---------- 2: รันซ้ำ ----------
    section('รันซ้ำต้องไม่เพิ่ม');
    const r2 = await doseService.ensureToday(db);
    ok(r2.skipped === true && r2.inserted === 0, 'มี marker แล้ว → ข้าม');
    eq((await rows()).length, 3, 'จำนวนแถวเท่าเดิมหลังรันครั้งที่ 2');
    await db.query('DELETE FROM daily_generation WHERE gen_date = CURDATE()');
    await doseService.ensureToday(db);
    eq((await rows()).length, 3, 'ลบ marker แล้วรันอีก (NOT EXISTS) จำนวนแถวยังเท่าเดิม');
    const dups = await db.query('SELECT COUNT(*) AS n FROM (SELECT medication_id, slot FROM dose_logs WHERE user_id = ? AND scheduled_date = CURDATE() GROUP BY medication_id, slot HAVING COUNT(*) > 1) x', [uid]);
    eq(dups[0].n, 0, 'ไม่มีแถวซ้ำต่อ (ยา, มื้อ, วัน)');

    // ---------- 3: ไม่แจ้งเตือนย้อนหลัง ----------
    section('catch-up ต้องไม่มีข้อความออก (เตือน / ติดตาม / แจ้งญาติ)');
    calls.length = 0;
    await reminder.run(db, client, env, null);
    await reminder.runFollowup(db, client, env, null);
    await escalation.run(db, client, env);
    eq(calls.length, 0, 'รอบ cron ทั้งสามขั้นผ่านไปแล้ว ไม่มีข้อความถึงผู้ป่วย/ญาติ');
    eq((await db.query('SELECT COUNT(*) AS n FROM dose_escalations e JOIN dose_logs d ON d.id = e.dose_id WHERE d.user_id = ?', [uid]))[0].n, 0, 'ไม่มีแถว dose_escalations');

    // ---------- 4: แถวปกติยังแจ้งญาติได้ (regression) ----------
    section('วันปกติ: แถวที่ไม่ใช่ catch-up แจ้งญาติตามปกติ');
    const nd = await db.query("INSERT INTO dose_logs (medication_id, user_id, slot, scheduled_at, status) VALUES (?, ?, 'bedtime', NOW() - INTERVAL 30 MINUTE, 'pending')", [M2, uid]);
    calls.length = 0;
    await escalation.run(db, client, env);
    eq(calls.length, 1, 'แจ้งญาติ 1 ข้อความ');
    ok(calls[0] && calls[0].to === 'Ucg' + rnd && calls[0].kind === 'escalation' && calls[0].dose === nd.insertId, '  ถึงญาติ เฉพาะรอบปกติ (ไม่รวม catch-up)');
    const esc = await db.query('SELECT dose_id FROM dose_escalations e WHERE e.dose_id IN (SELECT id FROM dose_logs WHERE user_id = ?)', [uid]);
    ok(esc.length === 1 && esc[0].dose_id === nd.insertId, '  dose_escalations มีเฉพาะรอบปกติ');

    await db.query('UPDATE dose_logs SET reminded_at = NOW() WHERE id = ?', [nd.insertId]);   // รอบปกติของข้อ 4 ไม่เกี่ยวกับข้อ 5

    // ---------- 5: catch-up ที่ยังไม่ถึงเวลา เตือนปกติเมื่อถึงเวลา ----------
    section('catch-up มื้อที่ยังไม่ถึงเวลา: เตือนตามปกติเมื่อถึงเวลา');
    calls.length = 0;
    await reminder.run(db, client, env, null);
    eq(calls.length, 0, 'ก่อนถึงเวลา (เย็นอีก 90 นาที) ยังไม่เตือน');
    await db.query("UPDATE dose_logs SET scheduled_at = NOW() - INTERVAL 1 MINUTE WHERE user_id = ? AND slot = 'evening'", [uid]);
    await reminder.run(db, client, env, null);
    eq(calls.length, 1, 'ถึงเวลาแล้ว เตือน 1 ข้อความ');
    ok(calls[0] && calls[0].kind === 'reminder' && calls[0].to === 'Utest' + rnd, '  ถึงผู้ป่วย kind=reminder');
    eq((await rows()).filter((r) => r.slot === 'evening')[0].rem, 1, '  จอง reminded_at แล้ว');
    const callsAfter = calls.length;
    await reminder.run(db, client, env, null);
    eq(calls.length, callsAfter, '  รันซ้ำไม่เตือนซ้ำ');

    // ---------- 6: กินย้อนหลังและสถิติ ----------
    section('กดกินแล้วที่แถว catch-up → taken และนับในสถิติ');
    const morning = by(await rows(), 'morning');
    const t = await doseService.take(db, uid, morning.id);
    eq(t.status, 200, 'take รอบเช้า (catch-up) สำเร็จ');
    eq(by(await rows(), 'morning').status, 'taken', 'สถานะ taken');
    const st = await stats.adherence(db, uid, 7);
    eq(st.status, 200, 'GET stats ได้');
    eq(st.body.overall.taken, 1, 'สถิติ 7 วัน: taken = 1');
    eq(st.body.overall.due, 4, 'สถิติ 7 วัน: due = 4 (กินแล้ว 1 + ค้าง 3 ; รอบปกติและ catch-up นับเหมือนกัน)');

    // ---------- 7: slot-times ล้าง catchup เมื่อย้ายไปอนาคต ----------
    section('ย้ายมื้อ catch-up ไปเวลาอนาคตผ่าน moveTodayDoses → กลับเป็นแถวปกติ');
    const med = req('./medication-service');
    const r = await med.putSlotTimes(db, uid, { morning: '01:00', noon: '23:10', evening: '23:20', bedtime: '23:30' });
    if (r.status === 200) {
      const noon = by(await rows(), 'noon');
      ok(noon.catchup === 0 && noon.rem === 0, 'กลางวันย้ายไป 23:10 → catchup=0 reminded_at ว่าง (จะเตือนที่เวลาใหม่)');
    } else {
      console.log('  - ข้าม: putSlotTimes ไม่สำเร็จ (' + r.status + ' ' + JSON.stringify(r.body).slice(0, 80) + ') — ใกล้เที่ยงคืนหรือเวลามื้อชน');
    }
  } finally {
    if (uid) await db.query('DELETE FROM users WHERE id = ?', [uid]);
    await db.query('DELETE FROM daily_generation WHERE gen_date = CURDATE()');
    for (const m of origMarker) {
      await db.query('INSERT INTO daily_generation (gen_date, generated_at, source, inserted, catchup) VALUES (CURDATE(), ?, ?, ?, ?)', [m.generated_at, m.source, m.inserted, m.catchup]);
    }
    const left = await db.query("SELECT COUNT(*) AS n FROM users WHERE email = ?", [email]);
    console.log(`\n(ลบผู้ใช้ทดสอบแล้ว เหลือ ${left[0].n} · marker วันนี้ ${origMarker.length ? 'คืนค่าเดิม' : 'ไม่มีเดิม → ลบ'})`);
  }
  console.log(`\nสรุป: ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
  await db.close();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { console.error('เทสล้มเหลว:', e && e.stack || e); try { await db.close(); } catch (_) {} process.exit(2); });
