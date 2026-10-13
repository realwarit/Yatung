#!/usr/bin/env bash
# ตรวจว่าชุดทดสอบไม่แตะข้อมูลของผู้ใช้จริง (ผู้ใช้ที่อีเมลไม่ลงท้ายด้วย @example.test)
# ใช้: source scripts/lib/real-snapshot.sh ; ตอนเริ่ม: real_snapshot_take ; ตอนจบ (ใน cleanup หลัง recreate nodered): real_snapshot_check
#   เก็บ snapshot ก่อน-หลัง: dose_logs (id เดิม) · notification_logs ทุกแถว · push_subscriptions/notify_both · refill_alerted_at ของยา · จำนวน dose_escalations
#   แล้วให้ scripts/lib/real-snapshot-classify.mjs จัดเป็น 3 ระดับ (กฎและเหตุผลอยู่ในไฟล์นั้น):
#     ✔ ไม่เปลี่ยนเลย
#     ⓘ เปลี่ยนจาก cron จริง (ปกติ) — reminded_at ว่าง→มีค่า, notification_logs ใหม่ kind reminder/escalation, push last_success_at เพิ่ม ; ต้องตรงรอบ cron
#        (cron จริงต้องทำงานต่อระหว่างเทส ผู้ใช้จริงจะได้รับเตือนตามเวลา — ห้ามปิด cron เพื่อให้ snapshot นิ่ง) → คืน 0 ไม่นับเป็นความล้มเหลว
#     ✘ ทุกอย่างที่เหลือ → คืน 1 ; ตั้ง REAL_SNAP_BAD=1 ให้สคริปต์ที่เรียกนับเป็น FAIL
# หมายเหตุ: ถ้าผู้ใช้จริงกดกินยาในแอประหว่างรันเทส ผลจะเป็น ✘ ด้วย (ไม่ใช่ความผิดของเทส) — รันเทสตอนไม่มีใครใช้แอป
REAL_SNAP_DIR="${REAL_SNAP_DIR:-$(mktemp -d)}"
REAL_SNAP_BAD=0
_real_sql() { docker compose exec -T db sh -c 'mysql --default-character-set=utf8mb4 -N -B -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' 2>/dev/null <<<"$1"; }
_REAL_NOT_TEST="u.email NOT LIKE '%@example.test'"
_REAL_DOSE_SQL="SELECT d.id, d.status, IFNULL(d.reminded_at,'-'), IFNULL(d.taken_at,'-'), IFNULL(d.escalated_at,'-'), IFNULL(d.followup_at,'-'), IFNULL(d.source,'-') FROM dose_logs d JOIN users u ON u.id = d.user_id WHERE $_REAL_NOT_TEST"
_REAL_NOTIF_SQL="SELECT n.id, n.kind, n.channel, n.sent_at FROM notification_logs n JOIN users u ON u.id = n.user_id WHERE $_REAL_NOT_TEST ORDER BY n.id"
_REAL_PUSH_SQL="SELECT IFNULL(p.id,'-'), IFNULL(p.fail_count,'-'), IFNULL(p.last_success_at,'-'), u.id, u.notify_both FROM users u LEFT JOIN push_subscriptions p ON p.user_id = u.id WHERE $_REAL_NOT_TEST ORDER BY u.id, p.id"
_REAL_MED_SQL="SELECT m.id, IFNULL(m.refill_alerted_at,'-') FROM medications m JOIN users u ON u.id = m.user_id WHERE $_REAL_NOT_TEST ORDER BY m.id"
_REAL_ESC_SQL="SELECT COUNT(*) FROM dose_escalations e JOIN users u ON u.id = e.user_id WHERE $_REAL_NOT_TEST"
_real_dump() { # _real_dump before|after
  local side="$1" ids
  if [ "$side" = before ]; then _real_sql "$_REAL_DOSE_SQL ORDER BY d.id;" > "$REAL_SNAP_DIR/before.doses"
  else
    ids="$(cut -f1 "$REAL_SNAP_DIR/before.doses" | paste -sd, -)"   # เทียบเฉพาะ dose ที่มีก่อนเริ่ม (cron 00:05 สร้างรอบใหม่ได้ตามปกติ)
    if [ -n "$ids" ]; then _real_sql "$_REAL_DOSE_SQL AND d.id IN ($ids) ORDER BY d.id;" > "$REAL_SNAP_DIR/after.doses"; else : > "$REAL_SNAP_DIR/after.doses"; fi
  fi
  _real_sql "$_REAL_NOTIF_SQL;" > "$REAL_SNAP_DIR/$side.notifs"
  _real_sql "$_REAL_PUSH_SQL;" > "$REAL_SNAP_DIR/$side.push"
  _real_sql "$_REAL_MED_SQL;" > "$REAL_SNAP_DIR/$side.meds"
  _real_sql "$_REAL_ESC_SQL;" > "$REAL_SNAP_DIR/$side.esc"
}
real_snapshot_take() {
  _real_dump before
  echo "  (snapshot ผู้ใช้จริง: dose_logs $(wc -l < "$REAL_SNAP_DIR/before.doses" | tr -d ' ') แถว, notification_logs $(wc -l < "$REAL_SNAP_DIR/before.notifs" | tr -d ' ') แถว)"
}
real_snapshot_check() {
  local rc
  _real_dump after
  node scripts/lib/real-snapshot-classify.mjs "$REAL_SNAP_DIR"; rc=$?
  [ "$rc" -ne 0 ] && REAL_SNAP_BAD=1
  return "$rc"
}
