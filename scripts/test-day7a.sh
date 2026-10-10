#!/usr/bin/env bash
# ทดสอบ Day 7A: แจ้งญาติเมื่อลืมกินยา (escalationService), ปุ่ม ✓ ยืนยัน / รับทราบ ของญาติ, ปิดเรื่อง, โควตา escalation, เตือนซ้ำผู้ป่วย (REMINDER_FOLLOWUP_MIN),
#              ปิดรอบค้างเป็น missed (cron 03:00), "วันนี้" ของผู้ดูแล, POST /api/demo/escalate-now, migration 002 + schema init
# ใช้ LINE ปลอม (scripts/fake-line.js) ไม่ส่งข้อความจริง ; user ทดสอบสุ่มใหม่ทุกครั้งแล้วลบทิ้งตอนจบ ; เคารพ REMINDER_ONLY_EMAIL_SUFFIX + real-snapshot
#   bash scripts/test-day7a.sh
# ข้อควรระวัง: recreate nodered 2 ครั้ง (ปิด cron จริงชั่วคราว) — อย่ารันใกล้มื้อยา เพราะผู้ใช้จริงจะไม่ได้รับเตือน/แจ้งญาติระหว่างนั้น

set -u
cd "$(dirname "$0")/.."
BASE="${BASE:-http://localhost:1880}"
WEB="${WEB:-http://localhost:8080}"
FAKE_PORT=8797
FAKE="http://localhost:$FAKE_PORT"
SECRET="test-channel-secret-day7a"
TOKEN_LINE="test-access-token-day7a"
PUBLIC="https://test-day7a.example.dev"
TMP="$(mktemp -d)"
RUN="$RANDOM$RANDOM"
LA="U7A${RUN}aaaaaaaaaaaaaaaaaaaaaaaaaa"; LA="${LA:0:33}"
LB="U7B${RUN}bbbbbbbbbbbbbbbbbbbbbbbbbb"; LB="${LB:0:33}"
LX="U7X${RUN}xxxxxxxxxxxxxxxxxxxxxxxxxx"; LX="${LX:0:33}"

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
wait_n() { local kind="$1" n="$2" i; for i in $(seq 24); do [ "$(fl_count "$kind")" -ge "$n" ] && return 0; sleep 0.5; done; return 1; }

# ---------- webhook ----------
wh() { # wh BODY [URLBASE] → STATUS
  local body="$1" url="${2:-$BASE}" sig
  printf '%s' "$body" > "$TMP/body"
  sig="$(node -e 'const c=require("crypto"),fs=require("fs");process.stdout.write(c.createHmac("sha256",process.argv[1]).update(fs.readFileSync(process.argv[2])).digest("base64"))' "$SECRET" "$TMP/body")"
  STATUS="$(curl -s -o "$TMP/resp" -w '%{http_code}' -X POST "$url/line/webhook" -H 'Content-Type: application/json' -H "x-line-signature: $sig" --data-binary "@$TMP/body")"
}
evid() { node -e "console.log(require('crypto').randomUUID())"; }
ev_postback() { local id; id="$(evid)"; printf '{"destination":"U0","events":[{"type":"postback","timestamp":1700000000000,"source":{"type":"user","userId":"%s"},"webhookEventId":"EV%s","replyToken":"rt%s","postback":{"data":"%s"}}]}' "$1" "$id" "$id" "$2"; }
ev_text() { local id; id="$(evid)"; printf '{"destination":"U0","events":[{"type":"message","source":{"type":"user","userId":"%s"},"webhookEventId":"EV%s","replyToken":"rt%s","message":{"id":"m1","type":"text","text":"%s"}}]}' "$1" "$id" "$id" "$2"; }
# press LINE_ID DATA → ส่ง postback; ผลอยู่ใน REPLY (ล้างรายการก่อน; รอ reply สูงสุด 5 วินาทีเมื่อ $3 = wait)
press() { fl_clear; wh "$(ev_postback "$1" "$2")"; REPLY=""; if [ "${3:-}" = "wait" ]; then wait_n reply 1 && REPLY="$(fl_last reply 'r.body.messages.map(m=>m.text||m.altText).join(" ").replace(/\s+/g," ")')"; else sleep 2; fi; }

# ---------- reminderService ใน container (process แยก = เหมือน cron ที่รันซ้อนกัน) ----------
RUNJS="const db=require('/data/lib/db'),{createClient}=require('/data/lib/line-client'),rs=require('/data/lib/reminder-service');rs.run(db,createClient(),process.env).then(r=>{console.log(JSON.stringify(r));process.exit(0)}).catch(e=>{console.log('ERR '+e.message);process.exit(1)})"
run_reminder() { docker compose exec -T nodered node -e "$RUNJS" 2>/dev/null | tail -1; }

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
new_user() { # ตั้ง TOKEN_NEW และ UID_NEW
  local e="test-day7a-$RANDOM$RANDOM@example.test" pw
  pw="$(node -e 'console.log(require("crypto").randomBytes(9).toString("hex"))')"
  req POST /api/auth/register "" "{\"email\":\"$e\",\"password\":\"$pw\",\"display_name\":\"ผู้ทดสอบ day7a $1\"}"
  TEST_EMAILS+=("$e")
  TOKEN_NEW="$(jget 'o.token')"
  UID_NEW="$(sql "SELECT id FROM users WHERE email='$e';")"
  sql "UPDATE user_slot_times SET slot_time='23:59:00' WHERE user_id=$UID_NEW AND slot='bedtime';" >/dev/null   # ให้ POST ยาสร้างรอบของวันนี้เสมอ
}
mkmed() { # mkmed TOKEN NAME [as_needed] → ตั้ง MED_ID
  local an="${3:-false}" slots='["bedtime"]'; [ "$an" = "true" ] && slots='[]'
  req POST /api/medications "$1" "{\"name\":\"$2\",\"strength\":\"500 mg\",\"dose_per_time\":1,\"unit\":\"tablet\",\"meal_relation\":\"after\",\"as_needed\":$an,\"slots\":$slots,\"total_qty\":30}"
  MED_ID="$(jget 'o.id')"
}
due() { sql "UPDATE dose_logs SET scheduled_at = NOW() - INTERVAL $2 MINUTE, status='pending', reminded_at=NULL, taken_at=NULL, source=NULL WHERE user_id=$1;" >/dev/null; }
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

# ---------- เพิ่มเติมสำหรับ 7A ----------
mkcg() { # mkcg TOKEN NAME MIN LINEID(ว่างได้) → CG_ID
  req POST /api/caregivers "$1" "{\"name\":\"$2\",\"escalate_after_min\":$3}"; CG_ID="$(jget 'o.id')"
  [ -n "${4:-}" ] && sql "UPDATE caregivers SET line_user_id='$4', line_display_name='$2' WHERE id=$CG_ID;" >/dev/null
}
dose_of() { sql "SELECT id FROM dose_logs WHERE medication_id=$1 ORDER BY id LIMIT 1;"; }
ESCJS="const db=require('/data/lib/db'),{createClient}=require('/data/lib/line-client'),es=require('/data/lib/escalation-service');es.run(db,createClient(),process.env).then(r=>{console.log(JSON.stringify(r));process.exit(0)}).catch(e=>{console.log('ERR '+e.message);process.exit(1)})"
run_esc() { docker compose exec -T nodered node -e "$ESCJS" 2>/dev/null | tail -1; }
fujs() { echo "const db=require('/data/lib/db'),{createClient}=require('/data/lib/line-client'),rs=require('/data/lib/reminder-service');rs.runFollowup(db,createClient(),{...process.env,REMINDER_FOLLOWUP_MIN:'$1'}).then(r=>{console.log(JSON.stringify(r));process.exit(0)}).catch(e=>{console.log('ERR '+e.message);process.exit(1)})"; }
run_followup() { docker compose exec -T nodered node -e "$(fujs "$1")" 2>/dev/null | tail -1; }
MISSJS="const db=require('/data/lib/db'),ds=require('/data/lib/dose-service');ds.closeStaleDoses(db,process.env).then(r=>{console.log(JSON.stringify(r));process.exit(0)}).catch(e=>{console.log('ERR '+e.message);process.exit(1)})"
run_miss() { docker compose exec -T nodered node -e "$MISSJS" 2>/dev/null | tail -1; }
ago() { sql "UPDATE dose_logs SET scheduled_at = NOW() - INTERVAL $2 MINUTE WHERE user_id=$1;" >/dev/null; }   # ขยับเวลาโดยไม่รีเซ็ตสถานะ
fl_push_n() { fl "$FAKE/_requests" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).filter(r=>r.path==="/v2/bot/message/push"&&r.body.to===process.argv[1]);console.log(a.length)})' "$1"; }
fl_alts() { fl "$FAKE/_requests" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).filter(r=>r.path==="/v2/bot/message/push"&&r.body.to===process.argv[1]);console.log(a.map(r=>r.body.messages[0].altText).join(" | "))})' "$1"; }

LC1="U7C1${RUN}ccccccccccccccccccccccccc"; LC1="${LC1:0:33}"
LC2="U7C2${RUN}dddddddddddddddddddddddd"; LC2="${LC2:0:33}"
LC3="U7C3${RUN}eeeeeeeeeeeeeeeeeeeeeeeee"; LC3="${LC3:0:33}"
LP="U7P0${RUN}ffffffffffffffffffffffff"; LP="${LP:0:33}"
LG="U7G0${RUN}gggggggggggggggggggggggg"; LG="${LG:0:33}"
LH="U7H0${RUN}hhhhhhhhhhhhhhhhhhhhhhhh"; LH="${LH:0:33}"
LI="U7I0${RUN}iiiiiiiiiiiiiiiiiiiiiiii"; LI="${LI:0:33}"
LL="U7L0${RUN}jjjjjjjjjjjjjjjjjjjjjjjj"; LL="${LL:0:33}"

section "เตรียม: migration ซ้ำได้ + schema init = live"
bash scripts/migrate.sh >/dev/null 2>&1; expect "migrate.sh รันซ้ำ (ครั้งที่ 1) exit" "$?" "0"
bash scripts/migrate.sh >/dev/null 2>&1; expect "migrate.sh รันซ้ำ (ครั้งที่ 2) exit" "$?" "0"
rootsql() { docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4' 2>/dev/null <<<"$1"; }
rootsql "DROP DATABASE IF EXISTS yt_schema_test; CREATE DATABASE yt_schema_test;" >/dev/null
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 yt_schema_test' < db/init/01_schema.sql 2>/dev/null
cols() { docker compose exec -T db sh -c "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -N -B -e \"SELECT ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, IFNULL(COLUMN_DEFAULT,'NULL') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$1' AND TABLE_NAME='$2' ORDER BY ORDINAL_POSITION\"" 2>/dev/null; }
LIVE_DB="$(docker compose exec -T db sh -c 'echo $MYSQL_DATABASE' | tr -d '\r')"
for t in dose_logs notification_logs dose_escalations; do
  expect "ตาราง $t: คอลัมน์ init = live" "$(cols yt_schema_test $t | md5sum)" "$(cols "$LIVE_DB" $t | md5sum)"
done
rootsql "DROP DATABASE yt_schema_test;" >/dev/null
expect "dose_logs.source มี caregiver" "$(sql "SELECT COLUMN_TYPE LIKE '%caregiver%' FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='dose_logs' AND COLUMN_NAME='source';")" "1"
expect "dose_escalations: UNIQUE(dose_id, caregiver_id)" "$(sql "SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='dose_escalations' AND INDEX_NAME='uq_escalation_dose_caregiver';")" "2"

section "เตรียม: LINE ปลอม + recreate nodered (DEMO_MODE=true, cron จริงปิด, ตัวกรองผู้ใช้ทดสอบ)"
node scripts/fake-line.js $FAKE_PORT >"$TMP/fake.log" 2>&1 &
FAKE_PID=$!
sleep 1
fl_config "{\"profiles\":{\"$LA\":\"ผู้ป่วย ทดสอบ\",\"$LC1\":\"ลูกสาว ทดสอบ\",\"$LC2\":\"ลูกชาย ทดสอบ\"},\"quota\":200,\"usage\":0}"
NR_ENV=(LINE_CHANNEL_SECRET="$SECRET" LINE_CHANNEL_ACCESS_TOKEN="$TOKEN_LINE" LINE_API_BASE="http://host.docker.internal:$FAKE_PORT" LINE_OA_BASIC_ID="@014rktvr" LINE_PUSH_MONTHLY_CAP=200 LINE_PUSH_RESERVE=30 PUBLIC_BASE_URL="$PUBLIC" LINE_MASCOT_URL="" REMINDER_ONLY_EMAIL_SUFFIX="@example.test")
restart_nodered "${NR_ENV[@]}" DEMO_MODE=true REMINDER_CRON=off || exit 1
ok "nodered พร้อม (cron จริงปิด)"

section "แจ้งญาติ: ผู้ดูแล 2 คนตั้งเวลาไม่เท่ากัน → ได้คนละเวลา"
new_user A; TA="$TOKEN_NEW"; UA="$UID_NEW"
mkcg "$TA" "ลูกสาว" 60 "$LC1"; CG1="$CG_ID"
mkcg "$TA" "ลูกชาย" 120 "$LC2"; CG2="$CG_ID"
mkmed "$TA" "TEST-7A-ยา1"; MA1="$MED_ID"; DA1="$(dose_of "$MA1")"
due "$UA" 70; fl_clear
R="$(run_esc)"
expect_match "เลยมา 70 นาที: ผู้ดูแล 60 นาทีได้ ผู้ดูแล 120 นาทียัง" "$R" '"groups":1,"sent":1,"failed":0'
expect "push ทั้งหมด" "$(fl_count push)" "1"
expect "  ถึง LINE ของผู้ดูแลคนแรก" "$(fl_last push 'r.body.to')" "$LC1"
expect_match "  altText ตามสเปก" "$(fl_last push 'r.body.messages[0].altText')" '^⚠️ คุณผู้ทดสอบยังไม่ได้กินยามื้อก่อนนอน · เลยมา 1 ชม. 1[0-2] นาที$'
expect "  ปุ่มหลัก ✓ ยืนยันว่ากินแล้ว → a=cg_take&d=<dose>" "$(fl_last push 'r.body.messages[0].contents.footer.contents[0].action.label+"|"+r.body.messages[0].contents.footer.contents[0].action.data')" "✓ ยืนยันว่ากินแล้ว|a=cg_take&d=$DA1"
ESC1="$(sql "SELECT id FROM dose_escalations WHERE dose_id=$DA1 AND caregiver_id=$CG1;")"
expect "  ปุ่มรอง รับทราบ → a=cg_ack&e=<escalation id>" "$(fl_last push 'r.body.messages[0].contents.footer.contents[1].action.label+"|"+r.body.messages[0].contents.footer.contents[1].action.data')" "รับทราบ|a=cg_ack&e=$ESC1"
expect "  หัวพื้นเหลือง" "$(fl_last push 'r.body.messages[0].contents.header.backgroundColor')" "#fef3c7"
expect_match "  รูปมาสคอตท่า bell" "$(fl_last push 'JSON.stringify(r.body.messages[0].contents.header)')" 'mascot-bell\.png'
expect "  จอง dose_escalations แล้ว (ผู้ดูแลคนแรกเท่านั้น)" "$(sql "SELECT GROUP_CONCAT(caregiver_id) FROM dose_escalations WHERE dose_id=$DA1;")" "$CG1"
expect "  ตั้ง escalated_at ของ dose" "$(sql "SELECT escalated_at IS NOT NULL FROM dose_logs WHERE id=$DA1;")" "1"
R="$(run_esc)"; expect_match "รันซ้ำ → ไม่แจ้งซ้ำ" "$R" '"groups":0'
ago "$UA" 125; fl_clear
R="$(run_esc)"
expect_match "เลยมา 125 นาที → ผู้ดูแลคนที่สอง (120) ได้ ; คนแรกไม่ถูกแจ้งซ้ำ" "$R" '"groups":1,"sent":1'
expect "  ถึง LINE ผู้ดูแลคนที่สอง" "$(fl_last push 'r.body.to')" "$LC2"
expect "  dose_escalations 2 แถว" "$(sql "SELECT COUNT(*) FROM dose_escalations WHERE dose_id=$DA1;")" "2"
R="$(run_esc)"; expect_match "  รันซ้ำอีก → ไม่มีอะไรให้ส่ง" "$R" '"groups":0'
expect "notification_logs: escalation/caregiver สำเร็จ 2 แถว" "$(sql "SELECT COUNT(*) FROM notification_logs WHERE user_id=$UA AND channel='line_push' AND kind='escalation' AND recipient='caregiver' AND success=1;")" "2"

section "แจ้งญาติ: รัน 2 process พร้อมกัน → ได้ 1 ข้อความ"
new_user B; TB="$TOKEN_NEW"; UB="$UID_NEW"
mkcg "$TB" "ญาติ" 60 "$LC3"; CGB="$CG_ID"
mkmed "$TB" "TEST-7A-ยาB"; DB1="$(dose_of "$MED_ID")"
due "$UB" 70; fl_clear
( run_esc >"$TMP/e1" ) & P1=$!
( run_esc >"$TMP/e2" ) & P2=$!
wait "$P1" "$P2"
expect "จำนวน push" "$(fl_count push)" "1"
expect "  แถว dose_escalations เดียว" "$(sql "SELECT COUNT(*) FROM dose_escalations WHERE dose_id=$DB1;")" "1"
expect "  รวม sent จากสอง process" "$(node -e 'const a=[1,2].map(i=>JSON.parse(require("fs").readFileSync(process.argv[1]+"/e"+i,"utf8").trim()));console.log(a[0].sent+a[1].sent)' "$TMP")" "1"

section "แจ้งญาติ: ไม่ส่งย้อนหลังเกิน escalate_after_min + 60 นาที"
sql "DELETE FROM dose_escalations WHERE user_id=$UB;" >/dev/null
ago "$UB" 121; fl_clear; R="$(run_esc)"
expect "เลยมา 121 นาที (> 60+60) → ไม่ส่ง" "$(fl_count push)" "0"
ago "$UB" 119; R="$(run_esc)"
expect "เลยมา 119 นาที → ส่ง" "$(fl_count push)" "1"
sql "DELETE FROM dose_escalations WHERE user_id=$UB;" >/dev/null
ago "$UB" 9; fl_clear; R="$(run_esc)"
expect "เลยมา 9 นาที (ยังไม่ถึง 60) → ไม่ส่ง" "$(fl_count push)" "0"

section "แจ้งญาติ: ยาหยุดแล้ว / PRN / ผู้ป่วยกินแล้ว / ผู้ดูแลไม่เชื่อม LINE / ผู้ดูแลถูกปิด → ไม่แจ้ง"
new_user D; TD="$TOKEN_NEW"; UD="$UID_NEW"
mkcg "$TD" "ญาติ-ใช้งาน" 60 "$LC1"; CGD="$CG_ID"
mkcg "$TD" "ญาติ-ไม่ได้เชื่อม" 60 ""
mkcg "$TD" "ญาติ-ปิดแล้ว" 60 "$LC2"; sql "UPDATE caregivers SET is_active=0 WHERE id=$CG_ID;" >/dev/null
mkmed "$TD" "TEST-7A-ใช้งาน"; MD1="$MED_ID"; DD1="$(dose_of "$MD1")"
mkmed "$TD" "TEST-7A-จะหยุด"; MD2="$MED_ID"
mkmed "$TD" "TEST-7A-กินแล้ว"; MD3="$MED_ID"
mkmed "$TD" "TEST-7A-ตามอาการ" true; MD4="$MED_ID"
req PATCH "/api/medications/$MD2/stop" "$TD"
due "$UD" 70
sql "INSERT INTO dose_logs (medication_id, user_id, slot, scheduled_at, status) SELECT $MD2, $UD, 'bedtime', scheduled_at, 'pending' FROM dose_logs WHERE medication_id=$MD1 LIMIT 1;" >/dev/null
sql "INSERT INTO dose_logs (medication_id, user_id, slot, scheduled_at, status) SELECT $MD4, $UD, 'bedtime', scheduled_at, 'pending' FROM dose_logs WHERE medication_id=$MD1 LIMIT 1;" >/dev/null
sql "UPDATE dose_logs SET status='taken', taken_at=NOW(), source='app' WHERE medication_id=$MD3;" >/dev/null
fl_clear; R="$(run_esc)"
expect "มีแต่ยาที่ใช้งานอยู่เท่านั้นที่ถูกแจ้ง : 1 ข้อความ ถึงผู้ดูแลที่ใช้งาน+เชื่อม LINE" "$(fl_count push)" "1"
expect "  ถึง LINE ผู้ดูแลที่ใช้งาน" "$(fl_last push 'r.body.to')" "$LC1"
expect "  postback มี dose เดียว (ยาที่ใช้งาน)" "$(fl_last push 'r.body.messages[0].contents.footer.contents[0].action.data')" "a=cg_take&d=$DD1"
expect "  dose_escalations เฉพาะรายการนั้น (ยาหยุด/PRN/กินแล้ว ไม่ถูกจอง)" "$(sql "SELECT COUNT(*) FROM dose_escalations WHERE user_id=$UD;")" "1"

section "แจ้งญาติ: dose ที่ missed ก็แจ้งได้ ; ผู้ป่วยกินก่อนครบเวลาแล้วไม่แจ้ง"
new_user M; TM="$TOKEN_NEW"; UM="$UID_NEW"
mkcg "$TM" "ญาติ" 60 "$LC1"
mkmed "$TM" "TEST-7A-missed"; DM1="$(dose_of "$MED_ID")"
due "$UM" 70; sql "UPDATE dose_logs SET status='missed' WHERE id=$DM1;" >/dev/null
fl_clear; R="$(run_esc)"; expect "status = missed ก็ถูกแจ้ง" "$(fl_count push)" "1"
sql "DELETE FROM dose_escalations WHERE user_id=$UM;" >/dev/null
due "$UM" 10; fl_clear; R="$(run_esc)"
req POST "/api/doses/$DM1/take" "$TM"; expect "ผู้ป่วยกินก่อนถึงเวลาแจ้ง → 200" "$STATUS" "200"
ago "$UM" 70; R="$(run_esc)"
expect "  ถึงเวลาแล้วแต่กินไปแล้ว → ไม่แจ้ง" "$(fl_count push)" "0"

section "ญาติกด ✓ ยืนยันว่ากินแล้ว (สิทธิ์ถูก/ผิด, กินไปแล้ว) + ปิดเรื่องให้ญาติคนอื่น"
new_user E; TE="$TOKEN_NEW"; UE="$UID_NEW"
mkcg "$TE" "ญาติ1" 60 "$LC1"; CGE1="$CG_ID"
mkcg "$TE" "ญาติ2" 60 "$LC2"; CGE2="$CG_ID"
mkmed "$TE" "TEST-7A-ยาE"; ME1="$MED_ID"; DE1="$(dose_of "$ME1")"
due "$UE" 70; fl_clear; R="$(run_esc)"
expect "แจ้งผู้ดูแลทั้งสองคน (2 ข้อความ)" "$(fl_count push)" "2"
fl_clear
press "$LX" "a=cg_take&d=$DE1" wait
expect_match "LINE ที่ไม่ใช่ผู้ดูแลกดยืนยัน → แจ้งว่าไม่มีสิทธิ์ (ไม่เงียบ)" "$REPLY" 'ไม่พบสิทธิ์ผู้ดูแล'
expect "  dose ยัง pending" "$(sql "SELECT status FROM dose_logs WHERE id=$DE1;")" "pending"
press "$LC3" "a=cg_take&d=$DE1" wait
expect_match "ผู้ดูแลของผู้ป่วยคนอื่นกด → ไม่มีสิทธิ์" "$REPLY" 'ไม่พบสิทธิ์ผู้ดูแล'
expect "  dose ยัง pending" "$(sql "SELECT status FROM dose_logs WHERE id=$DE1;")" "pending"
expect "  remaining_qty ยัง 30" "$(sql "SELECT remaining_qty FROM medications WHERE id=$ME1;")" "30.00"
press "$LC1" "a=cg_take&d=$DE1" wait
expect_match "ผู้ดูแลที่ถูกต้องกดยืนยัน → บันทึกแล้ว" "$REPLY" 'บันทึกแล้วค่ะ.*ยืนยันว่าคุณผู้ทดสอบ day7a Eกินยามื้อก่อนนอนแล้ว'
expect "  dose = taken, source = caregiver" "$(sql "SELECT CONCAT(status,':',source) FROM dose_logs WHERE id=$DE1;")" "taken:caregiver"
expect "  หักยา 1 เม็ด" "$(sql "SELECT remaining_qty FROM medications WHERE id=$ME1;")" "29.00"
expect "  บันทึก confirmed_at ของผู้ดูแลที่กด" "$(sql "SELECT confirmed_at IS NOT NULL FROM dose_escalations WHERE dose_id=$DE1 AND caregiver_id=$CGE1;")" "1"
wait_n push 1; sleep 1
expect "  ปิดเรื่อง: ส่งให้ผู้ดูแลอีกคนเท่านั้น" "$(fl_last push 'r.body.to')" "$LC2"
expect "  ไม่ส่งให้คนที่กดยืนยันเอง" "$(fl_push_n "$LC1")" "0"
expect_match "  altText ปิดเรื่อง" "$(fl_last push 'r.body.messages[0].altText')" '^💚 คุณผู้ทดสอบกินยามื้อก่อนนอนแล้วค่ะ$'
fl_clear
press "$LC2" "a=cg_take&d=$DE1" wait
expect_match "ผู้ดูแลอีกคนกดทีหลัง → บอกว่ามีญาติยืนยันไว้แล้ว" "$REPLY" 'มีญาติยืนยันไว้แล้ว'
expect "  ไม่หักยาซ้ำ" "$(sql "SELECT remaining_qty FROM medications WHERE id=$ME1;")" "29.00"
req GET /api/doses/today "$TE"
expect "GET /api/doses/today แสดง source = caregiver" "$(jget 'o.slots[0].doses[0].source')" "caregiver"
req GET /api/caregivers "$TE"
expect "ประวัติ: ผู้ดูแลที่ยืนยัน = confirmed" "$(jget "o.caregivers.find(c=>c.id===$CGE1).recent_escalations[0].outcome")" "confirmed"
expect "  ผู้ดูแลที่กดทีหลัง = acknowledged" "$(jget "o.caregivers.find(c=>c.id===$CGE2).recent_escalations[0].outcome")" "acknowledged"
req POST "/api/doses/$DE1/undo" "$TE"; expect "ผู้ป่วยกด undo ภายใน 10 นาที → 200" "$STATUS" "200"
expect "  เคยแจ้งญาติแล้ว → กลับเป็น missed (กันแจ้งซ้ำ)" "$(sql "SELECT status FROM dose_logs WHERE id=$DE1;")" "missed"
fl_clear; R="$(run_esc)"; expect "  cron ไม่แจ้งซ้ำ" "$(fl_count push)" "0"
req POST "/api/doses/$DE1/take" "$TE"; expect "กินย้อนหลังหลัง missed ผ่านเว็บ → 200" "$STATUS" "200"
expect "  เป็น taken" "$(sql "SELECT status FROM dose_logs WHERE id=$DE1;")" "taken"

section "ญาติกด รับทราบ + ผู้ป่วยกินทีหลังที่ยืนยันไม่ได้ + ปิดเรื่องครั้งเดียว"
new_user F; TF="$TOKEN_NEW"; UF="$UID_NEW"
mkcg "$TF" "ญาติ1" 60 "$LC1"; CGF1="$CG_ID"
mkcg "$TF" "ญาติ2" 60 "$LC2"; CGF2="$CG_ID"
mkmed "$TF" "TEST-7A-ยาF"; MF1="$MED_ID"; DF1="$(dose_of "$MF1")"
due "$UF" 70; fl_clear; R="$(run_esc)"
EF1="$(sql "SELECT id FROM dose_escalations WHERE dose_id=$DF1 AND caregiver_id=$CGF1;")"
EF2="$(sql "SELECT id FROM dose_escalations WHERE dose_id=$DF1 AND caregiver_id=$CGF2;")"
press "$LC1" "a=cg_ack&e=$EF1" wait
expect_match "กด รับทราบ → reply ขอบคุณ" "$REPLY" 'รับทราบแล้วค่ะ'
expect "  บันทึก acknowledged_at" "$(sql "SELECT acknowledged_at IS NOT NULL FROM dose_escalations WHERE id=$EF1;")" "1"
expect "  ไม่ได้เปลี่ยนสถานะยา" "$(sql "SELECT status FROM dose_logs WHERE id=$DF1;")" "pending"
press "$LX" "a=cg_ack&e=$EF2" wait
expect_match "LINE อื่นกดรับทราบของคนอื่น → ไม่พบรายการ" "$REPLY" 'ไม่พบรายการแจ้งเตือน'
expect "  ไม่บันทึกให้" "$(sql "SELECT acknowledged_at IS NULL FROM dose_escalations WHERE id=$EF2;")" "1"
fl_clear
req POST "/api/doses/$DF1/take" "$TF"; expect "ผู้ป่วยกินทีหลัง (ผ่านเว็บ) → 200" "$STATUS" "200"
wait_n push 2; sleep 1
expect "ปิดเรื่อง: ส่งให้ผู้ดูแลที่ถูกแจ้งทั้งสองคน ๆ ละ 1" "$(fl_push_n "$LC1")$(fl_push_n "$LC2")" "11"
req POST "/api/doses/$DF1/undo" "$TF"; req POST "/api/doses/$DF1/take" "$TF"; sleep 2
expect "  กินซ้ำหลัง undo ไม่ส่งปิดเรื่องอีก" "$(fl_count push)" "2"
fl_clear
press "$LC2" "a=cg_take&d=$DF1" wait
expect_match "ญาติกดยืนยันหลังผู้ป่วยกินไปแล้ว → บอกว่าผู้ป่วยกินไปก่อนหน้านี้" "$REPLY" 'ผู้ป่วยกินไปก่อนหน้านี้แล้ว'
expect "  ไม่หักยาซ้ำ (เหลือ 29 หลังกินครั้งแรก)" "$(sql "SELECT remaining_qty FROM medications WHERE id=$MF1;")" "29.00"
expect "  บันทึก acknowledged_at ของญาติคนนั้น" "$(sql "SELECT acknowledged_at IS NOT NULL FROM dose_escalations WHERE id=$EF2;")" "1"

section "ปิดเรื่องเมื่อผู้ป่วยกินผ่าน LINE (postback)"
new_user G; TG="$TOKEN_NEW"; UG="$UID_NEW"
sql "UPDATE users SET line_user_id='$LG' WHERE id=$UG;" >/dev/null
mkcg "$TG" "ญาติ" 60 "$LC1"
mkmed "$TG" "TEST-7A-ยาG"; DG1="$(dose_of "$MED_ID")"
due "$UG" 70; fl_clear; R="$(run_esc)"; expect "แจ้งญาติ 1 ข้อความ" "$(fl_push_n "$LC1")" "1"
press "$LG" "a=take&d=$DG1" wait
expect "ผู้ป่วยกดกินแล้วใน LINE → taken ผ่าน source line" "$(sql "SELECT CONCAT(status,':',source) FROM dose_logs WHERE id=$DG1;")" "taken:line"
wait_n push 1; sleep 1
expect "  ญาติได้ข้อความปิดเรื่อง" "$(fl_push_n "$LC1")" "1"
expect_match "  altText ปิดเรื่อง" "$(fl_alts "$LC1")" '^💚 คุณผู้ทดสอบกินยามื้อก่อนนอนแล้วค่ะ$'

section "โควตา: เตือนปกติหยุดที่ cap-reserve แต่แจ้งญาติยังส่งได้ถึง cap"
new_user H; TH="$TOKEN_NEW"; UH="$UID_NEW"
sql "UPDATE users SET line_user_id='$LH' WHERE id=$UH;" >/dev/null
mkcg "$TH" "ญาติ" 60 "$LC1"
mkmed "$TH" "TEST-7A-ยาH"; DH1="$(dose_of "$MED_ID")"
fl_config '{"quota":200,"usage":170}'
due "$UH" 5; fl_clear; R="$(run_reminder)"
expect_match "ใช้ไป 170: เตือนปกติหยุด" "$R" '"quota_skipped":1'
ago "$UH" 70; sql "UPDATE dose_logs SET reminded_at=NULL WHERE user_id=$UH;" >/dev/null; fl_clear
R="$(run_esc)"
expect_match "  แต่แจ้งญาติยังส่งได้ (เหลือ 30)" "$R" '"sent":1'
expect "  push ถึงญาติ" "$(fl_last push 'r.body.to')" "$LC1"
sql "DELETE FROM dose_escalations WHERE user_id=$UH;" >/dev/null
fl_config '{"quota":200,"usage":200}'; fl_clear
R="$(run_esc)"
expect_match "ใช้ไป 200 (เต็ม): แจ้งญาติ log และไม่ส่ง" "$R" '"quota_skipped":1'
expect "  ไม่มี push" "$(fl_count push)" "0"
expect "  ไม่จอง (ลองใหม่ได้เมื่อมีโควตา)" "$(sql "SELECT COUNT(*) FROM dose_escalations WHERE user_id=$UH;")" "0"
expect_match "  log มี escalation_quota_skipped (ไม่มีข้อมูลส่วนตัว)" "$(docker compose exec -T nodered node -e "$ESCJS" 2>&1 | grep -c '^escalation_quota_skipped left=0$')" '^[1-9]'
fl_config '{"quota":200,"usage":0}'
R="$(run_esc)"; expect_match "  โควตากลับมา → ส่ง" "$R" '"sent":1'

section "เตือนซ้ำผู้ป่วย (REMINDER_FOLLOWUP_MIN)"
new_user I; TI="$TOKEN_NEW"; UI="$UID_NEW"
sql "UPDATE users SET line_user_id='$LI' WHERE id=$UI;" >/dev/null
mkmed "$TI" "TEST-7A-ยาI"; DI1="$(dose_of "$MED_ID")"
sql "UPDATE dose_logs SET scheduled_at=NOW() - INTERVAL 50 MINUTE, reminded_at=NOW() - INTERVAL 45 MINUTE, status='pending' WHERE id=$DI1;" >/dev/null
fl_clear; R="$(run_followup 0)"
expect_match "ปิด (0): ไม่ส่ง" "$R" '"groups":0'
expect "  ไม่มี push" "$(fl_count push)" "0"
R="$(run_followup 45)"
expect_match "เปิด (45 นาที) เลยเวลา 50 นาที → ส่ง 1 ครั้ง" "$R" '"groups":1,"sent":1'
expect_match "  Flex เลยเวลา (หัวเหลือง)" "$(fl_last push 'r.body.messages[0].altText+"|"+r.body.messages[0].contents.header.backgroundColor')" '^⏰ ยังไม่ได้กินยามื้อก่อนนอน · เลยเวลามา 5[0-2] นาที\|#fef3c7$'
expect "  ถึงผู้ป่วย" "$(fl_last push 'r.body.to')" "$LI"
expect "  จอง followup_at" "$(sql "SELECT followup_at IS NOT NULL FROM dose_logs WHERE id=$DI1;")" "1"
expect "  notification_logs kind=reminder" "$(sql "SELECT COUNT(*) FROM notification_logs WHERE user_id=$UI AND kind='reminder' AND recipient='patient';")" "1"
fl_clear; R="$(run_followup 45)"; expect "  รันซ้ำ → ไม่ส่งซ้ำ" "$(fl_count push)" "0"
sql "UPDATE dose_logs SET followup_at=NULL, scheduled_at=NOW() - INTERVAL 80 MINUTE WHERE id=$DI1;" >/dev/null
R="$(run_followup 45)"; expect "  เลยมา 80 นาที (เกินหน้าต่าง 45–75) → ไม่ส่งย้อนหลัง" "$(fl_count push)" "0"
sql "UPDATE dose_logs SET scheduled_at=NOW() - INTERVAL 50 MINUTE, reminded_at=NULL WHERE id=$DI1;" >/dev/null
R="$(run_followup 45)"; expect "  ยังไม่เคยเตือนปกติ (reminded_at ว่าง) → ไม่เตือนซ้ำ" "$(fl_count push)" "0"

section "ปิดรอบค้าง (cron 03:00): pending ก่อนวันนี้ → missed"
new_user L; TL="$TOKEN_NEW"; UL="$UID_NEW"
sql "UPDATE users SET line_user_id='$LL' WHERE id=$UL;" >/dev/null
mkmed "$TL" "TEST-7A-เมื่อวาน1"; ML1="$MED_ID"; DL1="$(dose_of "$ML1")"
mkmed "$TL" "TEST-7A-เมื่อวาน2"; ML2="$MED_ID"; DL2="$(dose_of "$ML2")"
mkmed "$TL" "TEST-7A-เมื่อวานกินแล้ว"; ML3="$MED_ID"; DL3="$(dose_of "$ML3")"
mkmed "$TL" "TEST-7A-วันนี้"; ML4="$MED_ID"; DL4="$(dose_of "$ML4")"
sql "UPDATE dose_logs SET scheduled_at = NOW() - INTERVAL 1 DAY WHERE id IN ($DL1,$DL2,$DL3);" >/dev/null
sql "UPDATE dose_logs SET status='taken', taken_at=NOW() - INTERVAL 1 DAY, source='app' WHERE id=$DL3;" >/dev/null
R="$(run_miss)"
expect_match "run_miss คืนจำนวน" "$R" '"missed":[0-9]+'
expect "เมื่อวาน pending → missed (2 รายการ)" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE id IN ($DL1,$DL2) AND status='missed';")" "2"
expect "  เมื่อวานที่ taken ไม่ถูกแตะ" "$(sql "SELECT CONCAT(status,':',source) FROM dose_logs WHERE id=$DL3;")" "taken:app"
expect "  ของวันนี้ไม่ถูกแตะ (pending)" "$(sql "SELECT status FROM dose_logs WHERE id=$DL4;")" "pending"
R="$(run_miss)"
expect "  รันซ้ำได้ ไม่เปลี่ยนซ้ำ" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE user_id=$UL AND status='missed';")" "2"
req POST "/api/doses/$DL1/take" "$TL"; expect "กินย้อนหลังของที่ missed ผ่านเว็บ → 200" "$STATUS" "200"
expect "  เป็น taken source app" "$(sql "SELECT CONCAT(status,':',source) FROM dose_logs WHERE id=$DL1;")" "taken:app"
press "$LL" "a=take&d=$DL2" wait
expect "กินย้อนหลังของที่ missed ผ่าน LINE → taken ผ่าน source line" "$(sql "SELECT CONCAT(status,':',source) FROM dose_logs WHERE id=$DL2;")" "taken:line"
expect_match "  reply บันทึกแล้ว" "$REPLY" 'บันทึกแล้ว'
req GET /api/doses/today "$TL"
expect "หน้าวันนี้ยังแสดงเฉพาะรอบของวันนี้ (missed ของเมื่อวานไม่เข้า)" "$(jget 'o.summary.total')" "1"

section "\"วันนี้\" สำหรับ LINE ที่เป็นผู้ดูแล"
new_user P; TP="$TOKEN_NEW"; UP="$UID_NEW"
mkcg "$TP" "ญาติ-เฉพาะผู้ดูแล" 60 "$LC3"
mkcg "$TP" "ผู้ป่วยที่เป็นผู้ดูแลด้วย" 60 "$LP"
sql "UPDATE users SET line_user_id='$LP' WHERE id=$UP;" >/dev/null
mkmed "$TP" "TEST-7A-ลับ-ชื่อยา"; sql "UPDATE dose_logs SET scheduled_at=NOW() - INTERVAL 5 MINUTE WHERE user_id=$UP;" >/dev/null
new_user Q; TQ="$TOKEN_NEW"; UQ="$UID_NEW"
mkcg "$TQ" "ญาติ" 60 "$LC3"
fl_clear; wh "$(ev_text "$LC3" "วันนี้")"; wait_n reply 1
expect_match "ผู้ดูแล 2 ผู้ป่วย พิมพ์ \"วันนี้\" → Flex สรุปผู้ที่ดูแล" "$(fl_last reply 'r.body.messages[0].altText')" '^📋 ยาวันนี้ของผู้ที่คุณดูแล [0-9]+ คน$'
expect "  ไม่แสดงชื่อยา" "$(fl_last reply 'JSON.stringify(r.body.messages).includes("TEST-7A")')" "false"
expect "  ไม่แสดงอีเมลของใคร" "$(fl_last reply 'JSON.stringify(r.body.messages).includes("@example.test")')" "false"
fl_clear; wh "$(ev_text "$LP" "วันนี้")"; wait_n reply 1
expect "LINE ที่เป็นทั้งผู้ป่วยและผู้ดูแล → 2 ข้อความ (ของตัวเอง + ผู้ที่ดูแล)" "$(fl_last reply 'r.body.messages.length')" "2"
expect_match "  ข้อความแรก = ยาของตัวเอง" "$(fl_last reply 'r.body.messages[0].altText')" '^📋 ยาของวันนี้'
expect_match "  ข้อความที่สอง = ผู้ที่ดูแล" "$(fl_last reply 'r.body.messages[1].altText')" '^📋 ยาวันนี้ของผู้ที่คุณดูแล 1 คน$'

section "โหมดเดโม: POST /api/demo/escalate-now (DEMO_MODE=true)"
new_user J; TJ="$TOKEN_NEW"; UJ="$UID_NEW"
mkcg "$TJ" "ญาติ" 90 "$LC1"; CGJ="$CG_ID"
mkmed "$TJ" "TEST-7A-ยาJ"; DJ1="$(dose_of "$MED_ID")"
sql "UPDATE dose_logs SET scheduled_at=NOW() + INTERVAL 10 MINUTE WHERE id=$DJ1;" >/dev/null
fl_clear; req POST /api/demo/escalate-now "$TJ"
expect "แจ้งญาติทันที (ยังไม่ถึงเวลา) → 200" "$STATUS" "200"
expect "  caregivers=1 resent=false" "$(jget 'o.caregivers+":"+o.resent')" "1:false"
expect_match "  message ภาษาไทย" "$(jget 'o.message')" '^แจ้งญาติ 1 คน เรื่องมื้อก่อนนอน [0-9:]+ น\. \(1 รายการ\) เข้า LINE แล้วค่ะ$'
expect "  push ถึงญาติ 1 ข้อความ" "$(fl_count push)" "1"
expect_match "  การ์ดแสดง \"เลยมา\" ตามเวลาที่ผู้ดูแลตั้ง (90 นาที)" "$(fl_last push 'r.body.messages[0].altText')" 'เลยมา 1 ชม. 30 นาที$'
expect "  จองก่อนส่ง (dose_escalations 1 แถว)" "$(sql "SELECT COUNT(*) FROM dose_escalations WHERE dose_id=$DJ1;")" "1"
fl_clear; req POST /api/demo/escalate-now "$TJ"
expect "กดซ้ำ → 409" "$STATUS" "409"
expect "  code ALREADY_ESCALATED" "$(jget 'o.error')" "ALREADY_ESCALATED"
expect_match "  บอกโควตาสำรองที่เหลือ" "$(jget 'o.quota_left')" '^[0-9]+$'
expect "  ไม่มี push" "$(fl_count push)" "0"
req POST /api/demo/escalate-now "$TJ" '{"force":true}'
expect "ส่ง force:true → 200 ส่งซ้ำ" "$STATUS" "200"
expect "  resent = true" "$(jget 'o.resent')" "true"
expect "  push ถึงญาติ" "$(fl_count push)" "1"
expect "  ไม่เพิ่มแถว dose_escalations" "$(sql "SELECT COUNT(*) FROM dose_escalations WHERE dose_id=$DJ1;")" "1"
expect_match "  log มี escalate_force (ไม่มีข้อมูลส่วนตัว)" "$(docker compose logs nodered 2>&1 | grep -c 'escalate_force')" '^[1-9]'
new_user K; TK="$TOKEN_NEW"
mkmed "$TK" "TEST-7A-ยาK"
req POST /api/demo/escalate-now "$TK"; expect "ไม่มีญาติที่เชื่อม LINE → 409" "$STATUS" "409"
expect "  code NO_CAREGIVER_LINKED" "$(jget 'o.error')" "NO_CAREGIVER_LINKED"
sql "UPDATE dose_logs SET status='taken', taken_at=NOW(), source='app' WHERE id=$DJ1;" >/dev/null
req POST /api/demo/escalate-now "$TJ"; expect "ไม่มีรอบ pending ของวันนี้ → 409" "$STATUS" "409"
expect "  code NO_PENDING_DOSE" "$(jget 'o.error')" "NO_PENDING_DOSE"
req POST /api/demo/escalate-now ""; expect "ไม่มี JWT → 401" "$STATUS" "401"

section "ไม่แตะผู้ใช้จริง + log ไม่มีความลับ"
LOGS="$(docker compose logs nodered 2>&1)"
for needle in "$SECRET" "$TOKEN_LINE" "$LA" "$LC1" "$LC2" "$LC3" "$LP" "$LG" "$LL"; do
  if printf '%s' "$LOGS" | grep -qF -- "$needle"; then bad "log มี '${needle:0:12}…'"; else ok "log ไม่มี '${needle:0:12}…'"; fi
done

section "DEMO_MODE=false: escalate-now ตอบ 404 เหมือนไม่มี endpoint"
restart_nodered "${NR_ENV[@]}" DEMO_MODE=false REMINDER_CRON=off || exit 1
fl_clear; req POST /api/demo/escalate-now "$TJ"; expect "POST /api/demo/escalate-now → 404" "$STATUS" "404"
expect "  ไม่มี push" "$(fl_count push)" "0"

echo
echo "สรุป: ผ่าน $PASS · ไม่ผ่าน $FAIL"
[ "$FAIL" -eq 0 ]
