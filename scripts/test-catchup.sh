#!/usr/bin/env bash
# ทดสอบ ensureToday (catch-up เมื่อพลาด cron 00:05): ผู้ใช้ทดสอบ @example.test เท่านั้น, LINE ปลอมในตัวเทส (ไม่มีข้อความจริงออก)
#   bash scripts/test-catchup.sh   (ต้องมี nodered/db รันอยู่ — ไม่ recreate อะไร)
cd "$(dirname "$0")/.."
source scripts/lib/clock.sh
source scripts/lib/real-snapshot.sh
clock_guard 150 100 || exit $?
real_snapshot_take
OUT="$(docker compose exec -T nodered node - < scripts/test-catchup.mjs 2>&1)"; RC=$?
printf '%s\n' "$OUT"
echo; echo "== ข้อมูลผู้ใช้จริง"
real_snapshot_check || { echo "สรุป: ข้อมูลผู้ใช้จริงเปลี่ยน → ไม่ผ่าน"; exit 1; }
exit $RC
