#!/usr/bin/env bash
# ตัวกันเวลาของวันสำหรับชุดทดสอบ: บางเคสสร้างรอบกินยาด้วย NOW() - INTERVAL n MINUTE / NOW() + INTERVAL n MINUTE หรือตั้งมื้อ ก่อนนอน = 23:59
# ซึ่งระบบนับ "รอบของวันนี้" ด้วย DATE(scheduled_at) = CURDATE() → ถ้ารันใกล้เที่ยงคืน รอบจะข้ามไปอีกวันแล้วผลเทสเพี้ยน (ไม่ใช่บั๊กของระบบ)
# ใช้: source scripts/lib/clock.sh ; clock_guard <ย้อนหลังสูงสุด (นาที)> <ล่วงหน้าสูงสุด (นาที)>
#   ใช้เวลาของ DB (Asia/Bangkok เหมือนที่ระบบใช้) ; ปลอดภัยเมื่อ  ย้อนหลัง+5 ≤ นาทีของวัน ≤ 1435 − ล่วงหน้า
#   ถ้าอยู่นอกช่วงปลอดภัยแต่รอไม่เกิน CLOCK_MAX_WAIT_MIN (ค่าเริ่มต้น 12) นาที → รอแล้วรันต่อ ; รอนานกว่านั้น → ออกด้วย exit 3 พร้อมบอกเวลาที่รันได้
#   CLOCK_GUARD=off = ข้าม (รับผิดชอบเอง)
_clock_sql() { docker compose exec -T db sh -c 'mysql -N -B -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -e "SELECT HOUR(NOW())*60+MINUTE(NOW())"' 2>/dev/null | tr -d '\r'; }
clock_guard() {
  [ "${CLOCK_GUARD:-on}" = "off" ] && return 0
  local back="${1:-5}" fwd="${2:-5}" maxwait="${CLOCK_MAX_WAIT_MIN:-12}" m lo hi wait
  lo=$((back + 5)); hi=$((1435 - fwd))
  while :; do
    m="$(_clock_sql)"
    if ! [[ "$m" =~ ^[0-9]+$ ]]; then echo "  (ตรวจเวลาของ DB ไม่ได้ — ข้ามตัวกันเวลา)"; return 0; fi
    if [ "$m" -ge "$lo" ] && [ "$m" -le "$hi" ]; then return 0; fi
    if [ "$m" -lt "$lo" ]; then wait=$((lo - m)); else wait=$((1440 - m + lo)); fi
    if [ "$wait" -le "$maxwait" ]; then
      echo "  ⏳ ตอนนี้ใกล้เที่ยงคืน (เทสชุดนี้ต้องการช่วง $(printf '%02d:%02d' $((lo/60)) $((lo%60)))–$(printf '%02d:%02d' $((hi/60)) $((hi%60)))) — รอ $wait นาที"
      sleep $((wait * 60)); continue
    fi
    printf '✘ รันชุดนี้ตอนนี้ไม่ได้: เวลา DB %02d:%02d อยู่นอกช่วงปลอดภัย %02d:%02d–%02d:%02d (ชุดนี้ใช้เวลาย้อนหลัง %s นาที / ล่วงหน้า %s นาที รอบกินยาจะข้ามวัน)\n  → กลับมารันหลัง %02d:%02d  (หรือ CLOCK_GUARD=off ถ้ารับผิดชอบเอง)\n' \
      $((m/60)) $((m%60)) $((lo/60)) $((lo%60)) $((hi/60)) $((hi%60)) "$back" "$fwd" $((lo/60)) $((lo%60))
    exit 3
  done
}
