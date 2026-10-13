// ข้อมูลจำลองกลางของเครื่องมือตรวจหน้าจอ (ไม่ต้อง login/docker) — ใช้โดย overflow-check.mjs และ state-check.mjs
export const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export const FAKE_JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 1, email: 'x@example.test', exp: 4102444800 })}.sig`;
export const ymd = '2026-10-12';
export const dose = (id, slot, hhmm, name, status) => ({
  id, medication_id: id, name, tts_name: null, strength: '500 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'after',
  scheduled_at: `${ymd} ${hhmm}:00`, status, taken_at: status === 'taken' ? `${ymd} ${hhmm}:05` : null, source: status === 'taken' ? 'line' : null, is_overdue: false,
});
// เวลาไทยของเครื่องตอนนี้ + offsetMin นาที → 'YYYY-MM-DD HH:mm:00'
const p2 = (n) => String(n).padStart(2, '0');
export const bkkAt = (offsetMin = 0, now = Date.now()) => {
  const d = new Date(now + 7 * 3600_000 + offsetMin * 60_000);
  return { date: `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`, hhmm: `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` };
};
const mk = (id, slot, offsetMin, name, status, extra = {}) => {
  const t = bkkAt(offsetMin);
  return { id, medication_id: id, name, tts_name: null, strength: '500 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'after',
    scheduled_at: `${t.date} ${t.hhmm}:00`, status, taken_at: status === 'taken' ? `${t.date} ${t.hhmm}:05` : null, source: status === 'taken' ? 'line' : null, is_overdue: false, _time: t.hhmm, ...extra };
};
const slotOf = (slot, doses) => ({ slot, time: doses[0]._time, doses: doses.map(({ _time, ...d }) => d) });
/** สถานการณ์ของหน้าวันนี้ (เวลาอ้างจากนาฬิกาจริงของเครื่อง) : late = มีมื้อเลยเวลา + มื้อถัดไป · before = ยังไม่ถึงมื้อแรก · done = กินครบทั้งวัน · soon = มื้อถัดไปอีก 5 นาที */
export const todayFor = (scenario = 'late') => {
  const slots = {
    late: [slotOf('morning', [mk(1, 'morning', -600, 'Metformin', 'taken')]),
      slotOf('noon', [mk(2, 'noon', -120, 'Amlodipine', 'pending'), mk(3, 'noon', -120, 'ซิมวาสแตติน ชื่อยาที่ยาวมากเพื่อทดสอบการตัดบรรทัด', 'pending'), mk(5, 'noon', -120, 'Losartan', 'pending')]),
      slotOf('evening', [mk(4, 'evening', 180, 'Aspirin', 'pending')])],
    before: [slotOf('morning', [mk(1, 'morning', 45, 'Metformin', 'pending'), mk(2, 'morning', 45, 'Amlodipine', 'pending')]), slotOf('evening', [mk(3, 'evening', 360, 'Simvastatin', 'pending')])],
    done: [slotOf('morning', [mk(1, 'morning', -600, 'Metformin', 'taken')]), slotOf('noon', [mk(2, 'noon', -300, 'Amlodipine', 'taken'), mk(3, 'noon', -300, 'Losartan', 'taken')]), slotOf('evening', [mk(4, 'evening', -60, 'Aspirin', 'taken')])],
    soon: [slotOf('bedtime', [mk(1, 'bedtime', 5, 'Melatonin', 'pending')])],
  }[scenario];
  const all = slots.flatMap((x) => x.doses);
  return { summary: { total: all.length, taken: all.filter((d) => d.status === 'taken').length, pending: all.filter((d) => d.status === 'pending').length, missed: 0 }, slots };
};
export const TODAY = todayFor('late');
export const D = (date, label_th, taken, missed, pending_due, upcoming, is_today = false) => {
  const due = taken + missed + pending_due;
  return { date, label_th, is_today, taken, missed, pending_due, upcoming, due, rate: due ? Math.round((taken * 100) / due) : null };
};
export const days = [D('2026-10-06', 'อ. 6 ต.ค.', 3, 0, 0, 0), D('2026-10-07', 'พ. 7 ต.ค.', 0, 0, 0, 0), D('2026-10-08', 'พฤ. 8 ต.ค.', 2, 1, 0, 0),
  D('2026-10-09', 'ศ. 9 ต.ค.', 1, 2, 0, 0), D('2026-10-10', 'ส. 10 ต.ค.', 3, 0, 0, 0), D('2026-10-11', 'อา. 11 ต.ค.', 2, 0, 1, 0), D('2026-10-12', 'จ. 12 ต.ค.', 0, 0, 2, 3, true)];
export const sum = (k) => days.reduce((n, d) => n + d[k], 0);
export const ADH = {
  range: { from: '2026-10-06', to: '2026-10-12', days: 7 },
  overall: { taken: sum('taken'), missed: sum('missed'), pending_due: sum('pending_due'), due: sum('due'), rate: Math.round((sum('taken') * 100) / sum('due')) },
  days, by_meal: [{ meal: 'morning', label_th: 'เช้า', due: 7, taken: 7, rate: 100 }, { meal: 'evening', label_th: 'เย็น', due: 7, taken: 4, rate: 57 }],
  by_medication: [
    { medication_id: 2, name: 'ซิมวาสแตติน ชื่อยาที่ยาวมากเพื่อทดสอบ', strength: '20 mg', is_active: true, due: 7, taken: 4, rate: 57 },
    { medication_id: 3, name: 'Metformin', strength: '500 mg', is_active: false, due: 6, taken: 6, rate: 100 },
  ],
  by_source: { app: 3, push: 1, line: 1, caregiver: 1, other: 0 }, streak_days: 1, generated_at: '',
};
export const MED = { id: 1, name: 'Amlodipine', tts_name: null, strength: '5 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'after', as_needed: false, slots: ['morning', 'evening'],
  indication: 'ลดความดัน', warnings: ['อาจทำให้ง่วง'], total_qty: 30, remaining_qty: 4, days_left: 2, refill_alert_days: 7, is_low: true, start_date: ymd, end_date: null, is_active: true, created_at: '', updated_at: '' };

// ยาเมื่อมีอาการ (หน้าวันนี้แสดงเป็นรายการ "ยาเมื่อมีอาการ" ไม่มีปุ่มกินแล้ว)
export const MED_PRN = { ...MED, id: 9, name: 'Paracetamol', strength: '500 mg', as_needed: true, slots: [], indication: 'ลดไข้ แก้ปวด', is_low: false, days_left: null, remaining_qty: 10 };

export const REVIEW = { prescription_id: 1, status: 'draft', input_type: 'image', has_image: false, ocr_text: 'Metformin 500 mg 1 tab bid pc', existing_matches: [], review_flags: [{ index: 0, field: 'dose', reason: 'ตรวจขนาดยา' }],
  result: { is_medicine_label: true, medications: [{ name: 'Metformin', strength: '500 mg', dose_per_time: 1, unit: 'tablet', meal_relation: 'after', slots: ['morning', 'evening'], as_needed: false, total_qty: 60, indication: 'เบาหวาน', warnings: [], confidence: { name: 0.9, dose: 0.5 } }], unreadable_parts: [] } };

export const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** ผูก API จำลองทั้งหมด ; opts.htmlMode() true = ตอบ HTML 200 (เหมือนหน้าเตือนของ ngrok) */
export async function mockApi(page, opts = {}) {
  await page.route('**/api/**', (route) => {
    const u = new URL(route.request().url()).pathname;
    if (opts.htmlMode?.()) return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>ngrok</title>Visit Site' });
    if (u === '/api/me') return route.fulfill(json({ id: 1, email: 'x@example.test', display_name: 'ผู้ทดสอบ', notify_both: false, push_subscribed: false }));
    if (u === '/api/doses/today' && opts.todayStatus) return route.fulfill({ status: opts.todayStatus(), contentType: 'text/plain', body: '' });
    if (u === '/api/doses/today') return route.fulfill(json(todayFor(opts.today?.() ?? 'late')));
    if (u === '/api/doses/take-many') { const ids = JSON.parse(route.request().postData() ?? '{}').ids ?? []; opts.onTakeMany?.(ids); return route.fulfill(json({ taken: ids, already: [], skipped: 0, at: '12:00' })); }
    if (u.startsWith('/api/doses/') && u.endsWith('/take') && /^\d+$/.test(u.split('/')[3])) { const id = Number(u.split('/')[3]); opts.onTake?.(id); return route.fulfill(json({ id, status: 'taken', taken_at: bkkAt(0).date + ' ' + bkkAt(0).hhmm + ':00', source: 'app', remaining_qty: null })); }
    if (u === '/api/medications') return route.fulfill(json([MED, MED_PRN]));
    if (u === '/api/stats/adherence') return route.fulfill(json(ADH));
    if (u === '/api/settings/slot-times') return route.fulfill(json({ morning: '08:00', noon: '12:00', evening: '18:00', bedtime: '21:00' }));
    if (u === '/api/line/status') return route.fulfill(json({ linked: true, display_name: 'ผู้ทดสอบ' }));
    if (u === '/api/caregivers') return route.fulfill(json({ caregivers: [] }));
    if (u === '/api/prescriptions/1') return route.fulfill(json(REVIEW));
    if (u === '/api/config') return route.fulfill(json({ demoMode: opts.demoMode?.() ?? false }));
    return route.fulfill(json({ error: 'NOT_MOCKED', details: u }, 404));
  });
}

/** เสียงไทยจำลอง (เบราว์เซอร์ headless ไม่มี speechSynthesis) — ให้ปุ่ม 🔊 แสดงเหมือนมือถือที่มีเสียงไทย ; เรียกกับ context ก่อนเปิดหน้า */
export async function fakeThaiVoice(ctx) {
  await ctx.addInitScript(() => {
    const voices = [{ lang: 'th-TH', name: 'Thai (จำลอง)', voiceURI: 'th-fake', default: true, localService: true }];
    const synth = { getVoices: () => voices, speak() {}, cancel() {}, addEventListener() {}, removeEventListener() {}, speaking: false, pending: false, paused: false };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  });
}
