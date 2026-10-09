#!/usr/bin/env bash
# ทดสอบ Day 6B: cron ส่งเตือน (reminderService), Flex เตือนกินยา, ปุ่ม "กินแล้ว" (postback), โควตา push, โหมดเดโม, GET /api/config,
#              editor/admin fail closed (ไม่มี/รูปแบบผิดของ NODE_RED_ADMIN_HASH), ขอบเขต middleware raw body, ลำดับตัวแปรใน .env.example, รูปน้องยาตรง
# ใช้ LINE ปลอม (scripts/fake-line.js) ไม่ส่งข้อความจริง ; user ทดสอบสุ่มใหม่ทุกครั้งแล้วลบทิ้งตอนจบ
#   bash scripts/test-day6b.sh
# ข้อควรระวัง: สคริปต์ recreate nodered 5 ครั้ง (ชี้ LINE ปลอม + ปิด cron / เปิด cron จริง / ไม่มี hash / hash ผิดรูปแบบ / คืนค่าตาม .env)
#   ช่วง "cron จริง" ถ้ามี dose ของผู้ใช้จริงที่เข้าเงื่อนไขเตือนอยู่ สคริปต์จะข้ามส่วนนั้นเอง (กัน reminded_at ของผู้ใช้จริงถูกจอง) — ต้องมี frontend ที่ build ล่าสุด (รูปมาสคอต)

set -u
cd "$(dirname "$0")/.."
BASE="${BASE:-http://localhost:1880}"
WEB="${WEB:-http://localhost:8080}"
FAKE_PORT=8798
FAKE="http://localhost:$FAKE_PORT"
SECRET="test-channel-secret-day6b"
TOKEN_LINE="test-access-token-day6b"
PUBLIC="https://test-day6b.example.dev"
TMP="$(mktemp -d)"
RUN="$RANDOM$RANDOM"
LA="U6A${RUN}aaaaaaaaaaaaaaaaaaaaaaaaaa"; LA="${LA:0:33}"
LB="U6B${RUN}bbbbbbbbbbbbbbbbbbbbbbbbbb"; LB="${LB:0:33}"
LX="U6X${RUN}xxxxxxxxxxxxxxxxxxxxxxxxxx"; LX="${LX:0:33}"

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
press() { fl_clear; wh "$(ev_postback "$1" "$2")"; REPLY=""; if [ "${3:-}" = "wait" ]; then wait_n reply 1 && REPLY="$(fl_last reply 'r.body.messages.map(m=>m.text).join(" ").replace(/\s+/g," ")')"; else sleep 2; fi; }

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
  local e="test-day6b-$RANDOM$RANDOM@example.test" pw
  pw="$(node -e 'console.log(require("crypto").randomBytes(9).toString("hex"))')"
  req POST /api/auth/register "" "{\"email\":\"$e\",\"password\":\"$pw\",\"display_name\":\"ผู้ทดสอบ day6b $1\"}"
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
}
trap cleanup EXIT

section "เตรียม: LINE ปลอม + recreate nodered (cap 200 / reserve 30, DEMO_MODE=true)"
node scripts/fake-line.js $FAKE_PORT >"$TMP/fake.log" 2>&1 &
FAKE_PID=$!
sleep 1
fl_config "{\"profiles\":{\"$LA\":\"ผู้ป่วย ทดสอบ\"},\"quota\":200,\"usage\":0}"
NR_ENV=(LINE_CHANNEL_SECRET="$SECRET" LINE_CHANNEL_ACCESS_TOKEN="$TOKEN_LINE" LINE_API_BASE="http://host.docker.internal:$FAKE_PORT" LINE_OA_BASIC_ID="@014rktvr" LINE_PUSH_MONTHLY_CAP=200 LINE_PUSH_RESERVE=30 PUBLIC_BASE_URL="$PUBLIC" LINE_MASCOT_URL="")
restart_nodered "${NR_ENV[@]}" DEMO_MODE=true REMINDER_CRON=off || exit 1   # ปิด cron จริงของ Node-RED ชั่วคราว ไม่ให้แย่ง dose กับการเรียก run() ในเทส
ok "nodered พร้อม (cron จริงปิด)"
new_user A; TA="$TOKEN_NEW"; UA="$UID_NEW"
new_user B; TB="$TOKEN_NEW"; UB="$UID_NEW"
new_user C; TC="$TOKEN_NEW"; UC="$UID_NEW"
sql "UPDATE users SET line_user_id='$LA', line_display_name='ผู้ป่วย ทดสอบ' WHERE id=$UA;" >/dev/null
sql "UPDATE users SET line_user_id='$LB' WHERE id=$UB;" >/dev/null

section "cron ส่งเตือน: 3 ยาในมื้อเดียว = 1 push (Flex)"
mkmed "$TA" "TEST-6B-ยาA"; M1="$MED_ID"
mkmed "$TA" "TEST-6B-ยาB"; M2="$MED_ID"
mkmed "$TA" "TEST-6B-ยาC"; M3="$MED_ID"
expect "ยา 3 ตัวมีรอบของวันนี้" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE user_id=$UA;")" "3"
due "$UA" 5
fl_clear
R="$(run_reminder)"
expect_match "run() ส่งสำเร็จ 1 ข้อความ จาก 1 กลุ่ม" "$R" '"groups":1,"sent":1,"failed":0'
expect "จำนวน push ที่ถึง LINE ปลอม" "$(fl_count push)" "1"
expect "ส่งถึง LINE ของผู้ป่วย A" "$(fl_last push 'r.body.to')" "$LA"
expect "ข้อความเป็น flex 1 ข้อความ" "$(fl_last push 'r.body.messages.length+":"+r.body.messages[0].type')" "1:flex"
expect "altText ภาษาไทยตามมื้อและจำนวน" "$(fl_last push 'r.body.messages[0].altText')" "⏰ ถึงเวลากินยามื้อก่อนนอนแล้ว (3 รายการ)"
expect "ปุ่ม postback 'กินแล้ว' มี dose id ครบ 3 ตัว" "$(fl_last push 'r.body.messages[0].contents.footer.contents[0].action.data.split("=").pop().split(",").length')" "3"
expect "  สีปุ่ม #0f766e" "$(fl_last push 'r.body.messages[0].contents.footer.contents[0].color')" "#0f766e"
expect "  postback data ≤ 300 ตัวอักษร" "$(fl_last push 'r.body.messages[0].contents.footer.contents[0].action.data.length<=300')" "true"
expect "ปุ่มเปิดแอปไป PUBLIC_BASE_URL/today" "$(fl_last push 'r.body.messages[0].contents.footer.contents[1].action.uri')" "$PUBLIC/today"
expect "รูปน้องยาตรง = PUBLIC_BASE_URL/line/mascot.png" "$(fl_last push 'JSON.stringify(r.body.messages[0].contents.header).match(/https:[^\"]+mascot.png/)[0]')" "$PUBLIC/line/mascot.png"
expect "ชื่อยา+ความแรงตัวใหญ่ (xl) ในเนื้อหา" "$(fl_last push 'r.body.messages[0].contents.body.contents.filter(b=>b.type==="box")[0].contents[0].size')" "xl"
expect_match "ส่ง X-Line-Retry-Key (UUID)" "$(fl_last push 'r.headers["x-line-retry-key"]')" '^[0-9a-f-]{36}$'
expect "จอง reminded_at ครบ 3 รอบ" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE user_id=$UA AND reminded_at IS NOT NULL;")" "3"
expect "notification_logs บันทึก line_push kind=reminder success" "$(sql "SELECT COUNT(*) FROM notification_logs WHERE user_id=$UA AND channel='line_push' AND kind='reminder' AND success=1;")" "1"
R="$(run_reminder)"; expect_match "รันซ้ำทันที → ไม่มีอะไรให้ส่ง" "$R" '"groups":0'
expect "  push ยังเท่าเดิม" "$(fl_count push)" "1"

section "cron: 2 process พร้อมกัน → ได้ 1 push"
due "$UA" 5
fl_clear
( run_reminder >"$TMP/r1" ) & P1=$!
( run_reminder >"$TMP/r2" ) & P2=$!
wait "$P1" "$P2"   # ห้ามใช้ wait เปล่าๆ: จะรอ fake-line (background job) ไม่มีวันจบ
expect "จำนวน push" "$(fl_count push)" "1"
expect "รวม sent จากสอง process" "$(node -e 'const a=[1,2].map(i=>JSON.parse(require("fs").readFileSync(process.argv[1]+"/r"+i,"utf8").trim()));console.log(a[0].sent+a[1].sent)' "$TMP")" "1"

section "cron: เงื่อนไขการเลือก dose"
due "$UA" 31
fl_clear; R="$(run_reminder)"
expect "dose ที่เลยเวลา > 30 นาที → ไม่ส่ง" "$(fl_count push)" "0"
due "$UA" 29
fl_clear; R="$(run_reminder)"
expect "dose ที่เลยเวลา 29 นาที → ส่ง" "$(fl_count push)" "1"
due "$UA" 5
req PATCH "/api/medications/$M1/stop" "$TA"; expect "หยุดยา A → 200" "$STATUS" "200"
# stop ล้าง pending ของยานั้นไปแล้ว → ใส่รอบกลับเข้าไปเองเพื่อพิสูจน์ว่าเงื่อนไข is_active=1 ทำงานจริง
sql "INSERT INTO dose_logs (medication_id, user_id, slot, scheduled_at, status) SELECT $M1, $UA, 'bedtime', scheduled_at, 'pending' FROM dose_logs WHERE medication_id=$M2 LIMIT 1;" >/dev/null
fl_clear; R="$(run_reminder)"
expect "ยาที่หยุดแล้ว (is_active=0) ไม่ถูกเตือน → เหลือ 2 รายการ" "$(fl_last push 'r.body.messages[0].altText')" "⏰ ถึงเวลากินยามื้อก่อนนอนแล้ว (2 รายการ)"
expect "  dose ของยาที่หยุดไม่ถูกจอง" "$(sql "SELECT reminded_at IS NULL FROM dose_logs WHERE medication_id=$M1;")" "1"
mkmed "$TA" "TEST-6B-ตามอาการ" true
expect "ยา as_needed ไม่มีรอบ" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE medication_id=$MED_ID;")" "0"
mkmed "$TC" "TEST-6B-ยาของC"
due "$UC" 5
fl_clear; R="$(run_reminder)"
expect "user ที่ยังไม่เชื่อม LINE → ข้าม (ไม่ส่ง ไม่จอง)" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE user_id=$UC AND reminded_at IS NOT NULL;")" "0"
expect "  ไม่มี push" "$(fl_count push)" "0"

section "โควตา: reminder หยุดที่ cap-reserve, escalation ไปได้ถึง cap"
due "$UA" 5; sql "UPDATE medications SET is_active=1, end_date=NULL WHERE id=$M1;" >/dev/null
fl_config '{"quota":200,"usage":170}'; fl_clear
R="$(run_reminder)"
expect_match "ใช้ไป 170 (= 200-30) → เตือนปกติหยุด" "$R" '"quota_skipped":1'
expect "  ไม่มี push" "$(fl_count push)" "0"
expect "  ไม่จอง reminded_at (ลองใหม่ได้เมื่อโควตากลับมา)" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE user_id=$UA AND reminded_at IS NOT NULL;")" "0"
CAN="$(docker compose exec -T nodered node -e "const db=require('/data/lib/db'),{createClient}=require('/data/lib/line-client');const c=createClient();Promise.all([c.canPush(db,'reminder'),c.canPush(db,'escalation')]).then(([a,b])=>{console.log(JSON.stringify([a.allowed,b.allowed,b.status.remaining_for_escalation,a.status.remaining_for_reminders]));process.exit(0)})" 2>/dev/null | tail -1)"
expect "canPush ที่ใช้ 170: reminder=false, escalation=true (เหลือ 30)" "$CAN" "[false,true,30,0]"
fl_config '{"quota":200,"usage":169}'
R="$(run_reminder)"
expect_match "ใช้ไป 169 → เตือนปกติส่งได้อีก 1" "$R" '"sent":1'
fl_config '{"quota":100,"usage":0}'; due "$UA" 5; fl_clear
CAN="$(docker compose exec -T nodered node -e "const db=require('/data/lib/db'),{createClient}=require('/data/lib/line-client');createClient().quotaStatus(db).then(s=>{console.log(s.effective_cap+':'+s.remaining_for_reminders);process.exit(0)})" 2>/dev/null | tail -1)"
expect "quota จริงจาก LINE (100) ต่ำกว่า cap (200) → ใช้ 100 (เหลือเตือน 70)" "$CAN" "100:70"
fl_config '{"quota":200,"usage":null}'
sql "INSERT INTO notification_logs (user_id, channel, kind, recipient, success) SELECT $UA, 'line_push', 'reminder', 'patient', 1 FROM information_schema.COLUMNS LIMIT 3;" >/dev/null
CAN="$(docker compose exec -T nodered node -e "const db=require('/data/lib/db'),{createClient}=require('/data/lib/line-client');createClient().quotaStatus(db).then(s=>{console.log(s.used_source+':'+(s.used>=3));process.exit(0)})" 2>/dev/null | tail -1)"
expect "LINE ตอบ consumption ไม่ได้ → นับจาก notification_logs" "$CAN" "logs:true"
sql "DELETE FROM notification_logs WHERE user_id=$UA;" >/dev/null
fl_config '{"quota":200,"usage":0}'

section "push ล้มเหลว (500 / 429) → reminded_at ไม่ถูกคืนค่า"
for CODEF in 500 429; do
  due "$UA" 5; fl_clear; fl_config "{\"mode\":\"$CODEF\"}"
  R="$(run_reminder)"
  expect_match "push ตอบ $CODEF → นับ failed" "$R" '"failed":1'
  expect "  ลองส่ง 2 ครั้ง (retry 1 ครั้งด้วย key เดิม)" "$(fl_count push)" "2"
  expect "  reminded_at ยังอยู่ (ไม่คืนค่า)" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE user_id=$UA AND reminded_at IS NOT NULL;")" "3"
  expect "  notification_logs บันทึกล้มเหลว" "$(sql "SELECT COUNT(*) FROM notification_logs WHERE user_id=$UA AND channel='line_push' AND success=0 AND error_message LIKE '%$CODEF%';")" "1"
  fl_config '{"mode":"ok"}'; fl_clear
  R="$(run_reminder)"; expect "  รอบถัดไปไม่ส่งซ้ำ" "$(fl_count push)" "0"
  sql "DELETE FROM notification_logs WHERE user_id=$UA;" >/dev/null
done

section "ปุ่ม 'กินแล้ว' (postback)"
due "$UA" 5; sql "UPDATE medications SET remaining_qty=30 WHERE user_id=$UA;" >/dev/null
IDS="$(sql "SELECT GROUP_CONCAT(id ORDER BY id) FROM dose_logs WHERE user_id=$UA;")"
mkmed "$TB" "TEST-6B-ยาของB"
IDB="$(sql "SELECT GROUP_CONCAT(id) FROM dose_logs WHERE user_id=$UB;")"
FIRST="${IDS%%,*}"
press "$LX" "a=take&d=$IDS"
expect "LINE ที่ไม่ใช่ผู้ป่วย กดปุ่ม → ไม่มีผล" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE user_id=$UA AND status='taken';")" "0"
expect "  และไม่ตอบอะไร" "$REPLY$(fl_count reply)" "0"
press "$LB" "a=take&d=$IDS"
expect "ผู้ป่วย B กดปุ่มของ A → ข้ามโดยไม่แจ้ง (dose ของ A ไม่เปลี่ยน)" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE user_id=$UA AND status='taken';")" "0"
expect "  ไม่มี reply" "$(fl_count reply)" "0"
press "$LA" "a=take&d=$FIRST,$IDB" wait
expect "ผู้ป่วย A กดปุ่มที่ปนของ B → บันทึกเฉพาะของ A (1 รายการ)" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE user_id=$UA AND status='taken';")" "1"
expect "  ของ B ไม่ถูกแตะ" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE user_id=$UB AND status='taken';")" "0"
expect_match "  reply คำชม + จำนวน + เวลา" "$REPLY" 'บันทึกแล้วค่ะ ✓ กินยา 1 รายการ เมื่อ [0-2][0-9]:[0-5][0-9] น\.'
expect "  source = line และมี taken_at" "$(sql "SELECT source='line' AND taken_at IS NOT NULL FROM dose_logs WHERE id=$FIRST;")" "1"
expect "  หัก remaining_qty ของยานั้น 1 เม็ด" "$(sql "SELECT remaining_qty FROM medications WHERE id=(SELECT medication_id FROM dose_logs WHERE id=$FIRST);")" "29.00"
press "$LA" "a=take&d=$IDS" wait
expect_match "กดซ้ำทั้งชุด (อีก 2 รายการยังไม่กิน) → บันทึกอีก 2 และแจ้งว่า 1 รายการบันทึกไว้ก่อนแล้ว" "$REPLY" 'กินยา 2 รายการ.*อีก 1 รายการบันทึกไว้ก่อนแล้ว'
expect "  หักสต็อกรวม: ยา 3 ตัวเหลือ 29 ตัวละ" "$(sql "SELECT GROUP_CONCAT(remaining_qty ORDER BY id) FROM medications WHERE user_id=$UA AND as_needed=0;")" "29.00,29.00,29.00"
press "$LA" "a=take&d=$IDS" wait
expect "กดซ้ำหลังกินครบ → reply 'บันทึกไว้แล้วค่ะ ✓'" "$REPLY" "บันทึกไว้แล้วค่ะ ✓"
expect "  ไม่หักสต็อกซ้ำ" "$(sql "SELECT GROUP_CONCAT(remaining_qty ORDER BY id) FROM medications WHERE user_id=$UA AND as_needed=0;")" "29.00,29.00,29.00"
req POST "/api/doses/$FIRST/take" "$TA"; expect "ปุ่มในแอปหลังกินทาง LINE → 409 ALREADY_TAKEN (พฤติกรรม API เดิม)" "$STATUS" "409"
req POST "/api/doses/$FIRST/undo" "$TA"; expect "undo ของ dose ที่กินทาง LINE → 200" "$STATUS" "200"
expect "  กลับเป็น pending และล้าง source" "$(sql "SELECT status='pending' AND source IS NULL AND taken_at IS NULL FROM dose_logs WHERE id=$FIRST;")" "1"
req POST "/api/doses/$FIRST/take" "$TA"; expect "take ในแอป → 200 source=app" "$STATUS" "200"
expect "  source = app" "$(sql "SELECT source FROM dose_logs WHERE id=$FIRST;")" "app"
for BADDATA in "a=take" "a=take&d=" "a=take&d=abc,-1,1.5" "a=other&d=$FIRST" "d=$FIRST" "$(printf 'a=take&d=%0300d' 7)"; do
  press "$LA" "$BADDATA"
  expect "data ผิดรูปแบบ '${BADDATA:0:24}…' → ไม่ทำอะไร" "$(fl_count reply)" "0"
done

section "โหมดเดโม (DEMO_MODE=true)"
curl -s -o "$TMP/cfg" -w '%{http_code}' "$BASE/api/config" > "$TMP/cfgcode"
expect "GET /api/config เปิดสาธารณะ (ไม่มี JWT) → 200" "$(cat "$TMP/cfgcode")" "200"
expect "  body = { demoMode: true } เท่านั้น" "$(cat "$TMP/cfg")" '{"demoMode":true}'
req POST /api/demo/remind-now ""; expect "remind-now ไม่มี JWT → 401" "$STATUS" "401"
req POST /api/demo/remind-now "$TB"; expect "ผู้ป่วย B (เชื่อม LINE แล้ว) แต่รอบที่ยังไม่ถึงเวลา → ส่งรอบถัดไปของวันนี้ → 200" "$STATUS" "200"
expect "  ส่งจริง 1 รายการ" "$(jget 'o.sent+":"+o.doses')" "1:1"
expect "  ไม่สร้างรอบปลอม (B ยังมี dose เดิม 1 แถว)" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE user_id=$UB;")" "1"
fl_clear
req POST /api/demo/remind-now "$TB"; expect "กดซ้ำเมื่อทุกรอบเคยเตือนแล้ว → ส่งซ้ำรอบเดิม (ไม่จอง) → 200" "$STATUS" "200"
expect "  resent = true" "$(jget 'o.resent')" "true"
expect "  push ถึง LINE ของ B" "$(fl_last push 'r.body.to')" "$LB"
req POST /api/demo/remind-now "$TC"; expect "ผู้ป่วย C ที่ยังไม่เชื่อม LINE → 409" "$STATUS" "409"
expect "  code = LINE_NOT_LINKED" "$(jget 'o.error')" "LINE_NOT_LINKED"
sql "UPDATE users SET line_user_id='U6c${RUN}ccccccccccccccccccccccccc' WHERE id=$UC;" >/dev/null
req POST /api/demo/remind-now "$TC"; expect "C เชื่อมแล้ว มีรอบแต่เป็นรอบของ A เท่านั้น (ของ C ถึงเวลา) → 200" "$STATUS" "200"
sql "DELETE FROM dose_logs WHERE user_id=$UC;" >/dev/null
req POST /api/demo/remind-now "$TC"; expect "ไม่มี dose ที่รอกินเหลือ → 409" "$STATUS" "409"
expect "  code = NO_PENDING_DOSE พร้อมข้อความไทย" "$(jget 'o.error+":"+/[ก-๙]/.test(o.details)')" "NO_PENDING_DOSE:true"
sql "UPDATE users SET line_user_id=NULL WHERE id=$UC;" >/dev/null
fl_config '{"quota":200,"usage":175}'
QR="$(docker compose exec -T nodered node -e "const db=require('/data/lib/db'),{createClient}=require('/data/lib/line-client'),rs=require('/data/lib/reminder-service');rs.remindNow(db,createClient(),$UB,process.env).then(r=>{console.log(r.status+':'+r.body.error);process.exit(0)})" 2>/dev/null | tail -1)"
expect "โควตาเตือนหมด (ใช้ไป 175; process ใหม่ ไม่ติด cache 5 นาที) → 429 LINE_QUOTA" "$QR" "429:LINE_QUOTA"
fl_config '{"quota":200,"usage":0}'

section "cron จริงใน Node-RED (รอ 1 รอบ ≤ 80 วินาที)"
restart_nodered "${NR_ENV[@]}" DEMO_MODE=true || exit 1   # เปิด cron จริง (ไม่ตั้ง REMINDER_CRON)
OTHERS="$(sql "SELECT COUNT(*) FROM dose_logs d JOIN users u ON u.id=d.user_id JOIN medications m ON m.id=d.medication_id WHERE d.status='pending' AND d.reminded_at IS NULL AND d.scheduled_at <= NOW() + INTERVAL 2 MINUTE AND d.scheduled_at >= NOW() - INTERVAL 30 MINUTE AND m.is_active=1 AND m.as_needed=0 AND u.line_user_id IS NOT NULL AND u.email NOT LIKE 'test-day6b-%';")"
if [ "${OTHERS:-0}" != "0" ]; then
  echo "  ! ข้าม: มี dose จริงของผู้ใช้อื่น $OTHERS รายการที่เข้าเงื่อนไขเตือนในช่วงนี้ — cron จริงจะจองไป (reminded_at) ทำให้ผู้ใช้นั้นพลาดเตือน ; รันซ้ำช่วงที่ไม่มีรอบยา"
else
  due "$UA" 5; sql "UPDATE medications SET remaining_qty=30 WHERE user_id=$UA;" >/dev/null; fl_clear
  for i in $(seq 40); do [ "$(fl_count push)" -ge 1 ] && break; sleep 2; done
  expect "cron ส่งเตือนเอง 1 push" "$(fl_count push)" "1"
  expect "  ถึง LINE ของ A" "$(fl_last push 'r.body.to')" "$LA"
  expect "  จอง reminded_at แล้ว" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE user_id=$UA AND reminded_at IS NULL;")" "0"
  expect_match "  log ของ Node-RED มีสรุปรอบ (ไม่มีข้อมูลส่วนตัว)" "$(docker compose logs nodered 2>&1 | grep -c 'reminder_run groups=')" '^[1-9]'
fi

section "รูปน้องยาตรง (ผ่าน nginx ด้วย User-Agent ที่ไม่ใช่เบราว์เซอร์)"
MH="$(curl -s -m 15 -D - -o "$TMP/mascot.png" -A 'LineBotWebhook/2.0' "$WEB/line/mascot.png" | tr -d '\r')"
expect "GET /line/mascot.png → 200" "$(printf '%s' "$MH" | head -1 | awk '{print $2}')" "200"
expect_match "  content-type image/png" "$(printf '%s' "$MH" | grep -i '^content-type:')" 'image/png'
expect "  เป็น PNG จริง 512×512" "$(node -e 'const b=require("fs").readFileSync(process.argv[1]);console.log(b.slice(1,4).toString()+":"+b.readUInt32BE(16)+"x"+b.readUInt32BE(20))' "$TMP/mascot.png")" "PNG:512x512"
expect "  ขนาดไฟล์ < 1 MB (ข้อจำกัดรูปใน Flex)" "$([ "$(wc -c <"$TMP/mascot.png")" -lt 1000000 ] && echo yes)" "yes"

section ".env.example: ตัวแปรที่ถูกอ้างถึง (\${X}) ต้องประกาศก่อนตัวที่อ้างถึง"
ORDER="$(node -e '
const fs=require("fs");
for (const f of [".env.example"]) {
  const seen=new Set(); const bad=[];
  for (const l of fs.readFileSync(f,"utf8").split(/\r?\n/)) { const m=l.match(/^([A-Z_]+)=(.*)$/); if(!m) continue;
    for (const r of m[2].matchAll(/\$\{([A-Z_]+)/g)) if(!seen.has(r[1])) bad.push(m[1]+"→"+r[1]); seen.add(m[1]); }
  console.log(bad.length?bad.join(","):"ok");
}')"
expect "ลำดับตัวแปรใน .env.example" "$ORDER" "ok"
ENVORDER="$(node -e '
const fs=require("fs"); let t=""; try{t=fs.readFileSync(".env","utf8")}catch{console.log("ไม่มี .env");process.exit()}
const seen=new Set(); const bad=[];
for (const l of t.split(/\r?\n/)) { const m=l.match(/^([A-Z_]+)=(.*)$/); if(!m) continue; for (const r of m[2].matchAll(/\$\{([A-Z_]+)/g)) if(!seen.has(r[1])) bad.push(m[1]+"→"+r[1]); seen.add(m[1]); }
console.log(bad.length?bad.join(","):"ok")')"
expect ".env ของเครื่องนี้ (ไม่แสดงค่า)" "$ENVORDER" "ok"

section "middleware raw body: ขอบเขตแคบ + ไม่ข้าม auth ของ admin (editor เปิดอยู่)"
expect "ตรง :1880 /flows ต้องล็อกด้วยรหัสผ่าน → 401" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/flows")" "401"
expect "POST /flows พร้อม JSON ไม่มี token → 401 (auth ไม่ถูกข้าม)" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/flows" -H 'Content-Type: application/json' -d '[]')" "401"
TOK_JSON="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/auth/token" -H 'Content-Type: application/json' -d '{"client_id":"node-red-editor","grant_type":"password","scope":"","username":"x","password":"y"}')"
TOK_FORM="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/auth/token" --data-urlencode 'client_id=node-red-editor' --data-urlencode 'grant_type=password' --data-urlencode 'scope=' --data-urlencode 'username=x' --data-urlencode 'password=y')"
expect "POST /auth/token: JSON ได้ผลเหมือน urlencoded (admin ยัง parse JSON ตามเดิม; รหัสผิด ไม่ใช่ 400/500)" "$TOK_JSON" "$TOK_FORM"
expect_match "  และเป็นการปฏิเสธรหัสผิด (401/403)" "$TOK_JSON" '^(401|403)$'
req POST /api/auth/login "" '{"email":"nobody@example.test","password":"x"}'; expect "POST /api/auth/login JSON ยังถูก parse (ผิด → 401)" "$STATUS" "401"
req POST /api/auth/login "" '{"email":"bad"}'; expect "  body ไม่ครบ → 400 VALIDATION (parse ได้)" "$STATUS" "400"
fl_clear
wh "$(ev_text "$LA" "สวัสดี")"; expect "POST /line/webhook (exact path) ยังทำงาน" "$STATUS" "200"
wait_n reply 1; expect "  และประมวลผลจาก raw bytes" "$(fl_count reply)" "1"
fl_clear
for P in /line/webhook/ /LINE/webhook /line/webhook/x; do
  printf '%s' "$(ev_text "$LA" "x")" > "$TMP/pb"
  SIGP="$(node -e 'const c=require("crypto"),fs=require("fs");process.stdout.write(c.createHmac("sha256",process.argv[1]).update(fs.readFileSync(process.argv[2])).digest("base64"))' "$SECRET" "$TMP/pb")"
  C="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE$P" -H 'Content-Type: application/json' -H "x-line-signature: $SIGP" --data-binary "@$TMP/pb")"
  case "$C" in 401|404) ok "POST $P (path ไม่ตรง exact) → $C ไม่ประมวลผล";; *) bad "POST $P ได้ $C ควรเป็น 401/404";; esac
done
sleep 1; expect "  ไม่มี reply จาก path ที่ไม่ตรง" "$(fl_count reply)" "0"

section "fail closed: ไม่มี / รูปแบบผิดของ NODE_RED_ADMIN_HASH (และ DEMO_MODE=false)"
restart_nodered "${NR_ENV[@]}" DEMO_MODE=false REMINDER_CRON=off NODE_RED_ADMIN_HASH="" || exit 1
for P in /flows / /settings /auth/login /nodes /red/ /diagnostics; do
  expect "ไม่มี hash: GET $P → 404 (editor/admin ปิด)" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$P")" "404"
done
expect "ไม่มี hash: POST /auth/token → 404" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/auth/token" -d '{}' -H 'Content-Type: application/json')" "404"
expect "ไม่มี hash: http-in /api ยังทำงาน (GET /api/me → 401)" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/me")" "401"
req POST /api/auth/login "" '{"email":"nobody@example.test","password":"x"}'; expect "  POST JSON /api/auth/login ยัง parse ได้ → 401" "$STATUS" "401"
fl_clear
wh "$(ev_text "$LA" "สวัสดี")"; expect "  webhook ยังทำงาน (signature ถูก) → 200" "$STATUS" "200"
wait_n reply 1; expect "  และประมวลผลจาก raw bytes (middleware ฝั่ง httpNode)" "$(fl_count reply)" "1"
printf '%s' "$(ev_text "$LA" "x")" > "$TMP/pb"
expect "  webhook signature ผิด → 401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/line/webhook" -H 'Content-Type: application/json' -H 'x-line-signature: abc' --data-binary @$TMP/pb)" "401"
LOGS="$(docker compose logs nodered 2>&1)"
expect_match "  log เตือนว่า editor/admin ถูกปิด (ไม่มีค่า hash)" "$LOGS" 'editor/admin API ถูกปิด: NODE_RED_ADMIN_HASH ว่างหรือไม่ได้ตั้ง'
expect "  log ไม่มี bcrypt hash" "$(printf '%s' "$LOGS" | grep -cE '\$2[aby]\$[0-9]{2}\$')" "0"
curl -s -o "$TMP/cfg" "$BASE/api/config"
expect "DEMO_MODE=false: GET /api/config = { demoMode: false }" "$(cat "$TMP/cfg")" '{"demoMode":false}'
req POST /api/demo/remind-now "$TB"; expect "  POST /api/demo/remind-now → 404" "$STATUS" "404"
expect "  ไม่มี dose ปลอมถูกสร้าง/ส่ง (push = 0)" "$(fl_count push)" "0"
restart_nodered "${NR_ENV[@]}" DEMO_MODE=false REMINDER_CRON=off NODE_RED_ADMIN_HASH="demo1234" || exit 1
expect "hash รูปแบบผิด (รหัสผ่านตรงๆ): GET /flows → 404 (fail closed)" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/flows")" "404"
expect_match "  log บอกว่าไม่ใช่ bcrypt hash" "$(docker compose logs nodered 2>&1)" 'ไม่ใช่ bcrypt hash ที่ถูกรูปแบบ'
expect "  ไม่ log ค่า hash/รหัสผ่านที่ใส่มา" "$(docker compose logs nodered 2>&1 | grep -c 'demo1234')" "0"
expect "  http-in ยังทำงาน" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/me")" "401"

section "log ไม่มีความลับ"
LOGS="$(docker compose logs nodered 2>&1)"
for needle in "$SECRET" "$TOKEN_LINE" "$LA" "$LB" "$LX"; do
  if printf '%s' "$LOGS" | grep -qF -- "$needle"; then bad "log มี '${needle:0:12}…'"; else ok "log ไม่มี '${needle:0:12}…'"; fi
done

echo
echo "สรุป: ผ่าน $PASS · ไม่ผ่าน $FAIL"
[ "$FAIL" -eq 0 ]
