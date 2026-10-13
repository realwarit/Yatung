# บันทึก log ของ nodered ลงไฟล์ "ก่อน" ถูก recreate/restart/stop (log ของ container เดิมหายทันทีที่ recreate)
#   source scripts/lib/nodered-log.sh      # ใส่บรรทัดเดียวในสคริปต์ที่ recreate nodered
# หลัง source: คำสั่ง `docker compose up|restart|stop|rm|kill … nodered` และ `docker compose down` จะ dump log ก่อนอัตโนมัติ
#   (ครอบ function `docker` + export -f จึงมีผลกับ bash -c ลูกด้วย ; ไม่ต้องแก้ทีละจุดที่ recreate)
# ไฟล์: $TEST_LOG_DIR/nodered-<ชุด>.log  (ค่าเริ่มต้น test-logs/<เวลาเริ่ม>/ ; ชุด = $TEST_SUITE หรือชื่อสคริปต์) — เก็บเฉพาะส่วนที่ยังไม่เคย dump (--since จากเวลา dump ล่าสุด)
# test-logs/ อยู่ใน .gitignore (log อาจมี id/ข้อความภายในระบบ ห้าม commit)
: "${TEST_LOG_DIR:=$PWD/test-logs/$(date +%Y%m%d-%H%M%S)}"
export TEST_LOG_DIR

nodered_log_save() { # nodered_log_save [ชื่อชุด] [หมายเหตุ]
  local suite="${1:-${TEST_SUITE:-$(basename "${0:-script}" .sh)}}" why="${2:-}"
  local f="$TEST_LOG_DIR/nodered-$suite.log" mark="$TEST_LOG_DIR/.since-$suite" since=() now
  mkdir -p "$TEST_LOG_DIR" 2>/dev/null || return 0
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  [ -s "$mark" ] && since=(--since "$(cat "$mark")")
  { echo "##### $(date '+%F %T') $why"; command docker compose logs --no-color --timestamps ${since[@]+"${since[@]}"} nodered 2>&1; } >> "$f" 2>/dev/null || true
  echo "$now" > "$mark"
  return 0
}

docker() {
  if [ "${1:-}" = compose ]; then
    case " $* " in
      *" down "*) nodered_log_save "" "ก่อน docker $*" ;;
      *" nodered "*) case " $* " in *" up "*|*" restart "*|*" stop "*|*" rm "*|*" kill "*) nodered_log_save "" "ก่อน docker $*" ;; esac ;;
    esac
  fi
  command docker "$@"
}
export -f docker nodered_log_save
