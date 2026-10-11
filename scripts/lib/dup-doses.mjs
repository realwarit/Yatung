// ตัดสินว่าจะเก็บ/ลบ dose ซ้ำตัวไหน — ใช้ใน scripts/fix-duplicate-doses.mjs ; ฟังก์ชันล้วน ทดสอบที่ node-red/test/slot-move.test.js
/** แยกกลุ่มซ้ำและตัดสินใจ — ฟังก์ชันล้วน (rows: id, medication_id, slot, scheduled_at, status, taken_at, reminded_at, followup_at, escalated_at, med_name, user_id) */
export function planDuplicates(rows) {
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.medication_id}|${r.slot}|${String(r.scheduled_at).slice(0, 10)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const plans = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const taken = g.filter((r) => r.status === 'taken').sort((a, b) => String(a.taken_at).localeCompare(String(b.taken_at)) || a.id - b.id);
    const keep = taken.length ? taken[0]
      : g.slice().sort((a, b) => String(b.scheduled_at).localeCompare(String(a.scheduled_at)) || b.id - a.id)[0];
    const others = g.filter((r) => r.id !== keep.id);
    plans.push({ keep, remove: others.filter((r) => r.status !== 'taken'), manual: others.filter((r) => r.status === 'taken') });
  }
  return plans;
}
