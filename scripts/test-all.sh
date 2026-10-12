#!/usr/bin/env bash
# รันชุดทดสอบทั้งหมดตามลำดับ แล้วสรุปตาราง ผ่าน/ไม่ผ่าน ตอนจบ (exit 0 = ผ่านทุกชุด)
#   bash scripts/test-all.sh              # ทุกชุด
#   bash scripts/test-all.sh 6b 7a        # เฉพาะบางชุด (unit = node --test)
# ข้อควรระวัง:
#   - ห้ามรันในช่วง 30 นาทีก่อนเดโม/นำเสนอ และอย่ารันใกล้มื้อยาของผู้ใช้จริง: ชุดทดสอบ recreate nodered หลายรอบและปิด cron เตือนจริงชั่วคราว
#   - ต้อง docker compose up -d --build (รวม frontend) ก่อน (6c และ 7c ตรวจไฟล์ที่ build ใหม่) ; day4 รันเฉพาะโหมด mock (ไม่เรียก Gemini จริง ไม่เปลืองโควตา)
#   - บางชุดไม่รันใกล้เที่ยงคืน (scripts/lib/clock.sh) — ชุดที่ถูกข้ามด้วยเหตุนี้ขึ้น "ข้าม (เวลา)" และทำให้ exit ไม่เป็น 0
set -u
cd "$(dirname "$0")/.."

declare -a NAMES CMDS
add() { NAMES+=("$1"); CMDS+=("$2"); }
add unit   'node --test "node-red/test/*.test.js"'
add 3a     'bash scripts/test-day3a.sh'
add 4      'bash scripts/test-day4.sh mock'
add 5      'bash scripts/test-day5.sh'
add 6      'bash scripts/test-day6.sh'
add 6b     'bash scripts/test-day6b.sh'
add 6c     'bash scripts/test-day6c.sh'
add 7a     'bash scripts/test-day7a.sh'
add 7b     'bash scripts/test-day7b.sh'
add 7c     'bash scripts/test-day7c.sh'
add 8      'bash scripts/test-day8.sh'

WANT=" $* "
LOGDIR="$(mktemp -d)"
declare -a ROWS
ANY_FAIL=0
START=$(date +%s)

for i in "${!NAMES[@]}"; do
  n="${NAMES[$i]}"
  [ "$#" -gt 0 ] && [[ "$WANT" != *" $n "* ]] && continue
  echo; echo "################ ชุด $n : ${CMDS[$i]}"
  t0=$(date +%s)
  bash -c "${CMDS[$i]}" 2>&1 | tee "$LOGDIR/$n.log"
  rc=${PIPESTATUS[0]}
  dt=$(( $(date +%s) - t0 ))
  if [ "$n" = unit ]; then
    p="$(grep -E '^ℹ pass ' "$LOGDIR/$n.log" | tail -1 | awk '{print $3}')"; f="$(grep -E '^ℹ fail ' "$LOGDIR/$n.log" | tail -1 | awk '{print $3}')"
  else
    line="$(grep -E '^สรุป: ผ่าน [0-9]+ · ไม่ผ่าน [0-9]+' "$LOGDIR/$n.log" | tail -1)"
    p="$(printf '%s' "$line" | sed -nE 's/^สรุป: ผ่าน ([0-9]+) .*/\1/p')"; f="$(printf '%s' "$line" | sed -nE 's/.*ไม่ผ่าน ([0-9]+).*/\1/p')"
  fi
  if [ "$rc" -eq 3 ] && grep -q 'รันชุดนี้ตอนนี้ไม่ได้' "$LOGDIR/$n.log"; then res="ข้าม (เวลา)"; ANY_FAIL=1
  elif [ "$rc" -eq 0 ] && [ "${f:-x}" = "0" ]; then res="ผ่าน"
  else res="ไม่ผ่าน (exit $rc)"; ANY_FAIL=1; fi
  ROWS+=("$(printf '%-6s | %-18s | %6s | %8s | %5ss' "$n" "$res" "${p:--}" "${f:--}" "$dt")")
done

# nginx (frontend) resolve ชื่อ nodered ตอนเริ่มเท่านั้น — หลัง nodered ถูก recreate หลายรอบ ถ้า IP เปลี่ยนจะได้ 502 : ตรวจแล้วรีสตาร์ต frontend ให้
code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' http://localhost:8080/api/me)"
if [ "$code" != "401" ]; then
  echo; echo "⚠ http://localhost:8080/api/me ได้ $code (ควรเป็น 401) — รีสตาร์ต frontend เพื่อให้ nginx หา nodered ใหม่"
  docker compose restart frontend >/dev/null 2>&1; sleep 3
  code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' http://localhost:8080/api/me)"
  [ "$code" = "401" ] && ROWS+=("(หลังรัน) restart frontend แล้ว /api/me = 401") || { ROWS+=("(หลังรัน) /api/me ยังได้ $code ✘"); ANY_FAIL=1; }
fi

echo; echo "================ สรุปทุกชุด ($(( $(date +%s) - START )) วินาที) ================"
printf '%-6s | %-18s | %6s | %8s | %6s\n' ชุด ผล ผ่าน ไม่ผ่าน เวลา
printf '%s\n' "${ROWS[@]}"
echo "log รายชุดอยู่ที่ $LOGDIR"
[ "$ANY_FAIL" -eq 0 ] && echo "ทุกชุดผ่าน" || echo "มีชุดที่ไม่ผ่าน/ถูกข้าม"
exit "$ANY_FAIL"
