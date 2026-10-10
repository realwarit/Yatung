#!/usr/bin/env bash
# ทดสอบ Day 7B: เตือนยาใกล้หมด (stockService) — เกณฑ์ใกล้หมด (ยาประจำ/ยาเมื่อมีอาการ), is_low ใน GET /api/medications,
#              แจ้งครั้งเดียวต่อรอบ (refill_alerted_at) + ล้างเมื่อพ้นเกณฑ์ (เติมยา/undo), โควตา, รันซ้อนกัน, POST /api/demo/low-stock-now, migration 003
# ใช้ LINE ปลอม (scripts/fake-line.js) ไม่ส่งข้อความจริง ; user ทดสอบสุ่มใหม่ทุกครั้งแล้วลบทิ้งตอนจบ ; เคารพ REMINDER_ONLY_EMAIL_SUFFIX=@example.test
#   bash scripts/test-day7b.sh
# ข้อควรระวัง: recreate nodered 2 ครั้ง (ปิด cron จริงชั่วคราว) — อย่ารันใกล้มื้อยา เพราะผู้ใช้จริงจะไม่ได้รับเตือนช่วงนั้น

set -u
cd "$(dirname "$0")/.."
BASE="${BASE:-http://localhost:1880}"
FAKE_PORT=8798
FAKE="http://localhost:$FAKE_PORT"
SECRET="test-channel-secret-day7b"
TOKEN_LINE="test-access-token-day7b"
PUBLIC="https://test-day7b.example.dev"
TMP="$(mktemp -d)"
RUN="$RANDOM$RANDOM"
LA="U7BA${RUN}aaaaaaaaaaaaaaaaaaaaaaaaa"; LA="${LA:0:33}"
LB="U7BB${RUN}bbbbbbbbbbbbbbbbbbbbbbbbb"; LB="${LB:0:33}"

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
expect_match() { if printf '%s' "$2" | grep -qE "$3"; then ok "$1"; else bad "$1 (ได้ '$2' ไม่ตรง /$3/)"; fi; }
section() { echo; echo "== $1"; }

# ---------- LINE ปลอม ----------
fl() { curl -s -m 5 "$@"; }
fl_clear() { fl -X DELETE "$FAKE/_requests" >/dev/null; }
fl_config() { printf '%s' "$1" > "$TMP/cfg.json"; fl -X POST "$FAKE/_config" -H 'Content-Type: application/json' --data-binary "@$TMP/cfg.json" >/dev/null; }
fl_count() { fl "$FAKE/_requests" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).filter(r=>r.path==="/v2/bot/message/"+process.argv[1]).length))' "$1"; }
# fl_last push|reply EXPR → ประเมิน EXPR กับคำขอล่าสุดของ path นั้น (ตัวแปร r)
fl_last() { fl "$FAKE/_requests" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).filter(r=>r.path==="/v2/bot/message/"+process.argv[1]);const r=a[a.length-1];try{const v=eval(process.argv[2]);console.log(typeof v==="object"?JSON.stringify(v):v)}catch(e){console.log("")}})' "$1" "$2"; }

# ---------- stockService ใน container (process แยก = เหมือน cron ที่รันซ้อนกัน) ----------
RUNJS="const db=require('/data/lib/db'),{createClient}=require('/data/lib/line-client'),ss=require('/data/lib/stock-service');ss.run(db,createClient(),process.env).then(r=>{console.log(JSON.stringify(r));process.exit(0)}).catch(e=>{console.log('ERR '+e.message);process.exit(1)})"
run_stock() { docker compose exec -T nodered node -e "$RUNJS" 2>/dev/null | tail -1; }

# ---------- เตรียม/เก็บกวาด ----------
TEST_EMAILS=()
FAKE_PID=""
restart_nodered() {
  env "$@" docker compose up -d --force-recreate nodered >/dev/null 2>&1
  for _ in $(seq 40); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/me")" = "401" ] && return 0
    sleep 1.5
  done
  echo "nodered ไม่พร้อม"; return 1
}
new_user() { # new_user NAME [line_id] → ตั้ง TOKEN_NEW และ UID_NEW
  local e="test-day7b-$RANDOM$RANDOM@example.test" pw
  pw="$(node -e 'console.log(require("crypto").randomBytes(9).toString("hex"))')"
  req POST /api/auth/register "" "{\"email\":\"$e\",\"password\":\"$pw\",\"display_name\":\"ผู้ทดสอบ day7b $1\"}"
  TEST_EMAILS+=("$e")
  TOKEN_NEW="$(jget 'o.token')"
  UID_NEW="$(sql "SELECT id FROM users WHERE email='$e';")"
  sql "UPDATE user_slot_times SET slot_time='23:59:00' WHERE user_id=$UID_NEW AND slot='bedtime';" >/dev/null   # ให้ POST ยาสร้างรอบของวันนี้เสมอ
  [ -n "${2:-}" ] && sql "UPDATE users SET line_user_id='$2', line_display_name='ผู้ป่วยทดสอบ' WHERE id=$UID_NEW;" >/dev/null
}
mkmed() { # mkmed TOKEN NAME REMAINING [as_needed] → ตั้ง MED_ID (ยาประจำ 1 มื้อ/วัน ครั้งละ 1 เม็ด → พอใช้ = REMAINING วัน)
  local an="${4:-false}" slots='["bedtime"]'; [ "$an" = "true" ] && slots='[]'
  req POST /api/medications "$1" "{\"name\":\"$2\",\"strength\":\"500 mg\",\"dose_per_time\":1,\"unit\":\"tablet\",\"meal_relation\":\"after\",\"as_needed\":$an,\"slots\":$slots,\"total_qty\":60}"
  MED_ID="$(jget 'o.id')"
  sql "UPDATE medications SET remaining_qty=$3 WHERE id=$MED_ID;" >/dev/null
}
alerted() { sql "SELECT IF(refill_alerted_at IS NULL,'no','yes') FROM medications WHERE id=$1;"; }
low_logs() { sql "SELECT COUNT(*) FROM notification_logs WHERE user_id=$1 AND kind='low_stock' AND channel='line_push' AND success=1;"; }
cleanup() {
  local e
  for e in "${TEST_EMAILS[@]}"; do sql "DELETE FROM users WHERE email='$e';"; done
  [ -n "$FAKE_PID" ] && kill "$FAKE_PID" 2>/dev/null
  rm -rf "$TMP"
  docker compose up -d --force-recreate nodered >/dev/null 2>&1
  echo; echo "== ข้อมูลผู้ใช้จริง (ต้องไม่ถูกแตะ)"
  real_snapshot_check || { echo "สรุป: ข้อมูลผู้ใช้จริงเปลี่ยน → ไม่ผ่าน"; exit 1; }
}
source scripts/lib/real-snapshot.sh   # snapshot ผู้ใช้จริงก่อน-หลัง (ดู scripts/lib/real-snapshot.sh)
real_snapshot_take
trap cleanup EXIT

section "เตรียม: migration 003 รันซ้ำได้ + ค่าเริ่มต้น refill_alert_days = 7 (init = live)"
bash scripts/migrate.sh >/dev/null 2>&1; expect "migrate.sh รันซ้ำ (ครั้งที่ 1) exit" "$?" "0"
bash scripts/migrate.sh >/dev/null 2>&1; expect "migrate.sh รันซ้ำ (ครั้งที่ 2) exit" "$?" "0"
rootsql() { docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4' 2>/dev/null <<<"$1"; }
rootsql "DROP DATABASE IF EXISTS yt_schema_test; CREATE DATABASE yt_schema_test;" >/dev/null
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 yt_schema_test' < db/init/01_schema.sql 2>/dev/null
cols() { docker compose exec -T db sh -c "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -N -B -e \"SELECT ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, IFNULL(COLUMN_DEFAULT,'NULL') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$1' AND TABLE_NAME='$2' ORDER BY ORDINAL_POSITION\"" 2>/dev/null; }
LIVE_DB="$(docker compose exec -T db sh -c 'echo $MYSQL_DATABASE' | tr -d '\r')"
expect "ตาราง medications: คอลัมน์ init = live" "$(cols yt_schema_test medications | md5sum)" "$(cols "$LIVE_DB" medications | md5sum)"
expect "refill_alert_days ค่าเริ่มต้น = 7" "$(sql "SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='medications' AND COLUMN_NAME='refill_alert_days';")" "7"
rootsql "DROP DATABASE yt_schema_test;" >/dev/null

section "เตรียม: LINE ปลอม + recreate nodered (DEMO_MODE=true, cron จริงปิด, ตัวกรองผู้ใช้ทดสอบ)"
node scripts/fake-line.js $FAKE_PORT >"$TMP/fake.log" 2>&1 &
FAKE_PID=$!
sleep 1
fl_config "{\"profiles\":{\"$LA\":\"ผู้ป่วย ทดสอบ\"},\"quota\":200,\"usage\":0}"
NR_ENV=(LINE_CHANNEL_SECRET="$SECRET" LINE_CHANNEL_ACCESS_TOKEN="$TOKEN_LINE" LINE_API_BASE="http://host.docker.internal:$FAKE_PORT" LINE_OA_BASIC_ID="@014rktvr" LINE_PUSH_MONTHLY_CAP=200 LINE_PUSH_RESERVE=30 PUBLIC_BASE_URL="$PUBLIC" LINE_MASCOT_URL="" REMINDER_ONLY_EMAIL_SUFFIX="@example.test" LOW_STOCK_QTY_PRN=5)
restart_nodered "${NR_ENV[@]}" DEMO_MODE=true REMINDER_CRON=off || exit 1
ok "nodered พร้อม (cron จริงปิด)"

section "เกณฑ์ใกล้หมด: GET /api/medications → is_low (ยาประจำ ≤ refill_alert_days · ยาเมื่อมีอาการ ≤ 5)"
new_user A "$LA"; TA="$TOKEN_NEW"; UA="$UID_NEW"
mkmed "$TA" "TEST-7B-ใกล้หมด" 5;   M1="$MED_ID"      # พอใช้ 5 วัน ≤ 7 → ใกล้หมด
mkmed "$TA" "TEST-7B-ยังพอ" 20;    M2="$MED_ID"      # 20 วัน → ไม่ใกล้หมด
mkmed "$TA" "TEST-7B-ขอบ" 7;       M5="$MED_ID"      # ขอบ 7 วัน = ใกล้หมด
mkmed "$TA" "TEST-7B-PRNน้อย" 4 true;  M3="$MED_ID"  # ยาเมื่อมีอาการเหลือ 4 ≤ 5
mkmed "$TA" "TEST-7B-PRNพอ" 6 true;    M4="$MED_ID"  # เหลือ 6 > 5
req GET /api/medications "$TA"
for pair in "$M1:true" "$M2:false" "$M5:true" "$M3:true" "$M4:false"; do
  id="${pair%%:*}"; want="${pair##*:}"
  expect "ยา id $id: is_low" "$(jget "o.find(m=>m.id===$id).is_low")" "$want"
done
expect "ค่าเริ่มต้นของยาใหม่ refill_alert_days = 7" "$(jget "o.find(m=>m.id===$M1).refill_alert_days")" "7"

section "cron: ส่ง 1 ข้อความต่อผู้ป่วย รวมยาที่ใกล้หมด (kind=low_stock) และจองก่อนส่ง"
new_user B                  # ไม่ได้เชื่อม LINE
TB="$TOKEN_NEW"; UB="$UID_NEW"
mkmed "$TB" "TEST-7B-B-ใกล้หมด" 2; MB="$MED_ID"
fl_clear
R="$(run_stock)"
expect_match "สรุปรัน: users=1 sent=1" "$R" '"users":1,"sent":1,"failed":0'
expect "push ทั้งหมด 1 ข้อความ" "$(fl_count push)" "1"
expect "  ถึง LINE ของผู้ป่วย A" "$(fl_last push 'r.body.to')" "$LA"
ALT="$(fl_last push 'r.body.messages[0].altText')"
expect_match "  altText: 💊 ยาใกล้หมด 3 รายการ" "$ALT" '^💊 ยาใกล้หมด 3 รายการ'
TXT="$(fl_last push 'JSON.stringify(r.body.messages[0].contents)')"
for n in "TEST-7B-ใกล้หมด" "TEST-7B-ขอบ" "TEST-7B-PRNน้อย"; do expect_match "  มี $n" "$TXT" "$n"; done
for n in "TEST-7B-ยังพอ" "TEST-7B-PRNพอ" "TEST-7B-B-ใกล้หมด"; do
  if printf '%s' "$TXT" | grep -qF -- "$n"; then bad "  ไม่ควรมี $n"; else ok "  ไม่มี $n"; fi
done
expect_match "  ปุ่ม เติมยาในแอป → /medications" "$TXT" 'test-day7b.example.dev/medications'
expect_match "  แถว 'เหลือ 5 เม็ด · พอใช้ 5 วัน'" "$TXT" 'เหลือ 5 เม็ด · พอใช้ 5 วัน'
expect_match "  ยาเมื่อมีอาการแสดงแค่ 'เหลือ 4 เม็ด'" "$TXT" '"เหลือ 4 เม็ด"'
expect "จองแล้ว: ยาใกล้หมด M1" "$(alerted "$M1")" "yes"
expect "จองแล้ว: ขอบ M5" "$(alerted "$M5")" "yes"
expect "จองแล้ว: PRN น้อย M3" "$(alerted "$M3")" "yes"
expect "ไม่จอง: ยังพอ M2" "$(alerted "$M2")" "no"
expect "ไม่จอง: PRN พอ M4" "$(alerted "$M4")" "no"
expect "ผู้ป่วยที่ไม่ได้เชื่อม LINE ไม่ถูกจอง/ไม่ส่ง" "$(alerted "$MB")" "no"
expect "notification_logs kind=low_stock ของ A = 1" "$(low_logs "$UA")" "1"
expect "notification_logs ของ B = 0" "$(low_logs "$UB")" "0"

section "แจ้งครั้งเดียวต่อรอบ + ล้างเมื่อพ้นเกณฑ์ (เติมยา / undo) แล้วแจ้งรอบใหม่ได้"
fl_clear; R="$(run_stock)"
expect "รันซ้ำทันที → ไม่ส่งซ้ำ" "$(fl_count push)" "0"
req POST "/api/medications/$M1/refill" "$TA" '{"qty":1}'
expect "เติมยา 1 เม็ด (พอใช้ 6 วัน ยังใกล้หมด) → 200" "$STATUS" "200"
expect "  ยังคงจองไว้ (ไม่ล้างทั้งที่ยังใกล้หมด)" "$(alerted "$M1")" "yes"
fl_clear; R="$(run_stock)"; expect "  รัน → ไม่ส่งซ้ำ" "$(fl_count push)" "0"
req POST "/api/medications/$M1/refill" "$TA" '{"qty":20}'
expect "เติมยา 20 เม็ด (พ้นเกณฑ์) → 200" "$STATUS" "200"
expect "  ล้างการจอง" "$(alerted "$M1")" "no"
req GET /api/medications "$TA"; expect "  is_low = false" "$(jget "o.find(m=>m.id===$M1).is_low")" "false"
sql "UPDATE medications SET remaining_qty=3 WHERE id=$M1;" >/dev/null   # กินไปจนใกล้หมดอีกรอบ
fl_clear; R="$(run_stock)"
expect "รอบใหม่ (ใกล้หมดอีกครั้ง) → ส่ง 1 ข้อความ" "$(fl_count push)" "1"
expect_match "  มีเฉพาะยาที่เพิ่งใกล้หมด" "$(fl_last push 'JSON.stringify(r.body.messages[0].contents)')" 'TEST-7B-ใกล้หมด'
if fl_last push 'JSON.stringify(r.body.messages[0].contents)' | grep -qF "TEST-7B-ขอบ"; then bad "  ไม่ควรแจ้ง 'ขอบ' ซ้ำ"; else ok "  ไม่แจ้งยาที่แจ้งไปแล้วซ้ำ"; fi

# undo : ยา M2 ไม่ใกล้หมด (20) จองไว้เอง → กิน (19) → undo ต้องไม่ทำให้ค่าผิด ; กรณีพ้นเกณฑ์ด้วย undo : ตั้ง remaining=8 (พ้นเกณฑ์) + จองไว้ → กิน (7 = ใกล้หมด คงจอง) → undo (8 = พ้น ล้าง)
sql "UPDATE medications SET remaining_qty=8, refill_alerted_at=NOW() WHERE id=$M2;" >/dev/null
D2="$(sql "SELECT id FROM dose_logs WHERE medication_id=$M2 ORDER BY id LIMIT 1;")"
req POST "/api/doses/$D2/take" "$TA"; expect "กินยา M2 (เหลือ 7 วัน = ใกล้หมด) → 200" "$STATUS" "200"
expect "  ยังคงจอง (ใกล้หมดอยู่)" "$(alerted "$M2")" "yes"
req POST "/api/doses/$D2/undo" "$TA"; expect "ยกเลิกการกิน → 200" "$STATUS" "200"
expect "  กลับเป็น 8 วัน (พ้นเกณฑ์) → ล้างการจอง" "$(alerted "$M2")" "no"

section "โควตา LINE: เหลือต่ำกว่าส่วนสำรอง → ไม่ส่ง ไม่จอง (ลองใหม่ได้) ; ผ่อนแล้วส่ง"
sql "UPDATE medications SET refill_alerted_at=NULL WHERE id IN ($M1,$M5,$M3);" >/dev/null
fl_config "{\"quota\":200,\"usage\":175}"      # cap 200 − reserve 30 = หยุดที่ 170 ; ใช้ไป 175 แล้ว
fl_clear; R="$(run_stock)"
expect_match "สรุป: quota_skipped=1" "$R" '"quota_skipped":1'
expect "  ไม่ส่ง" "$(fl_count push)" "0"
expect "  ไม่จอง" "$(alerted "$M1")" "no"
fl_config "{\"quota\":200,\"usage\":0}"
fl_clear; R="$(run_stock)"
expect "โควตากลับมา → ส่ง" "$(fl_count push)" "1"
expect "  จองแล้ว" "$(alerted "$M1")" "yes"

section "รันซ้อนกัน 2 process → ได้ 1 ข้อความ (จองก่อนส่ง)"
sql "UPDATE medications SET refill_alerted_at=NULL WHERE id IN ($M1,$M5,$M3);" >/dev/null
fl_clear
run_stock >/dev/null &
P1=$!
run_stock >/dev/null &
P2=$!
wait $P1 $P2
expect "push รวม 2 process" "$(fl_count push)" "1"

section "push ล้มเหลว (LINE 500) → นับล้มเหลว ไม่คืนการจอง ไม่ส่งซ้ำรัว"
sql "UPDATE medications SET refill_alerted_at=NULL WHERE id IN ($M1,$M5,$M3);" >/dev/null
fl_config '{"mode":"500","failCount":99}'
fl_clear; R="$(run_stock)"
expect_match "สรุป: failed=1" "$R" '"failed":1'
expect "  ไม่คืนการจอง" "$(alerted "$M1")" "yes"
fl_config '{"mode":"ok"}'
fl_clear; R="$(run_stock)"; expect "  รันใหม่ไม่ส่งซ้ำ" "$(fl_count push)" "0"

section "โหมดเดโม: POST /api/demo/low-stock-now (DEMO_MODE=true)"
new_user D "$LB"; TD="$TOKEN_NEW"; UD="$UID_NEW"   # LINE คนละบัญชีกับ A (line_user_id ต้องไม่ซ้ำ)
fl_clear; req POST /api/demo/low-stock-now "$TD"
expect "ยังไม่มียาใกล้หมด → 409" "$STATUS" "409"
expect "  code NO_LOW_STOCK" "$(jget 'o.error')" "NO_LOW_STOCK"
mkmed "$TD" "TEST-7B-D-ยา1" 3; MD1="$MED_ID"
mkmed "$TD" "TEST-7B-D-ยา2" 40; MD2="$MED_ID"
fl_clear; req POST /api/demo/low-stock-now "$TD"
expect "มียาใกล้หมด → 200 ส่งทันที (ไม่สนเวลา)" "$STATUS" "200"
expect "  meds = 1 · resent = false" "$(jget 'o.meds+":"+o.resent')" "1:false"
expect_match "  message ภาษาไทย" "$(jget 'o.message')" '^ส่งแจ้งยาใกล้หมด 1 รายการเข้า LINE แล้วค่ะ$'
expect "  push 1 ข้อความ" "$(fl_count push)" "1"
expect "  จองแล้ว" "$(alerted "$MD1")" "yes"
fl_clear; req POST /api/demo/low-stock-now "$TD"
expect "กดซ้ำ → 409" "$STATUS" "409"
expect "  code ALREADY_NOTIFIED" "$(jget 'o.error')" "ALREADY_NOTIFIED"
expect_match "  แจ้งโควตาสำรองที่เหลือ" "$(jget 'o.quota_left+":"+o.reserve')" '^[0-9]+:30$'
expect "  ไม่ส่ง" "$(fl_count push)" "0"
fl_clear; req POST /api/demo/low-stock-now "$TD" '{"force":true}'
expect "force:true → 200 ส่งซ้ำ" "$STATUS" "200"
expect "  resent = true" "$(jget 'o.resent')" "true"
expect "  push 1 ข้อความ" "$(fl_count push)" "1"
expect_match "  log มี low_stock_force (ไม่มีข้อมูลส่วนตัว)" "$(docker compose logs nodered 2>&1 | grep -c 'low_stock_force')" '^[1-9]'
new_user E; TE="$TOKEN_NEW"; mkmed "$TE" "TEST-7B-E" 2
req POST /api/demo/low-stock-now "$TE"; expect "ยังไม่เชื่อม LINE → 409" "$STATUS" "409"
expect "  code LINE_NOT_LINKED" "$(jget 'o.error')" "LINE_NOT_LINKED"
# (429 LINE_QUOTA ของเดโมครอบคลุมใน stock-service.test.js — quotaStatus แคชยอดจาก LINE 5 นาที จึงปรับ usage กลางเทสไม่ได้)
req POST /api/demo/low-stock-now ""; expect "ไม่มี JWT → 401" "$STATUS" "401"

section "ไม่แตะผู้ใช้จริง + log ไม่มีความลับ"
LOGS="$(docker compose logs nodered 2>&1)"
for needle in "$SECRET" "$TOKEN_LINE" "$LA" "$LB"; do
  if printf '%s' "$LOGS" | grep -qF -- "$needle"; then bad "log มี '${needle:0:12}…'"; else ok "log ไม่มี '${needle:0:12}…'"; fi
done
if printf '%s' "$LOGS" | grep -qF -- "TEST-7B-"; then bad "log มีชื่อยา"; else ok "log ไม่มีชื่อยา"; fi

section "DEMO_MODE=false: low-stock-now ตอบ 404 เหมือนไม่มี endpoint"
restart_nodered "${NR_ENV[@]}" DEMO_MODE=false REMINDER_CRON=off || exit 1
fl_clear; req POST /api/demo/low-stock-now "$TD"; expect "POST /api/demo/low-stock-now → 404" "$STATUS" "404"
expect "  ไม่มี push" "$(fl_count push)" "0"

echo
echo "สรุป: ผ่าน $PASS · ไม่ผ่าน $FAIL"
[ "$FAIL" -eq 0 ]
