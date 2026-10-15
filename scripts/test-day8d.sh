#!/usr/bin/env bash
# ทดสอบ 8D (D2): POST /api/doses/take-many ("กินครบมื้อนี้") — เจ้าของ / ผู้ใช้อื่น / ผสม / กดซ้ำ / หักยา / source / ids ผิดรูปแบบ / ไม่มี JWT
#   bash scripts/test-day8d.sh        (ไม่เรียก Gemini/LINE ; user ทดสอบสุ่มแล้วลบทิ้งตอนจบ ; recreate nodered 2 ครั้ง : ต้นเพื่อโหลด flows ใหม่ ปลายเพื่อคืนค่าตาม .env)
set -u
BASE="${BASE:-http://localhost:1880}"
cd "$(dirname "$0")/.."
source scripts/lib/nodered-log.sh
source scripts/lib/clock.sh; clock_guard 5 5

PASS=0; FAIL=0; STATUS=""; BODY=""
sql() { docker compose exec -T db sh -c 'mysql --default-character-set=utf8mb4 -N -B -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' 2>/dev/null <<<"$1"; }
jget() { printf '%s' "$BODY" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);const v=eval(process.argv[1]);console.log(typeof v==="object"?JSON.stringify(v):v)}catch(e){console.log("")}})' "$1"; }
req() { # req METHOD PATH TOKEN [JSON_BODY]
  local m="$1" p="$2" t="$3" b="${4:-}" out
  local args=(-s -X "$m" "$BASE$p" -w $'\n%{http_code}' -H 'Content-Type: application/json')
  [ -n "$t" ] && args+=(-H "Authorization: Bearer $t")
  [ -n "$b" ] && args+=(--data-binary @-)
  out="$(printf "%s" "$b" | curl "${args[@]}")"
  STATUS="${out##*$'\n'}"; BODY="${out%$'\n'*}"
}
ok() { PASS=$((PASS+1)); echo "  ✔ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✘ $1"; }
expect() { if [ "$2" = "$3" ]; then ok "$1 (= $3)"; else bad "$1 (ได้ '$2' ควรเป็น '$3')"; fi; }
section() { echo; echo "== $1"; }

restart_nodered() {
  docker compose up -d --force-recreate nodered >/dev/null 2>&1
  for _ in $(seq 40); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/me")" = "401" ] && return 0
    sleep 1.5
  done
  echo "nodered ไม่พร้อม"; return 1
}

TEST_EMAILS=()
new_user() { # ตั้ง TOKEN_NEW และ UID_NEW (ห้ามเรียกใน $(...))
  local e="test-day8d-$RANDOM$RANDOM@example.test" pw
  pw="$(node -e 'console.log(require("crypto").randomBytes(9).toString("hex"))')"
  req POST /api/auth/register "" "{\"email\":\"$e\",\"password\":\"$pw\",\"display_name\":\"ผู้ทดสอบ day8d\"}"
  TEST_EMAILS+=("$e")
  TOKEN_NEW="$(jget 'o.token')"
  UID_NEW="$(sql "SELECT id FROM users WHERE email='$e';")"
}
cleanup() {
  local e
  for e in "${TEST_EMAILS[@]}"; do sql "DELETE FROM users WHERE email='$e';"; done
  docker compose up -d --force-recreate nodered >/dev/null 2>&1
  echo; echo "== ข้อมูลผู้ใช้จริง"
  real_snapshot_check || { echo "สรุป: ข้อมูลผู้ใช้จริงเปลี่ยน → ไม่ผ่าน"; exit 1; }
  echo; echo "สรุป: ผ่าน $PASS · ไม่ผ่าน $FAIL"
  [ "$FAIL" -eq 0 ] || exit 1
}
source scripts/lib/real-snapshot.sh
real_snapshot_take
trap cleanup EXIT

# mkmed USER_ID NAME QTY → MED_ID (ยาใช้งานอยู่ ไม่ผ่าน API เพื่อไม่ให้สร้างรอบอัตโนมัติ)
mkmed() {
  MED_ID="$(sql "INSERT INTO medications (user_id, name, strength, dose_per_time, unit, meal_relation, total_qty, remaining_qty, start_date) VALUES ($1, '$2', '500 mg', 1, 'tablet', 'after', $3, $3, CURDATE()); SELECT LAST_INSERT_ID();")"
}
# mkdose USER_ID MED_ID SLOT HHMM → DOSE_ID (วันนี้ pending)
mkdose() {
  DOSE_ID="$(sql "INSERT INTO dose_logs (medication_id, user_id, slot, scheduled_at, status) VALUES ($2, $1, '$3', CONCAT(CURDATE(), ' $4:00'), 'pending'); SELECT LAST_INSERT_ID();")"
}
remaining() { sql "SELECT remaining_qty FROM medications WHERE id=$1;"; }
dstatus() { sql "SELECT CONCAT(status, '/', IFNULL(source, '-')) FROM dose_logs WHERE id=$1;"; }

# ====================================================================================
section "เตรียม: recreate nodered (โหลด flows ใหม่) + สมัคร user A, B"
restart_nodered || exit 1
new_user; TA="$TOKEN_NEW"; UA="$UID_NEW"; [ -n "$TA" ] && ok "user A (id $UA)" || { bad "สมัคร A ไม่สำเร็จ $BODY"; exit 1; }
new_user; TB="$TOKEN_NEW"; UB="$UID_NEW"; [ -n "$TB" ] && ok "user B (id $UB)" || { bad "สมัคร B ไม่สำเร็จ"; exit 1; }
mkmed "$UA" "Metformin" 10; M1="$MED_ID"
mkmed "$UA" "Amlodipine" 1; M2="$MED_ID"
mkdose "$UA" "$M1" evening 18:00; D1="$DOSE_ID"
mkdose "$UA" "$M2" evening 18:00; D2="$DOSE_ID"
mkmed "$UB" "ยาของ B" 5; MB="$MED_ID"
mkdose "$UB" "$MB" evening 18:00; DB="$DOSE_ID"

section "ไม่มี JWT / ids ผิดรูปแบบ"
req POST /api/doses/take-many "" "{\"ids\":[$D1]}"; expect "ไม่มี JWT → 401" "$STATUS" "401"
req POST /api/doses/take-many "$TA" '{}'; expect "ไม่มี ids → 400" "$STATUS" "400"
expect "  error = VALIDATION" "$(jget 'o.error')" "VALIDATION"
req POST /api/doses/take-many "$TA" '{"ids":[]}'; expect "ids ว่าง → 400" "$STATUS" "400"
req POST /api/doses/take-many "$TA" '{"ids":["1"]}'; expect "ids เป็นสตริง → 400" "$STATUS" "400"
req POST /api/doses/take-many "$TA" '{"ids":[0]}'; expect "ids = 0 → 400" "$STATUS" "400"
req POST /api/doses/take-many "$TA" '{"ids":[1.5]}'; expect "ids ทศนิยม → 400" "$STATUS" "400"
BIG="$(node -e 'console.log(JSON.stringify({ids:Array.from({length:51},(_,i)=>i+1)}))')"
req POST /api/doses/take-many "$TA" "$BIG"; expect "ids 51 รายการ → 400" "$STATUS" "400"
expect "ยังไม่มี dose ไหนถูกแตะ" "$(dstatus "$D1")" "pending/-"

section "ผู้ใช้อื่น"
req POST /api/doses/take-many "$TA" "{\"ids\":[$DB]}"; expect "ids เป็นของ B ล้วน → 404" "$STATUS" "404"
expect "  dose ของ B ไม่เปลี่ยน" "$(dstatus "$DB")" "pending/-"
req POST /api/doses/take-many "$TA" "{\"ids\":[$D1,$DB]}"; expect "ผสมของ A + ของ B → 200" "$STATUS" "200"
expect "  taken = [D1]" "$(jget 'o.taken')" "[$D1]"
expect "  skipped = 1" "$(jget 'o.skipped')" "1"
expect "  dose ของ B ไม่เปลี่ยน" "$(dstatus "$DB")" "pending/-"
expect "  D1 = taken จากแอป" "$(dstatus "$D1")" "taken/app"
expect "  ยา M1 หัก 1 → 9" "$(remaining "$M1")" "9.00"

section "กดซ้ำ ไม่หักยาซ้ำ + หักถูก + clamp ที่ 0"
req POST /api/doses/take-many "$TA" "{\"ids\":[$D1,$D2,$D2]}"; expect "ส่ง D1 (กินแล้ว) + D2 (ซ้ำ 2 ครั้งใน ids) → 200" "$STATUS" "200"
expect "  taken = [D2] (dedupe)" "$(jget 'o.taken')" "[$D2]"
expect "  already = [D1]" "$(jget 'o.already')" "[$D1]"
expect "  มีเวลา at แบบ HH:MM" "$(jget '/^\d\d:\d\d$/.test(o.at)')" "true"
expect "  M1 ไม่หักซ้ำ (ยัง 9)" "$(remaining "$M1")" "9.00"
expect "  M2 เหลือ 1 − 1 = 0" "$(remaining "$M2")" "0.00"
req POST /api/doses/take-many "$TA" "{\"ids\":[$D1,$D2]}"; expect "ส่งซ้ำทั้งคู่ → 200 (already ทั้งหมด)" "$STATUS" "200"
expect "  taken ว่าง" "$(jget 'o.taken')" "[]"
expect "  M2 ยัง 0 (ไม่ติดลบ)" "$(remaining "$M2")" "0.00"

section "กินย้อนหลังได้ (missed → taken) และ undo ใช้ได้ตามเดิม"
mkdose "$UA" "$M1" morning 08:00; D3="$DOSE_ID"
sql "UPDATE dose_logs SET status='missed' WHERE id=$D3;"
req POST /api/doses/take-many "$TA" "{\"ids\":[$D3]}"; expect "missed → 200" "$STATUS" "200"
expect "  taken = [D3]" "$(jget 'o.taken')" "[$D3]"
req POST "/api/doses/$D3/undo" "$TA"; expect "undo ของ D3 → 200" "$STATUS" "200"
expect "  กลับเป็น pending (ไม่เคยแจ้งญาติ)" "$(jget 'o.status')" "pending"
expect "  ยาคืน M1 → 9" "$(remaining "$M1")" "9.00"
