#!/usr/bin/env bash
# ตรวจว่าชุดทดสอบไม่แตะข้อมูลของผู้ใช้จริง (ผู้ใช้ที่อีเมลไม่ลงท้ายด้วย @example.test)
# ใช้: source scripts/lib/real-snapshot.sh ; ตอนเริ่ม: real_snapshot_take ; ตอนจบ (ใน cleanup หลัง recreate nodered): real_snapshot_check
#   เทียบ dose_logs ของผู้ใช้จริงที่มีอยู่ก่อนเริ่ม (id เดิม): status / reminded_at / taken_at / escalated_at ต้องไม่เปลี่ยน
#   และ notification_logs ของผู้ใช้จริงต้องไม่เพิ่ม (ชุดทดสอบชี้ LINE ปลอม ห้ามบันทึกการส่งของผู้ใช้จริง)
#   ผล: คืน 0 = ไม่เปลี่ยน ; 1 = เปลี่ยน (พิมพ์รายการที่ต่าง) ; ตั้ง REAL_SNAP_BAD=1 ให้สคริปต์ที่เรียกนับเป็น FAIL
# หมายเหตุ: ถ้าผู้ใช้จริงกดกินยาในแอประหว่างรันเทส ผลจะต่างด้วย (ไม่ใช่ความผิดของเทส) — รันเทสตอนไม่มีใครใช้แอป
REAL_SNAP_FILE="${REAL_SNAP_FILE:-$(mktemp)}"
REAL_SNAP_NOTIF="${REAL_SNAP_NOTIF:-0}"
REAL_SNAP_ESC="${REAL_SNAP_ESC:-0}"   # จำนวน dose_escalations ของผู้ใช้จริง (วันที่ 7A)
REAL_SNAP_BAD=0
_real_sql() { docker compose exec -T db sh -c 'mysql --default-character-set=utf8mb4 -N -B -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' 2>/dev/null <<<"$1"; }
_REAL_DOSE_SQL="SELECT d.id, d.status, IFNULL(d.reminded_at,'-'), IFNULL(d.taken_at,'-'), IFNULL(d.escalated_at,'-'), IFNULL(d.followup_at,'-'), IFNULL(d.source,'-') FROM dose_logs d JOIN users u ON u.id = d.user_id WHERE u.email NOT LIKE '%@example.test'"
real_snapshot_take() {
  _real_sql "$_REAL_DOSE_SQL ORDER BY d.id;" > "$REAL_SNAP_FILE"
  REAL_SNAP_NOTIF="$(_real_sql "SELECT COUNT(*) FROM notification_logs n JOIN users u ON u.id = n.user_id WHERE u.email NOT LIKE '%@example.test';")"
  REAL_SNAP_ESC="$(_real_sql "SELECT COUNT(*) FROM dose_escalations e JOIN users u ON u.id = e.user_id WHERE u.email NOT LIKE '%@example.test';")"
  echo "  (snapshot ผู้ใช้จริง: dose_logs $(wc -l < "$REAL_SNAP_FILE" | tr -d ' ') แถว, notification_logs $REAL_SNAP_NOTIF แถว)"
}
real_snapshot_check() {
  local ids after notif diff esc
  ids="$(cut -f1 "$REAL_SNAP_FILE" | paste -sd, -)"
  if [ -n "$ids" ]; then after="$(_real_sql "$_REAL_DOSE_SQL AND d.id IN ($ids) ORDER BY d.id;")"; else after=""; fi
  diff="$(diff "$REAL_SNAP_FILE" <(echo "$after" | sed "/^$/d"))"
  notif="$(_real_sql "SELECT COUNT(*) FROM notification_logs n JOIN users u ON u.id = n.user_id WHERE u.email NOT LIKE '%@example.test';")"
  esc="$(_real_sql "SELECT COUNT(*) FROM dose_escalations e JOIN users u ON u.id = e.user_id WHERE u.email NOT LIKE '%@example.test';")"
  if [ -z "$diff" ] && [ "$notif" = "$REAL_SNAP_NOTIF" ] && [ "$esc" = "$REAL_SNAP_ESC" ]; then
    echo "  ✔ ข้อมูลผู้ใช้จริงไม่เปลี่ยน (dose_logs $(wc -l < "$REAL_SNAP_FILE" | tr -d ' ') แถว: status/reminded_at/taken_at/escalated_at/followup_at/source เท่าเดิม, dose_escalations เท่าเดิม, notification_logs $notif แถวเท่าเดิม)"
    return 0
  fi
  echo "  ✘ ข้อมูลผู้ใช้จริงเปลี่ยนระหว่างรันเทส!"
  [ -n "$diff" ] && echo "$diff" | head -10
  [ "$notif" != "$REAL_SNAP_NOTIF" ] && echo "    notification_logs ของผู้ใช้จริง: $REAL_SNAP_NOTIF → $notif"
  [ "$esc" != "$REAL_SNAP_ESC" ] && echo "    dose_escalations ของผู้ใช้จริง: $REAL_SNAP_ESC → $esc"
  REAL_SNAP_BAD=1
  return 1
}
