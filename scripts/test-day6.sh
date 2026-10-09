#!/usr/bin/env bash
# ทดสอบ Day 6A: POST /line/webhook (signature / raw body / Verify / redelivery), เชื่อมบัญชีด้วยรหัส 6 หลัก (ผู้ป่วย+ผู้ดูแล),
#              /api/line/*, /api/caregivers*, unfollow, nginx ไม่ส่ง editor/admin ของ Node-RED ออกไป, migration/schema, ไม่มีความลับใน log
# ใช้ LINE ปลอม (scripts/fake-line.js) ไม่ส่งข้อความจริง ไม่เปลืองโควตา ; user ทดสอบสุ่มใหม่ทุกครั้งแล้วลบทิ้งตอนจบ
#   bash scripts/test-day6.sh
# ข้อควรระวัง: สคริปต์ recreate nodered 2 ครั้ง (ตอนเริ่มเพื่อชี้ไป LINE ปลอม + ตอนจบเพื่อคืนค่าตาม .env)

set -u
cd "$(dirname "$0")/.."
BASE="${BASE:-http://localhost:1880}"
WEB="${WEB:-http://localhost:8080}"
FAKE_PORT=8798
FAKE="http://localhost:$FAKE_PORT"
SECRET="test-channel-secret-day6"
TOKEN_LINE="test-access-token-day6"
TMP="$(mktemp -d)"
RUN="$RANDOM$RANDOM"
LA="U6a${RUN}aaaaaaaaaaaaaaaaaaaaaaaaaa"; LA="${LA:0:33}"   # ผู้ป่วย A
LB="U6b${RUN}bbbbbbbbbbbbbbbbbbbbbbbbbb"; LB="${LB:0:33}"   # คนที่ 2
LC="U6c${RUN}cccccccccccccccccccccccccc"; LC="${LC:0:33}"   # ผู้ดูแล (ดูแล 2 คน)
LG="U6g${RUN}gggggggggggggggggggggggggg"; LG="${LG:0:33}"   # คนเดารหัส

PASS=0; FAIL=0; STATUS=""; BODY=""; EVN=0
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
fl_config() { printf '%s' "$1" > "$TMP/cfg.json"; fl -X POST "$FAKE/_config" -H 'Content-Type: application/json' --data-binary "@$TMP/cfg.json" >/dev/null; }   # ผ่านไฟล์: curl -d กับภาษาไทยบน Windows เข้ารหัสเพี้ยน
# fl_count reply|push → จำนวนคำขอ
fl_count() { fl "$FAKE/_requests" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).filter(r=>r.path==="/v2/bot/message/"+process.argv[1]).length))' "$1"; }
# fl_reply_text N → ข้อความแรกของ reply ลำดับที่ N (เริ่ม 1) ; fl_reply_to N → replyToken
fl_reply_text() { fl "$FAKE/_requests" | node scripts/lib/fl-text.js "$1"; }   # text = ข้อความ, Flex = altText + ข้อความใน Flex
# wait_reply N → รอจน reply ถึง N ครั้ง (สูงสุด 10 วินาที)
wait_reply() { local i; for i in $(seq 20); do [ "$(fl_count reply)" -ge "$1" ] && return 0; sleep 0.5; done; return 1; }

# ---------- webhook ----------
# wh BODY [ok|bad|none|empty|short|long] [URL_BASE] → ตั้ง STATUS ; LAST_SIG = signature ที่ส่ง
wh() {
  local body="$1" mode="${2:-ok}" url="${3:-$BASE}" sig
  printf '%s' "$body" > "$TMP/body"
  sig="$(node -e 'const c=require("crypto"),fs=require("fs");process.stdout.write(c.createHmac("sha256",process.argv[1]).update(fs.readFileSync(process.argv[2])).digest("base64"))' "$SECRET" "$TMP/body")"
  case "$mode" in
    bad) sig="$(node -e 'const c=require("crypto");process.stdout.write(c.createHmac("sha256","wrong").update("x").digest("base64"))')" ;;
    short) sig="abc" ;;
    long) sig="${sig}AAAA" ;;
  esac
  local hdr=(-H "x-line-signature: $sig"); [ "$mode" = "empty" ] && hdr=(-H "x-line-signature;")
  local args=(-s -o "$TMP/resp" -w '%{http_code}' -X POST "$url/line/webhook" -H 'Content-Type: application/json' --data-binary "@$TMP/body")
  [ "$mode" != "none" ] && args+=("${hdr[@]}")
  LAST_SIG="$sig"
  STATUS="$(curl "${args[@]}")"
}
# รูปแบบ JSON แปลกๆ (ช่องว่างเยอะ ภาษาไทย escape) เพื่อพิสูจน์ว่าตรวจจาก raw bytes จริง
evid() { node -e "console.log(require('crypto').randomUUID())"; }   # รันใน subshell ($(...)) ตัวนับ/\$RANDOM ซ้ำกัน จึงใช้ UUID
ev_text() { local id; id="$(evid)"; printf '{ "destination" : "U00000000000000000000000000000000",  "events" :[ {"type":"message" , "mode":"active","timestamp":1700000000000,"source":{"type":"user","userId":"%s"},"webhookEventId":"EV%s","deliveryContext":{"isRedelivery":false},"replyToken":"rt%s","message":{"id":"m1","type":"text","text":"%s"}} ] }' "$1" "$id" "$id" "$2"; }
ev_type() { local id; id="$(evid)"; printf '{"destination":"U0","events":[{"type":"%s","timestamp":1700000000000,"source":{"type":"user","userId":"%s"},"webhookEventId":"EV%s","replyToken":"rt%s"}]}' "$2" "$1" "$id" "$id"; }
say() { # say LINE_ID TEXT → ส่ง event ข้อความแล้วรอ reply 1 ครั้ง ; ผลอยู่ใน REPLY (ล้างรายการก่อน)
  fl_clear; wh "$(ev_text "$1" "$2")"; REPLY=""
  [ "$STATUS" = "200" ] && wait_reply 1 && REPLY="$(fl_reply_text 1)"
}

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
  local e="test-day6-$RANDOM$RANDOM@example.test" pw
  pw="$(node -e 'console.log(require("crypto").randomBytes(9).toString("hex"))')"
  req POST /api/auth/register "" "{\"email\":\"$e\",\"password\":\"$pw\",\"display_name\":\"ผู้ทดสอบ day6 $1\"}"
  TEST_EMAILS+=("$e")
  TOKEN_NEW="$(jget 'o.token')"
  UID_NEW="$(sql "SELECT id FROM users WHERE email='$e';")"
}
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

section "เตรียม: migration ซ้ำได้ + LINE ปลอม + recreate nodered"
bash scripts/migrate.sh >/dev/null 2>&1; expect "migrate.sh รันซ้ำ (ครั้งที่ 1) exit" "$?" "0"
bash scripts/migrate.sh >/dev/null 2>&1; expect "migrate.sh รันซ้ำ (ครั้งที่ 2) exit" "$?" "0"
node scripts/fake-line.js $FAKE_PORT >"$TMP/fake.log" 2>&1 &
FAKE_PID=$!
sleep 1
fl_config "{\"profiles\":{\"$LA\":\"สมชาย ทดสอบ\",\"$LB\":\"สมหญิง ทดสอบ\",\"$LC\":\"ลูกสาว ทดสอบ\"}}"
restart_nodered LINE_CHANNEL_SECRET="$SECRET" LINE_CHANNEL_ACCESS_TOKEN="$TOKEN_LINE" LINE_API_BASE="http://host.docker.internal:$FAKE_PORT" LINE_OA_BASIC_ID="@014rktvr" REMINDER_ONLY_EMAIL_SUFFIX="@example.test" || exit 1
ok "nodered พร้อม (ชี้ LINE ปลอมที่ :$FAKE_PORT)"

section "schema: ไฟล์ init ตรงกับ DB ที่ migrate แล้ว"
rootsql() { docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4' 2>/dev/null <<<"$1"; }
rootsql "DROP DATABASE IF EXISTS yt_schema_test; CREATE DATABASE yt_schema_test;" >/dev/null
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 yt_schema_test' < db/init/01_schema.sql 2>/dev/null
cols() { # cols DB TABLE
  docker compose exec -T db sh -c "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -N -B -e \"SELECT ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, IFNULL(COLUMN_DEFAULT,'NULL') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$1' AND TABLE_NAME='$2' ORDER BY ORDINAL_POSITION\"" 2>/dev/null
}
LIVE_DB="$(docker compose exec -T db sh -c 'echo $MYSQL_DATABASE' | tr -d '\r')"
for t in users caregivers; do
  expect "ตาราง $t: คอลัมน์ init = live (SHOW COLUMNS)" "$(cols yt_schema_test $t | md5sum)" "$(cols "$LIVE_DB" $t | md5sum)"
done
rootsql "DROP DATABASE yt_schema_test;" >/dev/null

section "webhook: signature"
fl_clear
B1="$(ev_text "$LG" "สวัสดี  ค่ะ \\\"ทดสอบ\\\" \\\\ \\u0e01")"
wh "$B1" ok;      expect "signature ถูก (JSON แปลกๆ + ภาษาไทย) → 200" "$STATUS" "200"
wait_reply 1;     expect "  ประมวลผลแล้ว (มี reply 1 ครั้ง)" "$(fl_count reply)" "1"
fl_clear
wh "$(ev_text "$LG" "x")" bad;    expect "signature ผิด → 401" "$STATUS" "401"
wh "$(ev_text "$LG" "x")" none;   expect "ไม่มี header → 401" "$STATUS" "401"
wh "$(ev_text "$LG" "x")" empty;  expect "header ว่าง → 401" "$STATUS" "401"
wh "$(ev_text "$LG" "x")" short;  expect "signature สั้นกว่า (ต้องไม่ crash) → 401" "$STATUS" "401"
wh "$(ev_text "$LG" "x")" long;   expect "signature ยาวกว่า/มีส่วนเกินต่อท้าย → 401" "$STATUS" "401"
# body ที่ถูกจัดรูปใหม่ (bytes ต่าง) ด้วย signature ของ bytes เดิม
ORIG="$(ev_text "$LG" "x")"; printf '%s' "$ORIG" > "$TMP/b0"
SIG0="$(node -e 'const c=require("crypto"),fs=require("fs");process.stdout.write(c.createHmac("sha256",process.argv[1]).update(fs.readFileSync(process.argv[2])).digest("base64"))' "$SECRET" "$TMP/b0")"
NEW="$(printf '%s' "$ORIG" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(s))))')"
printf '%s' "$NEW" > "$TMP/b1"
expect "body ถูก JSON.stringify ซ้ำ (bytes ต่าง) ด้วย signature เดิม → 401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/line/webhook" -H 'Content-Type: application/json' -H "x-line-signature: $SIG0" --data-binary @$TMP/b1)" "401"
sleep 1; expect "  ทุกกรณีที่ 401 ไม่ประมวลผล (ไม่มี reply)" "$(fl_count reply)" "0"
wh '{"destination":"U0","events":[]}' ok; expect "ปุ่ม Verify (events ว่าง) → 200" "$STATUS" "200"
wh '' ok;                                   expect "body ว่าง + signature ถูก → 200 ไม่ crash" "$STATUS" "200"
wh 'ไม่ใช่ json' ok;                        expect "body ไม่ใช่ JSON + signature ถูก → 200 ไม่ crash" "$STATUS" "200"
sleep 1; expect "  Verify/ว่าง/เสีย ไม่ทำให้มี reply" "$(fl_count reply)" "0"
wh "$(ev_text "$LG" "ผ่าน nginx")" ok "$WEB"; expect "ผ่าน nginx :8080 (bytes ต้องไม่ถูกแก้) → 200" "$STATUS" "200"
wait_reply 1; expect "  ประมวลผลแล้ว" "$(fl_count reply)" "1"
fl_clear
wh "$(ev_text "$LG" "x")" bad "$WEB"; expect "ผ่าน nginx: signature ผิด → 401" "$STATUS" "401"

section "webhook: redelivery (webhookEventId ซ้ำ)"
fl_clear
RE="$(ev_text "$LG" "ทดสอบซ้ำ")"
wh "$RE" ok; wait_reply 1
wh "$RE" ok; expect "ส่ง body เดิมซ้ำ → ยังตอบ 200" "$STATUS" "200"
sleep 2; expect "  แต่ประมวลผลครั้งเดียว (reply = 1)" "$(fl_count reply)" "1"

section "เชื่อมบัญชีผู้ป่วย (รหัส 6 หลัก)"
new_user A; TA="$TOKEN_NEW"; UA="$UID_NEW"
new_user B; TB="$TOKEN_NEW"; UB="$UID_NEW"
req POST /api/line/link-code "";   expect "ไม่มี JWT → 401" "$STATUS" "401"
req GET /api/line/status "$TA";    expect "status เริ่มต้น linked = false" "$(jget 'o.linked')" "false"
req POST /api/line/link-code "$TA"; expect "POST /api/line/link-code → 200" "$STATUS" "200"
CODE_A="$(jget 'o.code')"
expect_match "  code เป็นเลข 6 หลัก" "$CODE_A" '^[0-9]{6}$'
expect_match "  expires_in ≤ 600 วินาที" "$(jget 'o.expires_in <= 600 && o.expires_in > 590')" '^true$'
expect "  oa_message_url (@ → %40)" "$(jget 'o.oa_message_url')" "https://line.me/R/oaMessage/%40014rktvr/?$CODE_A"
expect "  DB เก็บรหัส + เวลาหมดอายุ" "$(sql "SELECT line_link_code='$CODE_A' AND line_link_code_expires_at > NOW() FROM users WHERE id=$UA;")" "1"

fl_clear; wh "$(ev_type "$LA" follow)" ok; wait_reply 1
expect_match "follow → reply ต้อนรับ (Flex) มีวิธีเชื่อม 3 ขั้น" "$(fl_reply_text 1 | paste -sd" " -)" '1️⃣.*2️⃣.*3️⃣'

say "$LA" "$(printf '%s %s' "${CODE_A:0:3}" "${CODE_A:3}")"
expect_match "ส่งรหัส (มีช่องว่างตรงกลาง) → ยินดีด้วยชื่อ LINE" "$REPLY" 'เชื่อมสำเร็จแล้วค่ะ.*สวัสดีคุณ สมชาย ทดสอบ'
expect "  users.line_user_id = LA" "$(sql "SELECT line_user_id='$LA' FROM users WHERE id=$UA;")" "1"
expect "  เก็บชื่อจาก getProfile" "$(sql "SELECT line_display_name FROM users WHERE id=$UA;")" "สมชาย ทดสอบ"
expect "  รหัสถูกล้าง (ใช้ได้ครั้งเดียว)" "$(sql "SELECT line_link_code IS NULL AND line_link_code_expires_at IS NULL FROM users WHERE id=$UA;")" "1"
req GET /api/line/status "$TA"; expect "  GET status linked = true" "$(jget 'o.linked')" "true"
expect "  display_name" "$(jget 'o.display_name')" "สมชาย ทดสอบ"
expect "  notification_logs บันทึก reply (kind=link)" "$(sql "SELECT COUNT(*) FROM notification_logs WHERE user_id=$UA AND channel='line_reply' AND kind='link' AND success=1;")" "1"

say "$LB" "$CODE_A"
expect_match "ใช้รหัสเดิมซ้ำ (จาก LINE อื่น) → ไม่ถูกต้อง/หมดอายุ" "$REPLY" 'รหัสนี้ใช้ไม่ได้ค่ะ'

req POST /api/line/link-code "$TA"; CODE_X="$(jget 'o.code')"
sql "UPDATE users SET line_link_code_expires_at = NOW() - INTERVAL 1 MINUTE WHERE id=$UA;" >/dev/null
say "$LB" "$CODE_X"
expect_match "รหัสหมดอายุ → ไม่ถูกต้อง/หมดอายุ" "$REPLY" 'รหัสนี้ใช้ไม่ได้ค่ะ'
expect "  ผู้ป่วย A ยังเชื่อมกับ LA เดิม (ไม่ถูกเขียนทับ)" "$(sql "SELECT line_user_id='$LA' FROM users WHERE id=$UA;")" "1"

section "ข้อความอื่น: เมนูช่วยเหลือ / วันนี้"
say "$LG" "สวัสดี"
expect_match "ข้อความทั่วไป → เมนูช่วยเหลือ" "$REPLY" 'พิมพ์ "วันนี้"'
say "$LG" "วันนี้"
expect_match "'วันนี้' จาก LINE ที่ยังไม่เชื่อม → บอกให้เชื่อมก่อน" "$REPLY" 'ยังไม่ได้เชื่อมบัญชี'
say "$LA" "วันนี้"
expect_match "'วันนี้' ของผู้ป่วยที่เชื่อมแล้วแต่ยังไม่มียา" "$REPLY" 'วันนี้ไม่มียาที่ต้องกินค่ะ'
req POST /api/medications "$TA" '{"name":"TEST-day6-พารา","strength":"500 mg","dose_per_time":0.5,"unit":"tablet","meal_relation":"after","as_needed":false,"slots":["bedtime"],"total_qty":30}'
expect "สร้างยาทดสอบ → 201" "$STATUS" "201"
sql "UPDATE user_slot_times SET slot_time='23:59:00' WHERE user_id=$UA AND slot='bedtime';" >/dev/null
say "$LA" "วันนี้"
expect_match "'วันนี้' สรุปยา (Flex: ยังไม่ได้กิน/รอเวลา + ชื่อยาใต้มื้อ + ความคืบหน้า)" "$(echo "$REPLY" | paste -sd' ' -)" '📋 ยาของวันนี้.*กินแล้ว 0 จาก 1 รายการ.*• TEST-day6-พารา 500 mg'
expect "  reply ไม่ทำให้นับ push" "$(fl_count push)" "0"

section "กันเดารหัส (ผิด 5 ครั้ง / 10 นาที / LINE userId)"
for i in 1 2 3 4 5; do say "$LG" "00000$i"; done
expect_match "ผิดครั้งที่ 5 ยังตอบว่ารหัสไม่ถูกต้อง" "$REPLY" 'รหัสนี้ใช้ไม่ได้ค่ะ'
req POST /api/line/link-code "$TB"; CODE_B="$(jget 'o.code')"
say "$LG" "$CODE_B"
expect_match "ครั้งที่ 6 ต่อให้รหัสถูก → ถูกบล็อก" "$REPLY" 'ลองหลายครั้งเกินไปค่ะ'
expect "  ผู้ป่วย B ยังไม่ถูกเชื่อม" "$(sql "SELECT line_user_id IS NULL FROM users WHERE id=$UB;")" "1"

section "LINE เดียวชนผู้ป่วยคนอื่น"
say "$LA" "$CODE_B"
expect_match "LA (เชื่อมกับ A แล้ว) ส่งรหัสของ B → อธิบายว่าเชื่อมซ้ำไม่ได้" "$REPLY" 'LINE นี้เชื่อมกับผู้ป่วยคนอื่นแล้วค่ะ'
expect "  B ยังไม่ถูกเชื่อม" "$(sql "SELECT line_user_id IS NULL FROM users WHERE id=$UB;")" "1"
expect "  A ยังเชื่อมกับ LA" "$(sql "SELECT line_user_id='$LA' FROM users WHERE id=$UA;")" "1"
expect "  รหัสของ B ยังไม่ถูกใช้ทิ้ง" "$(sql "SELECT line_link_code='$CODE_B' FROM users WHERE id=$UB;")" "1"
say "$LB" "$CODE_B"
expect_match "LB ส่งรหัสของ B → เชื่อมสำเร็จ" "$REPLY" 'เชื่อมสำเร็จแล้วค่ะ.*สวัสดีคุณ สมหญิง ทดสอบ'

section "ผู้ดูแล: CRUD + เจ้าของเท่านั้น"
req GET /api/caregivers "";                expect "ไม่มี JWT → 401" "$STATUS" "401"
req POST /api/caregivers "$TA" '{"name":""}';                          expect "ชื่อว่าง → 400" "$STATUS" "400"
req POST /api/caregivers "$TA" '{"name":"ลูก","escalate_after_min":9}'; expect "escalate 9 นาที → 400" "$STATUS" "400"
req POST /api/caregivers "$TA" '{"name":"ลูก","escalate_after_min":721}'; expect "escalate 721 นาที → 400" "$STATUS" "400"
req POST /api/caregivers "$TA" '{"name":"คุณลูกสาว","relation":"ลูกสาว"}'; expect "เพิ่มผู้ดูแล → 201" "$STATUS" "201"
CG1="$(jget 'o.id')"
expect "  ค่าเริ่มต้น escalate_after_min = 60" "$(jget 'o.escalate_after_min')" "60"
expect "  line_linked = false" "$(jget 'o.line_linked')" "false"
req POST /api/caregivers "$TA" '{"name":"คุณหลาน","escalate_after_min":10}'; expect "เพิ่มด้วย escalate 10 (ขอบล่าง) → 201" "$STATUS" "201"
CG2="$(jget 'o.id')"
req POST /api/caregivers "$TB" '{"name":"คุณพ่อของ B","escalate_after_min":720}'; expect "ผู้ป่วย B เพิ่มผู้ดูแล escalate 720 (ขอบบน) → 201" "$STATUS" "201"
CGB="$(jget 'o.id')"
req GET /api/caregivers "$TA"; expect "A เห็นผู้ดูแลของตัวเอง 2 คน (ไม่เห็นของ B)" "$(jget 'o.caregivers.length')" "2"
req PATCH "/api/caregivers/$CG1" "$TA" '{"escalate_after_min":90,"relation":"ลูก"}'; expect "PATCH → 200" "$STATUS" "200"
expect "  escalate_after_min = 90" "$(jget 'o.escalate_after_min')" "90"
expect "  ชื่อเดิมไม่เปลี่ยน" "$(jget 'o.name')" "คุณลูกสาว"
req PATCH "/api/caregivers/$CG1" "$TA" '{"escalate_after_min":5}'; expect "PATCH escalate 5 → 400" "$STATUS" "400"
req PATCH "/api/caregivers/$CG1" "$TA" '{"escalate_after_min":90}'; expect "PATCH ค่าเดิมซ้ำ → 200 (ไม่ใช่ 404)" "$STATUS" "200"
req PATCH "/api/caregivers/$CG1" "$TB" '{"name":"แฮก"}';  expect "B แก้ผู้ดูแลของ A → 404 (ไม่ใช่ 403)" "$STATUS" "404"
req DELETE "/api/caregivers/$CG1" "$TB";                  expect "B ลบผู้ดูแลของ A → 404" "$STATUS" "404"
req POST "/api/caregivers/$CG1/link-code" "$TB";          expect "B ขอรหัสให้ผู้ดูแลของ A → 404" "$STATUS" "404"
req PATCH "/api/caregivers/999999999" "$TA" '{"name":"x"}'; expect "id ที่ไม่มี → 404" "$STATUS" "404"
req PATCH "/api/caregivers/abc" "$TA" '{"name":"x"}';     expect "id ไม่ใช่ตัวเลข → 404" "$STATUS" "404"
expect "  ผู้ดูแลของ A ไม่ถูกแตะ" "$(sql "SELECT name FROM caregivers WHERE id=$CG1;")" "คุณลูกสาว"

section "เชื่อมผู้ดูแล (LINE เดียวดูแลหลายคน / เป็นทั้งผู้ป่วยและผู้ดูแล)"
req POST "/api/caregivers/$CG1/link-code" "$TA"; expect "ขอรหัสผู้ดูแล → 200" "$STATUS" "200"
CCODE1="$(jget 'o.code')"
expect_match "  oa_message_url ตามรหัส" "$(jget 'o.oa_message_url')" "oaMessage/%40014rktvr/\\?$CCODE1\$"
req POST /api/line/link-code "$TA"; CODE_A2="$(jget 'o.code')"
expect "รหัสผู้ป่วยกับรหัสผู้ดูแลไม่ซ้ำกัน" "$([ "$CODE_A2" != "$CCODE1" ] && echo diff)" "diff"
say "$LC" "$CCODE1"
expect_match "ผู้ดูแลส่งรหัส → เชื่อมเป็นผู้ดูแลของ {ชื่อผู้ป่วย}" "$REPLY" "เชื่อมเป็นผู้ดูแลแล้วค่ะ.*ผู้ดูแลของคุณ ผู้ทดสอบ day6 A"
expect "  caregivers.line_user_id = LC" "$(sql "SELECT line_user_id='$LC' AND line_display_name='ลูกสาว ทดสอบ' FROM caregivers WHERE id=$CG1;")" "1"
expect "  รหัสผู้ดูแลถูกล้าง" "$(sql "SELECT link_code IS NULL FROM caregivers WHERE id=$CG1;")" "1"
expect "  ไม่ไปแตะ users.line_user_id ของ A" "$(sql "SELECT line_user_id='$LA' FROM users WHERE id=$UA;")" "1"
req GET /api/caregivers "$TA"; expect "  GET: line_linked = true" "$(jget 'o.caregivers[0].line_linked')" "true"
req POST "/api/caregivers/$CGB/link-code" "$TB"; CCODE_B="$(jget 'o.code')"
say "$LC" "$CCODE_B"
expect_match "LC ดูแลผู้ป่วยคนที่ 2 (B) ได้ด้วย" "$REPLY" "ผู้ป่วยทดสอบ|ผู้ทดสอบ day6 B"
expect "  LC ผูกกับผู้ดูแล 2 แถว (คนละผู้ป่วย)" "$(sql "SELECT COUNT(*) FROM caregivers WHERE line_user_id='$LC';")" "2"
req POST "/api/caregivers/$CG2/link-code" "$TA"; CCODE_LA="$(jget 'o.code')"
say "$LA" "$CCODE_LA"
expect_match "LA (ผู้ป่วย A) เป็นผู้ดูแลของ A เองอีกบทบาทได้" "$REPLY" 'เชื่อมเป็นผู้ดูแลแล้วค่ะ'
expect "  ยังเป็นผู้ป่วยอยู่ด้วย" "$(sql "SELECT line_user_id='$LA' FROM users WHERE id=$UA;")" "1"

section "unfollow / ยกเลิกการเชื่อม"
fl_clear; wh "$(ev_type "$LC" unfollow)" ok; sleep 1.5
expect "unfollow ของ LC → ล้างจาก caregivers ทุกแถว" "$(sql "SELECT COUNT(*) FROM caregivers WHERE line_user_id='$LC';")" "0"
expect "  ล้างชื่อ LINE ด้วย" "$(sql "SELECT line_display_name IS NULL FROM caregivers WHERE id=$CG1;")" "1"
expect "  ไม่แตะผู้ป่วย A" "$(sql "SELECT line_user_id='$LA' FROM users WHERE id=$UA;")" "1"
expect "  ไม่ reply (ไม่มี replyToken ที่ใช้ได้)" "$(fl_count reply)" "0"
wh "$(ev_type "$LB" unfollow)" ok; sleep 1.5
expect "unfollow ของ LB → ล้าง users.line_user_id ของ B" "$(sql "SELECT line_user_id IS NULL AND line_display_name IS NULL FROM users WHERE id=$UB;")" "1"
req GET /api/line/status "$TB"; expect "  GET status ของ B linked = false" "$(jget 'o.linked')" "false"
req DELETE /api/line/link "$TA"; expect "DELETE /api/line/link → 200" "$STATUS" "200"
req GET /api/line/status "$TA"; expect "  linked = false" "$(jget 'o.linked')" "false"
expect "  DB ล้าง line_user_id + ชื่อ" "$(sql "SELECT line_user_id IS NULL AND line_display_name IS NULL FROM users WHERE id=$UA;")" "1"
expect "  ผู้ดูแลของ A (LA เป็นผู้ดูแลตัวเอง) ไม่ถูกแตะ" "$(sql "SELECT COUNT(*) FROM caregivers WHERE id=$CG2 AND line_user_id='$LA';")" "1"
req DELETE "/api/caregivers/$CG2" "$TA"; expect "ลบผู้ดูแล → 200" "$STATUS" "200"
req DELETE "/api/caregivers/$CG2" "$TA"; expect "ลบซ้ำ → 404" "$STATUS" "404"

section "รหัสไม่ซ้ำข้ามตาราง (ตรวจในโค้ด)"
sql "UPDATE caregivers SET link_code='123456', link_code_expires_at = NOW() + INTERVAL 5 MINUTE WHERE id=$CG1;" >/dev/null
OUT="$(docker compose exec -T nodered node -e "
const db=require('/data/lib/db'), svc=require('/data/lib/line-service');
const seq=[123456,123456,654321]; let i=0;
svc.issueCode(db,{kind:'patient',userId:$UA},{randomInt:()=>seq[i++]}).then(r=>{console.log(r.code+' draws='+i);return db.close&&db.close()}).catch(e=>{console.log('ERR '+e.message);process.exit(1)});
" 2>&1 | tail -1)"
expect "สุ่มได้ 123456 ซ้ำกับผู้ดูแลที่ยังไม่หมดอายุ → ต้องสุ่มใหม่" "$OUT" "654321 draws=3"
sql "UPDATE caregivers SET link_code=NULL, link_code_expires_at=NULL WHERE id=$CG1;" >/dev/null

section "nginx: editor/admin API ของ Node-RED เข้าผ่าน :8080 ไม่ได้"
not_nodered() { # not_nodered DESC URL_PATH  — เนื้อหาต้องไม่ใช่ JSON ของ Node-RED (SPA fallback เป็น 200 + index.html)
  local out; out="$(curl -s --path-as-is -m 10 "$WEB$2" -w $'\n%{http_code}')"
  local code="${out##*$'\n'}" body="${out%$'\n'*}"
  if printf '%s' "$body" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{JSON.parse(s);process.exit(0)}catch(e){process.exit(1)}})'; then
    bad "$1 $2 → ได้ JSON (HTTP $code): $(printf '%s' "$body" | head -c 80)"
  else ok "$1 $2 → ไม่ใช่ JSON ของ Node-RED (HTTP $code)"; fi
}
for p in /flows /flows/state /settings /nodes /auth/login /auth/token /red/ /red/red.min.js /context/global /library/flows /diagnostics /plugins /icons /api/../flows '/api/..%2fflows' '/api/%2e%2e/flows' '/api/../settings' //flows; do not_nodered "GET" "$p"; done
expect "ตรวจว่าตรงนี้ Node-RED จริง (ตรง :1880) /flows ตอบ JSON/401" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/flows")" "401"
expect "POST /flows ผ่าน nginx ไม่ถึง Node-RED (ไม่ใช่ 200 ที่แก้ flow)" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WEB/flows" -H 'Content-Type: application/json' -d '[]')" "405"
expect "GET /line/webhook ผ่าน nginx ไม่ใช่หน้า editor" "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/line/webhook")" "404"
PORTS="$(docker compose ps --format '{{.Service}} {{.Ports}}' 2>/dev/null)"
expect_match "พอร์ต 1880 ผูก 127.0.0.1" "$PORTS" 'nodered .*127\.0\.0\.1:1880->1880'
expect_match "พอร์ต 3306 ผูก 127.0.0.1" "$PORTS" 'db .*127\.0\.0\.1:3306->3306'
expect_match "พอร์ต 8080 คงเดิม (เปิดให้ LAN)" "$PORTS" 'frontend .*0\.0\.0\.0:8080->80'

section "log ไม่มีความลับ"
LOGS="$(docker compose logs nodered 2>&1)"
for needle in "$SECRET" "$TOKEN_LINE" "$LAST_SIG" "$LA" "$LB" "$LC" "$LG" "ผ่าน nginx" "ทดสอบซ้ำ"; do
  if printf '%s' "$LOGS" | grep -qF -- "$needle"; then bad "log มี '${needle:0:12}…'"; else ok "log ไม่มี '${needle:0:12}…'"; fi
done
expect_match "log บันทึกเหตุการณ์ LINE ได้ (line_reply status=… ไม่มี id/ข้อความ)" "$LOGS" 'line_reply status=200'

echo
echo "สรุป: ผ่าน $PASS · ไม่ผ่าน $FAIL"
[ "$FAIL" -eq 0 ]
