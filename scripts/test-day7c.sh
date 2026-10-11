#!/usr/bin/env bash
# ทดสอบ Day 7C: Web Push (tab 8-Push) — subscribe/upsert/ย้ายเจ้าของ/unsubscribe, ส่งทดลอง, 404/410/500, ถอดรหัส payload จริงที่ push service ปลอมรับ,
#   กฎเลือกช่องทาง (LINE / Web Push / ทั้งคู่ / ไม่มี / โควตา LINE เต็ม), จองก่อนส่ง (ไม่ซ้ำ), เตือนซ้ำ, ยาใกล้หมด, action token + POST /api/push/take,
#   payload ไม่มีชื่อยา, ไม่แตะผู้ใช้จริง, header ของ ngsw-worker.js, migration 004
# ใช้ LINE ปลอม (scripts/fake-line.js) + push service ปลอม (scripts/fake-push.js, HTTPS) + คู่คีย์ VAPID ที่สร้างในเทสนี้เอง (ไม่ใช้คีย์จาก .env)
# user ทดสอบสุ่มใหม่ทุกครั้งแล้วลบทิ้ง ; เคารพ REMINDER_ONLY_EMAIL_SUFFIX=@example.test
#   bash scripts/test-day7c.sh        (ต้อง docker compose up -d --build frontend ก่อน เพื่อให้ตรวจ ngsw-worker.js / badge-96.png ที่ build ใหม่ได้)
# ข้อควรระวัง: recreate nodered 3 ครั้ง (ปิด cron จริงชั่วคราว) — อย่ารันใกล้มื้อยา

set -u
cd "$(dirname "$0")/.."
source scripts/lib/clock.sh; clock_guard 45 5   # กันรันใกล้เที่ยงคืน (รอบกินยาข้ามวัน) ดู scripts/lib/clock.sh
BASE="${BASE:-http://localhost:1880}"
WEB="${WEB:-http://localhost:8080}"
LINE_PORT=8797
PUSH_PORT=8799
FAKE="http://localhost:$LINE_PORT"
FPUSH="https://localhost:$PUSH_PORT"
SECRET="test-channel-secret-day7c"
TOKEN_LINE="test-access-token-day7c"
PUBLIC="https://test-day7c.example.dev"
TMP="$(mktemp -d)"
TMPW="$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")"   # พาธแบบ Windows สำหรับ node (curl/bash ใช้ $TMP)
RUN="$RANDOM$RANDOM"
mkline() { local v="U7C$1${RUN}$(printf 'x%.0s' $(seq 40))"; echo "${v:0:33}"; }
LP="$(mkline p)"; LR="$(mkline r)"; LS="$(mkline s)"; LU="$(mkline u)"; LF="$(mkline f)"

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
expect_nomatch() { if printf '%s' "$2" | grep -qE "$3"; then bad "$1 (เจอ /$3/ ใน '$2')"; else ok "$1"; fi; }
section() { echo; echo "== $1"; }

# ---------- LINE ปลอม ----------
fl() { curl -s -m 5 "$@"; }
fl_clear() { fl -X DELETE "$FAKE/_requests" >/dev/null; }
fl_config() { printf '%s' "$1" > "$TMP/cfg.json"; fl -X POST "$FAKE/_config" -H 'Content-Type: application/json' --data-binary "@$TMP/cfg.json" >/dev/null; }
fl_push_n() { # จำนวน push ไปยัง LINE userId ที่ระบุ
  fl "$FAKE/_requests" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).filter(r=>r.path==="/v2/bot/message/push"&&r.body&&r.body.to===process.argv[1]).length))' "$1"; }
fl_push_total() { fl "$FAKE/_requests" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).filter(r=>r.path==="/v2/bot/message/push").length))'; }

# ---------- push service ปลอม (HTTPS) ----------
fp() { curl -sk -m 5 "$@"; }
fp_clear() { fp -X DELETE "$FPUSH/_requests" >/dev/null; }
fp_mode() { fp -X POST "$FPUSH/_config" -H 'Content-Type: application/json' -d "{\"mode\":\"$1\"}" >/dev/null; }
fp_n() { fp "$FPUSH/_requests" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).filter(r=>!process.argv[1]||r.id===process.argv[1]).length))' "${1:-}"; }
# fp_last ID EXPR → ประเมิน EXPR (ตัวแปร r = คำขอล่าสุดของ subscriber ID ; r.payload ถูกแปลงเป็น object ให้แล้วที่ r.p)
fp_last() { fp "$FPUSH/_requests" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).filter(r=>r.id===process.argv[1]);const r=a[a.length-1];if(r&&r.payload){try{r.p=JSON.parse(r.payload)}catch(e){}}try{const v=eval(process.argv[2]);console.log(typeof v==="object"?JSON.stringify(v):v)}catch(e){console.log("")}})' "$1" "$2"; }

# ---------- คู่คีย์ที่ใช้ในเทส (ไม่แตะ .env) ----------
read -r VAPID_PUB VAPID_PRIV < <(node -e '
const c=require("crypto");
const e=c.createECDH("prime256v1");e.generateKeys();
console.log(e.getPublicKey().toString("base64url")+" "+e.getPrivateKey().toString("base64url"));' | tr -d '')
SUBJECT="mailto:test-7c@yatung.example"
# subscriber ปลอม 1 ราย → ลงทะเบียนคีย์ที่ fake-push (เพื่อถอดรหัส) และเก็บ JSON ของ subscription
mksub() { # mksub ID → เขียน $TMP/sub-ID.json = { endpoint, keys:{p256dh,auth} } และลงทะเบียนที่ fake-push
  node -e '
const c=require("crypto"),fs=require("fs");
const id=process.argv[1],port=process.argv[2],dir=process.argv[3];
const e=c.createECDH("prime256v1");e.generateKeys();
const auth=c.randomBytes(16).toString("base64url");
const s={endpoint:"https://host.docker.internal:"+port+"/p/"+id,keys:{p256dh:e.getPublicKey().toString("base64url"),auth}};
fs.writeFileSync(dir+"/sub-"+id+".json",JSON.stringify(s));
fs.writeFileSync(dir+"/subreg-"+id+".json",JSON.stringify({id,privateKey:e.getPrivateKey().toString("base64url"),publicKey:s.keys.p256dh,auth}));' "$1" "$PUSH_PORT" "$TMPW"
  fp -X POST "$FPUSH/_subs" -H 'Content-Type: application/json' --data-binary "@$TMP/subreg-$1.json" >/dev/null
}
subjson() { cat "$TMP/sub-$1.json"; }
subep() { node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).endpoint)' "$TMPW/sub-$1.json"; }

# ---------- service ใน container (process แยก = เหมือน cron ที่รันซ้อนกัน) ----------
RUN_REMINDER="const db=require('/data/lib/db'),{createClient}=require('/data/lib/line-client'),rs=require('/data/lib/reminder-service'),ps=require('/data/lib/push-service').createPushService();rs.run(db,createClient(),process.env,ps).then(r=>{console.log(JSON.stringify(r));process.exit(0)}).catch(e=>{console.log('ERR '+e.message);process.exit(1)})"
RUN_FOLLOWUP="const db=require('/data/lib/db'),{createClient}=require('/data/lib/line-client'),rs=require('/data/lib/reminder-service'),ps=require('/data/lib/push-service').createPushService();rs.runFollowup(db,createClient(),process.env,ps).then(r=>{console.log(JSON.stringify(r));process.exit(0)}).catch(e=>{console.log('ERR '+e.message);process.exit(1)})"
RUN_STOCK="const db=require('/data/lib/db'),{createClient}=require('/data/lib/line-client'),ss=require('/data/lib/stock-service'),ps=require('/data/lib/push-service').createPushService();ss.run(db,createClient(),process.env,ps).then(r=>{console.log(JSON.stringify(r));process.exit(0)}).catch(e=>{console.log('ERR '+e.message);process.exit(1)})"
run_reminder() { docker compose exec -T nodered node -e "$RUN_REMINDER" 2>/dev/null | tail -1; }
run_followup() { docker compose exec -T -e REMINDER_FOLLOWUP_MIN=30 nodered node -e "$RUN_FOLLOWUP" 2>/dev/null | tail -1; }
run_stock() { docker compose exec -T nodered node -e "$RUN_STOCK" 2>/dev/null | tail -1; }
sign_token() { # sign_token UID IDS(comma) EXP_OFFSET_SEC → token ที่เซ็นด้วย JWT_SECRET ของ container
  docker compose exec -T nodered node -e "const p=require('/data/lib/push-service');console.log(p.signActionToken(process.env.JWT_SECRET,{uid:$1,ids:[$2],exp:Math.floor(Date.now()/1000)+($3)}))" 2>/dev/null | tr -d '\r' | tail -1; }

# ---------- เตรียม/เก็บกวาด ----------
TEST_EMAILS=()
FAKE_PIDS=()
restart_nodered() {
  env "$@" docker compose up -d --force-recreate nodered >/dev/null 2>&1
  for _ in $(seq 40); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/me")" = "401" ] && return 0
    sleep 1.5
  done
  echo "nodered ไม่พร้อม"; return 1
}
new_user() { # new_user NAME [line_id] → ตั้ง TOKEN_NEW และ UID_NEW
  local e="test-day7c-$RANDOM$RANDOM@example.test" pw
  pw="$(node -e 'console.log(require("crypto").randomBytes(9).toString("hex"))')"
  req POST /api/auth/register "" "{\"email\":\"$e\",\"password\":\"$pw\",\"display_name\":\"ผู้ทดสอบ day7c $1\"}"
  TEST_EMAILS+=("$e")
  TOKEN_NEW="$(jget 'o.token')"
  UID_NEW="$(sql "SELECT id FROM users WHERE email='$e';")"
  sql "UPDATE user_slot_times SET slot_time='23:59:00' WHERE user_id=$UID_NEW AND slot='bedtime';" >/dev/null   # ให้ POST ยาสร้างรอบของวันนี้เสมอ
  [ -n "${2:-}" ] && sql "UPDATE users SET line_user_id='$2', line_display_name='ผู้ป่วยทดสอบ' WHERE id=$UID_NEW;" >/dev/null
}
mkmed() { # mkmed TOKEN NAME REMAINING → ตั้ง MED_ID (ยาประจำ ก่อนนอน 1 เม็ด/วัน)
  req POST /api/medications "$1" "{\"name\":\"$2\",\"strength\":\"500 mg\",\"dose_per_time\":1,\"unit\":\"tablet\",\"meal_relation\":\"after\",\"as_needed\":false,\"slots\":[\"bedtime\"],\"total_qty\":60}"
  MED_ID="$(jget 'o.id')"
  sql "UPDATE medications SET remaining_qty=$3 WHERE id=$MED_ID;" >/dev/null
}
dose_of() { sql "SELECT id FROM dose_logs WHERE user_id=$1 ORDER BY id LIMIT 1;"; }
due() { sql "UPDATE dose_logs SET scheduled_at = NOW() - INTERVAL $2 MINUTE, status='pending', reminded_at=NULL, followup_at=NULL, taken_at=NULL, source=NULL WHERE user_id=$1;" >/dev/null; }
subscribe_as() { # subscribe_as TOKEN SUBID → POST /api/push/subscribe
  req POST /api/push/subscribe "$1" "$(subjson "$2")"
}
cleanup() {
  local e
  for e in "${TEST_EMAILS[@]}"; do sql "DELETE FROM users WHERE email='$e';"; done
  for p in "${FAKE_PIDS[@]}"; do kill "$p" 2>/dev/null; done
  rm -rf "$TMP"
  docker compose up -d --force-recreate nodered >/dev/null 2>&1
  echo; echo "== ข้อมูลผู้ใช้จริง (ต้องไม่ถูกแตะ)"
  real_snapshot_check || { echo "สรุป: ข้อมูลผู้ใช้จริงเปลี่ยน → ไม่ผ่าน"; exit 1; }
}
source scripts/lib/real-snapshot.sh   # snapshot ผู้ใช้จริงก่อน-หลัง (ดู scripts/lib/real-snapshot.sh)
real_snapshot_take
trap cleanup EXIT

section "เตรียม: migration 004 รันซ้ำได้ + init = live"
bash scripts/migrate.sh >/dev/null 2>&1; expect "migrate.sh รันซ้ำ (ครั้งที่ 1) exit" "$?" "0"
bash scripts/migrate.sh >/dev/null 2>&1; expect "migrate.sh รันซ้ำ (ครั้งที่ 2) exit" "$?" "0"
rootsql() { docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4' 2>/dev/null <<<"$1"; }
rootsql "DROP DATABASE IF EXISTS yt_schema_test; CREATE DATABASE yt_schema_test;" >/dev/null
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 yt_schema_test' < db/init/01_schema.sql 2>/dev/null
cols() { docker compose exec -T db sh -c "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -N -B -e \"SELECT ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, IFNULL(COLUMN_DEFAULT,'NULL') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$1' AND TABLE_NAME='$2' ORDER BY ORDINAL_POSITION\"" 2>/dev/null; }
LIVE_DB="$(docker compose exec -T db sh -c 'echo $MYSQL_DATABASE' | tr -d '\r')"
for t in push_subscriptions users notification_logs dose_logs; do
  expect "ตาราง $t: คอลัมน์ init = live" "$(cols yt_schema_test $t | md5sum)" "$(cols "$LIVE_DB" $t | md5sum)"
done
expect "push_subscriptions มี last_success_at, fail_count" "$(cols "$LIVE_DB" push_subscriptions | grep -cE 'last_success_at|fail_count')" "2"
expect "users.notify_both ค่าเริ่มต้น 0" "$(sql "SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='notify_both';")" "0"
rootsql "DROP DATABASE yt_schema_test;" >/dev/null

section "เตรียม: LINE ปลอม + push service ปลอม (HTTPS)"
node scripts/fake-line.js $LINE_PORT >"$TMP/fakeline.log" 2>&1 &
FAKE_PIDS+=($!)
node scripts/fake-push.js $PUSH_PORT >"$TMP/fakepush.log" 2>&1 &
FAKE_PIDS+=($!)
sleep 2
expect "fake-push ตอบ (HTTPS)" "$(fp -o /dev/null -w '%{http_code}' "$FPUSH/_requests")" "200"
fl_config "{\"profiles\":{\"$LP\":\"ผู้ป่วย พี\"},\"quota\":200,\"usage\":0}"

NR_COMMON=(LINE_CHANNEL_SECRET="$SECRET" LINE_CHANNEL_ACCESS_TOKEN="$TOKEN_LINE" LINE_API_BASE="http://host.docker.internal:$LINE_PORT" LINE_OA_BASIC_ID="@014rktvr" LINE_PUSH_MONTHLY_CAP=200 LINE_PUSH_RESERVE=30 LINE_QUOTA_CACHE_MS=0 PUBLIC_BASE_URL="$PUBLIC" LINE_MASCOT_URL="" REMINDER_ONLY_EMAIL_SUFFIX="@example.test" LOW_STOCK_QTY_PRN=5 REMINDER_CRON=off DEMO_MODE=false)

section "ยังไม่ตั้ง VAPID: public-key = 503 PUSH_NOT_CONFIGURED · ส่งทดลอง = 503"
restart_nodered "${NR_COMMON[@]}" VAPID_PUBLIC_KEY= VAPID_PRIVATE_KEY= VAPID_SUBJECT= || exit 1
ok "nodered พร้อม (VAPID ว่าง)"
new_user N; TN="$TOKEN_NEW"
req GET /api/push/public-key ""; expect "GET /api/push/public-key → 503" "$STATUS" "503"
expect "  code PUSH_NOT_CONFIGURED" "$(jget 'o.error')" "PUSH_NOT_CONFIGURED"
req POST /api/push/test "$TN"; expect "POST /api/push/test → 503" "$STATUS" "503"

section "ตั้ง VAPID (คู่คีย์ของเทสนี้) + recreate nodered"
restart_nodered "${NR_COMMON[@]}" VAPID_PUBLIC_KEY="$VAPID_PUB" VAPID_PRIVATE_KEY="$VAPID_PRIV" VAPID_SUBJECT="$SUBJECT" PUSH_ALLOW_INSECURE_TLS=true PUSH_ENDPOINT_ALLOW=host.docker.internal || exit 1
ok "nodered พร้อม (VAPID ของเทส, เครื่องปลายทางทดสอบ host.docker.internal)"

section "GET /api/push/public-key (สาธารณะ) · subscribe/unsubscribe ต้องมี JWT"
req GET /api/push/public-key ""; expect "ไม่ต้อง JWT → 200" "$STATUS" "200"
expect "  publicKey ตรงกับที่ตั้ง" "$(jget 'o.publicKey')" "$VAPID_PUB"
expect "  ไม่มี private key ใน response" "$(printf '%s' "$BODY" | grep -c "$VAPID_PRIV")" "0"
req POST /api/push/subscribe ""; expect "POST /api/push/subscribe ไม่มี JWT → 401" "$STATUS" "401"
req DELETE "/api/push/subscribe?endpoint=x" ""; expect "DELETE /api/push/subscribe ไม่มี JWT → 401" "$STATUS" "401"
req POST /api/push/test ""; expect "POST /api/push/test ไม่มี JWT → 401" "$STATUS" "401"
req PUT /api/settings/notify "" '{"notify_both":true}'; expect "PUT /api/settings/notify ไม่มี JWT → 401" "$STATUS" "401"

section "subscribe: ตรวจข้อมูล · upsert · ย้ายเจ้าของ · GET /api/me"
new_user A; TA="$TOKEN_NEW"; UA="$UID_NEW"
new_user B; TB="$TOKEN_NEW"; UB="$UID_NEW"
mksub s1; mksub s2
req POST /api/push/subscribe "$TA" '{"endpoint":"http://fcm.googleapis.com/x","keys":{"p256dh":"AAAA","auth":"BBBB"}}'; expect "endpoint ไม่ใช่ https → 400" "$STATUS" "400"
req POST /api/push/subscribe "$TA" '{"endpoint":"https://evil.example.com/x","keys":{"p256dh":"AAAA","auth":"BBBB"}}'; expect "endpoint ไม่ใช่ผู้ให้บริการ push (กัน SSRF) → 400" "$STATUS" "400"
req POST /api/push/subscribe "$TA" '{"endpoint":"https://fcm.googleapis.com/fcm/send/abc"}'; expect "ไม่มี keys → 400" "$STATUS" "400"
expect "  code VALIDATION" "$(jget 'o.error')" "VALIDATION"
subscribe_as "$TA" s1; expect "subscribe → 200" "$STATUS" "200"
expect "  subscribed + devices" "$(jget 'o.subscribed+":"+o.devices')" "true:1"
subscribe_as "$TA" s1; expect "subscribe ซ้ำ (endpoint เดิม) → ยังมี 1 แถว" "$(sql "SELECT COUNT(*) FROM push_subscriptions WHERE endpoint LIKE '%/p/s1';")" "1"
subscribe_as "$TA" s2; expect "เครื่องที่ 2 ของ A → devices 2" "$(jget 'o.devices')" "2"
req GET /api/me "$TA"
expect "GET /api/me: push_subscribed = true" "$(jget 'o.push_subscribed')" "true"
expect "  notify_both = false (ค่าเริ่มต้น)" "$(jget 'o.notify_both')" "false"
req GET /api/me "$TB"; expect "B: push_subscribed = false" "$(jget 'o.push_subscribed')" "false"
subscribe_as "$TB" s1; expect "B subscribe endpoint ของ A → ย้ายมาเป็นของ B" "$(sql "SELECT user_id FROM push_subscriptions WHERE endpoint LIKE '%/p/s1';")" "$UB"
expect "  A เหลือ 1 เครื่อง" "$(sql "SELECT COUNT(*) FROM push_subscriptions WHERE user_id=$UA;")" "1"
req PUT /api/settings/notify "$TA" '{"notify_both":"yes"}'; expect "PUT notify ไม่ใช่ boolean → 400" "$STATUS" "400"
req PUT /api/settings/notify "$TA" '{"notify_both":true}'; expect "PUT notify true → 200" "$STATUS" "200"
req GET /api/me "$TA"; expect "  GET /api/me: notify_both = true" "$(jget 'o.notify_both')" "true"
req PUT /api/settings/notify "$TA" '{"notify_both":false}'; expect "PUT notify false → 200" "$STATUS" "200"
req GET /api/me "$TB"; expect "  ของ B ไม่เปลี่ยน" "$(jget 'o.notify_both')" "false"

section "unsubscribe: ลบเฉพาะของตัวเอง (ของคนอื่น/ไม่มี = 404)"
EP2="$(subep s2)"; EP2Q="$(node -p "encodeURIComponent(process.argv[1])" "$EP2")"
req DELETE "/api/push/subscribe?endpoint=$EP2Q" "$TB"; expect "B ลบ endpoint ของ A → 404" "$STATUS" "404"
expect "  ยังอยู่" "$(sql "SELECT COUNT(*) FROM push_subscriptions WHERE endpoint LIKE '%/p/s2';")" "1"
req DELETE "/api/push/subscribe?endpoint=$EP2Q" "$TA"; expect "A ลบของตัวเอง → 200" "$STATUS" "200"
expect "  subscribed false" "$(jget 'o.subscribed')" "false"
expect "  ถูกลบจริง" "$(sql "SELECT COUNT(*) FROM push_subscriptions WHERE endpoint LIKE '%/p/s2';")" "0"
req DELETE "/api/push/subscribe" "$TA"; expect "ไม่ส่ง endpoint → 400" "$STATUS" "400"

section "POST /api/push/test: ส่งจริงไป push service ปลอม (ถอดรหัส payload + ตรวจ VAPID)"
req POST /api/push/test "$TA"; expect "A ไม่มี subscription → 409" "$STATUS" "409"
expect "  code NO_SUBSCRIPTION" "$(jget 'o.error')" "NO_SUBSCRIPTION"
subscribe_as "$TA" s2
fp_clear; fp_mode 201
req POST /api/push/test "$TA"; expect "ส่งทดลอง → 200" "$STATUS" "200"
expect "  sent=1 devices=1" "$(jget 'o.sent+":"+o.devices')" "1:1"
expect "push service ได้รับ 1 คำขอ" "$(fp_n s2)" "1"
expect "  TTL = 3600" "$(fp_last s2 'r.ttl')" "3600"
expect "  urgency = high" "$(fp_last s2 'r.urgency')" "high"
expect "  เข้ารหัส aes128gcm" "$(fp_last s2 'r.encoding')" "aes128gcm"
expect "  ลายเซ็น VAPID ถูกต้อง (ES256)" "$(fp_last s2 'r.vapid.ok')" "true"
expect "  VAPID aud = origin ของปลายทาง" "$(fp_last s2 'r.vapid.aud_ok')" "true"
expect "  VAPID exp ไม่เกิน 24 ชม." "$(fp_last s2 'r.vapid.exp_ok')" "true"
expect "  VAPID sub = VAPID_SUBJECT" "$(fp_last s2 'r.vapid.sub')" "$SUBJECT"
expect "  VAPID k = public key ที่ประกาศ" "$(fp_last s2 'r.vapid.k')" "$VAPID_PUB"
expect "  ถอดรหัส payload ได้: title" "$(fp_last s2 'r.p.notification.title')" "🔔 ทดลองแจ้งเตือนจากยาตรง"
expect "  ปุ่มแตะเปิด /settings" "$(fp_last s2 'r.p.notification.data.onActionClick.default.url')" "/settings"
expect "notification_logs: web_push สำเร็จ 1" "$(sql "SELECT COUNT(*) FROM notification_logs WHERE user_id=$UA AND channel='web_push' AND success=1;")" "1"
expect "subscription: last_success_at ถูกตั้ง" "$(sql "SELECT last_success_at IS NOT NULL FROM push_subscriptions WHERE endpoint LIKE '%/p/s2';")" "1"
expect "ไม่นับโควตา LINE (ไม่มี push ไป LINE)" "$(fl_push_total)" "0"

section "push service ตอบ 500 / 404 / 410 / 403"
fp_clear; fp_mode 500
req POST /api/push/test "$TA"; expect "500 → 502 PUSH_FAILED" "$STATUS $(jget 'o.error')" "502 PUSH_FAILED"
expect "  fail_count = 1 (ไม่ลบ)" "$(sql "SELECT fail_count FROM push_subscriptions WHERE endpoint LIKE '%/p/s2';")" "1"
fp_mode 403apple
req POST /api/push/test "$TA"; expect "403 (Apple BadJwtToken) → 502" "$STATUS" "502"
expect "  fail_count = 2" "$(sql "SELECT fail_count FROM push_subscriptions WHERE endpoint LIKE '%/p/s2';")" "2"
LOGS="$(docker compose logs nodered 2>&1)"
expect_match "  log บอกสาเหตุ 403 BadJwtToken พร้อมคำแนะนำ" "$(printf '%s' "$LOGS" | grep 'web_push_error' | tail -1)" 'status=403 reason=BadJwtToken hint=VAPID'
fp_mode 201
req POST /api/push/test "$TA"; expect "กลับมา 201 → 200" "$STATUS" "200"
expect "  fail_count รีเซ็ตเป็น 0" "$(sql "SELECT fail_count FROM push_subscriptions WHERE endpoint LIKE '%/p/s2';")" "0"
for code in 410 404; do
  fp_mode "$code"
  req POST /api/push/test "$TA"; expect "$code → 502 และลบ subscription" "$STATUS $(sql "SELECT COUNT(*) FROM push_subscriptions WHERE endpoint LIKE '%/p/s2';")" "502 0"
  expect "  notification_logs บันทึกล้มเหลว ($code)" "$(sql "SELECT COUNT(*) FROM notification_logs WHERE user_id=$UA AND channel='web_push' AND success=0 AND error_message LIKE '%$code%';")" "1"
  fp_mode 201; subscribe_as "$TA" s2
done
fp_mode 201

# ============== กฎเลือกช่องทาง ==============
section "กฎเลือกช่องทางเตือนปกติ: LINE / Web Push / ทั้งคู่ / ไม่มี / โควตา LINE เต็ม"
fl_config "{\"quota\":200,\"usage\":0}"
mksub q1; mksub r1; mksub s1x; mksub u1; mksub f1
# P: LINE อย่างเดียว · Q: Web Push อย่างเดียว · R: LINE + เครื่อง (notify_both ปิด) · S: LINE + เครื่อง + notify_both · T: ไม่มีช่องทาง · U: โควตา LINE เต็ม + เครื่อง (ทดสอบแยก)
new_user P "$LP"; TP="$TOKEN_NEW"; UP="$UID_NEW"; mkmed "$TP" "TEST-7C-ยาพี" 30
new_user Q;        TQ="$TOKEN_NEW"; UQ="$UID_NEW"; mkmed "$TQ" "TEST-7C-ยาคิว" 30; subscribe_as "$TQ" q1
new_user R "$LR";  TR="$TOKEN_NEW"; UR="$UID_NEW"; mkmed "$TR" "TEST-7C-ยาอาร์" 30; subscribe_as "$TR" r1
new_user S "$LS";  TS="$TOKEN_NEW"; US="$UID_NEW"; mkmed "$TS" "TEST-7C-ยาเอส" 30; subscribe_as "$TS" s1x
req PUT /api/settings/notify "$TS" '{"notify_both":true}'
new_user T;        TT="$TOKEN_NEW"; UT="$UID_NEW"; mkmed "$TT" "TEST-7C-ยาที" 30
fl_config "{\"profiles\":{\"$LP\":\"พี\",\"$LR\":\"อาร์\",\"$LS\":\"เอส\"},\"quota\":200,\"usage\":0}"
for u in $UP $UQ $UR $US $UT; do due "$u" 5; done
fl_clear; fp_clear
R="$(run_reminder)"
expect_match "สรุป: groups=4 (T ไม่มีช่องทาง ไม่นับ)" "$R" '"groups":4'
expect "P (LINE อย่างเดียว) ได้ LINE" "$(fl_push_n "$LP")" "1"
expect "Q (Web Push อย่างเดียว) ได้ Web Push 1" "$(fp_n q1)" "1"
expect "  Q ไม่ได้ LINE (ไม่ได้เชื่อม)" "$(sql "SELECT COUNT(*) FROM notification_logs WHERE user_id=$UQ AND channel='line_push';")" "0"
expect "R (LINE + เครื่อง, notify_both ปิด) ได้ LINE" "$(fl_push_n "$LR")" "1"
expect "  R ไม่ได้ Web Push" "$(fp_n r1)" "0"
expect "S (notify_both) ได้ LINE" "$(fl_push_n "$LS")" "1"
expect "  S ได้ Web Push ด้วย" "$(fp_n s1x)" "1"
expect "T (ไม่มีช่องทาง) ไม่ถูกจอง reminded_at" "$(sql "SELECT reminded_at IS NULL FROM dose_logs WHERE user_id=$UT;")" "1"
for u in $UP $UQ $UR $US; do expect "  จอง reminded_at แล้ว (user $u)" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE user_id=$u AND reminded_at IS NOT NULL;")" "1"; done
expect "Web Push ทั้งหมด = 2 (เฉพาะ Q และ S — P ที่เชื่อม LINE อย่างเดียวและ R ไม่ได้)" "$(fp_n)" "2"
expect "รันซ้ำทันที → ไม่ส่งซ้ำ LINE" "$(fl_clear; run_reminder >/dev/null; fl_push_total)" "0"
expect "  ไม่ส่งซ้ำ Web Push (ยังเท่าเดิม 2)" "$(fp_n)" "2"
expect "notification_logs web_push ของ Q: kind=reminder" "$(sql "SELECT COUNT(*) FROM notification_logs WHERE user_id=$UQ AND channel='web_push' AND kind='reminder' AND success=1 AND dose_log_id IS NOT NULL;")" "1"

section "payload เตือนของ Q: ไม่มีชื่อยา/ข้อมูลสุขภาพ · มีปุ่ม ✓ กินแล้ว · token ใช้ได้"
expect "title" "$(fp_last q1 'r.p.notification.title')" "⏰ ถึงเวลากินยามื้อก่อนนอนแล้ว"
expect "body" "$(fp_last q1 'r.p.notification.body')" "1 รายการ · แตะเพื่อดูและบันทึก"
expect "icon" "$(fp_last q1 'r.p.notification.icon')" "/icons/icon-192x192.png"
expect "badge" "$(fp_last q1 'r.p.notification.badge')" "/icons/badge-96.png"
expect "ปุ่ม take" "$(fp_last q1 'r.p.notification.actions[0].action+":"+r.p.notification.actions[0].title')" "take:✓ กินแล้ว"
expect "แตะตัว notification → /today" "$(fp_last q1 'r.p.notification.data.onActionClick.default.url')" "/today"
RAWQ="$(fp "$FPUSH/_requests" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).filter(r=>r.id==="q1")[0].payload)))')"
expect_nomatch "payload ไม่มีชื่อยา (TEST-7C-)" "$RAWQ" 'TEST-7C|ยาคิว'
expect_nomatch "payload ไม่มีความแรง/หน่วย (500 mg / เม็ด)" "$RAWQ" '500 ?mg|เม็ด'
TAKEURL="$(fp_last q1 'r.p.notification.data.onActionClick.take.url')"
expect_match "ปุ่ม take เปิด /today#take=<token> (fragment ไม่ใช่ query string)" "$TAKEURL" '^/today#take=[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$'
expect_nomatch "  ไม่มี ?take= ใน URL ของปุ่ม" "$TAKEURL" '[?]take='
expect_nomatch "  URL แตะตัว notification ไม่มี token" "$(fp_last q1 'r.p.notification.data.onActionClick.default.url')" 'take'
TOK="${TAKEURL#*take=}"
TOKHEAD="${TOK:0:16}"; TOKTAIL="${TOK: -16}"; TOKBODY="${TOK%%.*}"; TOKSIG="${TOK#*.}"

section "POST /api/push/take: action token (ไม่มี JWT) — บันทึกกินแล้ว · กดซ้ำไม่หักซ้ำ · ผิด/หมดอายุ/ถูกแก้ = 401"
DQ="$(dose_of "$UQ")"
BEFORE="$(sql "SELECT remaining_qty FROM medications WHERE user_id=$UQ;")"
req POST /api/push/take "" "{\"token\":\"$TOK\"}"; expect "token ถูก → 200 (ไม่ต้อง JWT)" "$STATUS" "200"
expect "  taken=1 already=0" "$(jget 'o.taken+":"+o.already')" "1:0"
expect "  dose เป็น taken source=push" "$(sql "SELECT CONCAT(status,':',source) FROM dose_logs WHERE id=$DQ;")" "taken:push"
expect "  remaining_qty ลด 1" "$(sql "SELECT remaining_qty FROM medications WHERE user_id=$UQ;")" "$((BEFORE-1))"
req POST /api/push/take "" "{\"token\":\"$TOK\"}"; expect "กดซ้ำ → 200 ไม่หักยาซ้ำ" "$STATUS $(jget 'o.taken+":"+o.already')" "200 0:1"
expect "  remaining_qty เท่าเดิม" "$(sql "SELECT remaining_qty FROM medications WHERE user_id=$UQ;")" "$((BEFORE-1))"
req POST /api/push/take "" '{"token":""}'; expect "token ว่าง → 401" "$STATUS" "401"
req POST /api/push/take "" '{}'; expect "ไม่มี token → 401" "$STATUS" "401"
req POST /api/push/take "" "{\"token\":\"${TOK:0:-3}abc\"}"; expect "token ถูกแก้ลายเซ็น → 401" "$STATUS $(jget 'o.error')" "401 INVALID_TOKEN"
EXPIRED="$(sign_token "$UR" "$(dose_of "$UR")" -10)"
req POST /api/push/take "" "{\"token\":\"$EXPIRED\"}"; expect "token หมดอายุ → 401" "$STATUS" "401"
expect_match "  ข้อความบอกว่าหมดอายุ" "$(jget 'o.details')" 'หมดอายุ'
expect "  dose ของ R ยังไม่ถูกบันทึก" "$(sql "SELECT status FROM dose_logs WHERE user_id=$UR;")" "pending"
XTOKEN="$(sign_token "$UQ" "$(dose_of "$UR")" 3600)"   # token ของ Q แต่ใส่ dose ของ R (ลายเซ็นถูก แต่ไม่ใช่ของ Q)
req POST /api/push/take "" "{\"token\":\"$XTOKEN\"}"; expect "token ของ Q + dose ของ R → ข้ามเงียบ (taken=0 already=0)" "$STATUS $(jget 'o.taken+":"+o.already')" "200 0:0"
expect "  dose ของ R ยัง pending" "$(sql "SELECT status FROM dose_logs WHERE user_id=$UR;")" "pending"
req POST /api/push/take "" "{\"token\":\"$(sign_token "$UR" "$(dose_of "$UR")" 3600)\"}"; expect "token ที่เซ็นถูกของ R → 200 taken=1" "$STATUS $(jget 'o.taken')" "200 1"

section "token ไม่รั่วลง access log: กดผ่าน nginx (:8080) แล้ว log ของ frontend (nginx) และ nodered ต้องไม่มี token (เต็ม/บางส่วน)"
TOK2="$(sign_token "$UT" "$(dose_of "$UT")" 3600)"
curl -s -o /dev/null "$WEB/today#take=$TOK2"                       # curl ไม่ส่ง fragment ไปเซิร์ฟเวอร์ (เหมือนเบราว์เซอร์)
curl -s -o /dev/null "$WEB/api/push/public-key"
curl -s -o "$TMP/t2.json" -w '%{http_code}' -X POST "$WEB/api/push/take" -H 'Content-Type: application/json' -d "{\"token\":\"$TOK2\"}" > "$TMP/t2.code"
expect "POST /api/push/take ผ่าน nginx → 200" "$(cat "$TMP/t2.code")" "200"
expect "  dose ของ T ถูกบันทึก source=push" "$(sql "SELECT CONCAT(status,':',source) FROM dose_logs WHERE user_id=$UT;")" "taken:push"
sleep 1
NGX="$(docker compose logs frontend 2>&1)"; NRL="$(docker compose logs nodered 2>&1)"
expect_match "  access log ของ nginx มีคำขอ /today และ /api/push/take (log ใช้งานได้จริง)" "$(printf '%s' "$NGX" | grep -c -E 'GET /today|POST /api/push/take')" '^[1-9]'
for pair in "เต็ม:$TOK2" "ต้น 16 ตัว:${TOK2:0:16}" "ท้าย 16 ตัว:${TOK2: -16}" "ส่วนเนื้อ:${TOK2%%.*}" "ลายเซ็น:${TOK2#*.}"; do
  n="${pair%%:*}"; v="${pair#*:}"
  if printf '%s' "$NGX" | grep -qF -- "$v"; then bad "nginx access log มี token ($n)"; else ok "nginx access log ไม่มี token ($n)"; fi
  if printf '%s' "$NRL" | grep -qF -- "$v"; then bad "log ของ nodered มี token ($n)"; else ok "log ของ nodered ไม่มี token ($n)"; fi
done
if printf '%s' "$NGX" | grep -qE 'take='; then bad "nginx access log มี 'take='"; else ok "nginx access log ไม่มี 'take='"; fi

section "โควตา LINE เต็ม + มีเครื่อง → ใช้ Web Push แทน (ไม่จอง reminded_at ฟรี) ; ไม่มีเครื่อง → ไม่จอง"
new_user U "$LU"; TU="$TOKEN_NEW"; UU="$UID_NEW"; mkmed "$TU" "TEST-7C-ยูยู" 30; subscribe_as "$TU" u1
new_user V "$LF"; TV="$TOKEN_NEW"; UV="$UID_NEW"; mkmed "$TV" "TEST-7C-ยาวี" 30   # LINE อย่างเดียว ไม่มีเครื่อง
fl_config "{\"profiles\":{\"$LU\":\"ยู\",\"$LF\":\"วี\"},\"quota\":200,\"usage\":175}"   # cap 200 − reserve 30 = หยุดที่ 170
due "$UU" 5; due "$UV" 5; fl_clear; fp_clear
R="$(run_reminder)"
expect "U: ไม่ส่ง LINE" "$(fl_push_n "$LU")" "0"
expect "  ส่ง Web Push แทน" "$(fp_n u1)" "1"
expect "  จอง reminded_at" "$(sql "SELECT reminded_at IS NOT NULL FROM dose_logs WHERE user_id=$UU;")" "1"
expect "V: ไม่ส่ง LINE (โควตาเต็ม ไม่มีเครื่องสำรอง)" "$(fl_push_n "$LF")" "0"
expect "  ไม่จอง reminded_at (ลองใหม่ได้)" "$(sql "SELECT reminded_at IS NULL FROM dose_logs WHERE user_id=$UV;")" "1"
fl_config "{\"quota\":200,\"usage\":0}"

section "รันซ้อนกัน 2 process → LINE 1 + Web Push 1 ต่อผู้ใช้ (จองก่อนส่งตัวเดียวกัน)"
due "$US" 5; fl_clear; fp_clear
run_reminder >/dev/null &
P1=$!
run_reminder >/dev/null &
P2=$!
wait $P1 $P2
expect "S: LINE รวม 2 process = 1" "$(fl_push_n "$LS")" "1"
expect "S: Web Push รวม 2 process = 1" "$(fp_n s1x)" "1"

section "เตือนซ้ำ (REMINDER_FOLLOWUP_MIN=30): Web Push หัวข้อ 'ยังไม่ได้กินยา…' ครั้งเดียว"
sql "UPDATE dose_logs SET status='pending', taken_at=NULL, source=NULL, scheduled_at=NOW() - INTERVAL 40 MINUTE, reminded_at=NOW() - INTERVAL 35 MINUTE, followup_at=NULL WHERE user_id=$UQ;" >/dev/null
fl_clear; fp_clear
R="$(run_followup)"
expect_match "สรุป followup: push_sent ≥ 1" "$R" '"push_sent":[1-9]'
expect "Q ได้ Web Push เตือนซ้ำ 1" "$(fp_n q1)" "1"
expect "  title" "$(fp_last q1 'r.p.notification.title')" "⏰ ยังไม่ได้กินยามื้อก่อนนอนนะคะ"
expect "  มีปุ่ม กินแล้ว" "$(fp_last q1 'r.p.notification.actions[0].action')" "take"
expect "  จอง followup_at" "$(sql "SELECT followup_at IS NOT NULL FROM dose_logs WHERE user_id=$UQ;")" "1"
fp_clear; run_followup >/dev/null
expect "รันซ้ำ → ไม่ส่งซ้ำ" "$(fp_n q1)" "0"

section "ยาใกล้หมด: Web Push สำหรับคนไม่เชื่อม LINE · ทั้งสองทางเมื่อ notify_both · ครั้งเดียว"
sql "UPDATE medications SET remaining_qty=3, refill_alerted_at=NULL WHERE user_id IN ($UQ,$US,$UR);" >/dev/null
fl_clear; fp_clear
R="$(run_stock)"
expect "Q (ไม่เชื่อม LINE) ได้ Web Push ยาใกล้หมด" "$(fp_n q1)" "1"
expect "  title" "$(fp_last q1 'r.p.notification.title')" "💊 ยาใกล้หมดแล้วนะคะ"
expect "  body" "$(fp_last q1 'r.p.notification.body')" "1 รายการ · แตะเพื่อดูและเติมยา"
expect "  ปุ่มแตะเปิด /medications" "$(fp_last q1 'r.p.notification.data.onActionClick.default.url')" "/medications"
RAWL="$(fp "$FPUSH/_requests" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).filter(r=>r.id==="q1")[0].payload)))')"
expect_nomatch "  ไม่มีชื่อยา" "$RAWL" 'TEST-7C|ยาคิว'
expect "S (notify_both) ได้ทั้ง LINE และ Web Push" "$(fl_push_n "$LS"):$(fp_n s1x)" "1:1"
expect "R (LINE, notify_both ปิด) ได้ LINE อย่างเดียว" "$(fl_push_n "$LR"):$(fp_n r1)" "1:0"
expect "notification_logs low_stock web_push (Q)" "$(sql "SELECT COUNT(*) FROM notification_logs WHERE user_id=$UQ AND channel='web_push' AND kind='low_stock' AND success=1;")" "1"
fl_clear; fp_clear; run_stock >/dev/null
expect "รันซ้ำ → ไม่ส่งซ้ำ (จองก่อนส่ง)" "$(fl_push_total):$(fp_n)" "0:0"

section "ไม่แตะผู้ใช้จริง + log ไม่มีความลับ"
LOGS="$(docker compose logs nodered 2>&1)"
for needle in "$VAPID_PRIV" "$SECRET" "$TOKEN_LINE" "$LP" "$LS" "/p/q1" "/p/s1x" "$TOK"; do
  if printf '%s' "$LOGS" | grep -qF -- "$needle"; then bad "log มี '${needle:0:14}…'"; else ok "log ไม่มี '${needle:0:14}…'"; fi
done
if printf '%s' "$LOGS" | grep -qE 'TEST-7C-'; then bad "log มีชื่อยา"; else ok "log ไม่มีชื่อยา"; fi
if printf '%s' "$LOGS" | grep -qE 'eyJ[A-Za-z0-9_-]{10,}\.eyJ'; then bad "log มี JWT"; else ok "log ไม่มี JWT"; fi

section "nginx / ngsw: ngsw-worker.js, ngsw.json, manifest ไม่แคชยาว · ไม่มี CSP บล็อก SW · ไอคอน badge"
for f in ngsw-worker.js ngsw.json manifest.webmanifest; do
  H="$(curl -sI "$WEB/$f")"
  expect "$f → 200" "$(printf '%s' "$H" | head -1 | awk '{print $2}')" "200"
  expect_match "  Cache-Control: no-cache" "$H" '[Cc]ache-[Cc]ontrol: no-cache'
  expect_nomatch "  ไม่มี max-age ยาว" "$H" 'max-age=31536000'
  expect_nomatch "  ไม่มี Content-Security-Policy" "$H" '[Cc]ontent-[Ss]ecurity-[Pp]olicy'
done
expect_match "ngsw-worker.js เป็น JavaScript (ไม่ใช่ HTML)" "$(curl -sI "$WEB/ngsw-worker.js" | grep -i '^content-type')" 'javascript'
expect "ngsw-worker.js เนื้อหาขึ้นต้นเป็นโค้ด ไม่ใช่ HTML" "$(curl -s "$WEB/ngsw-worker.js" | head -c 200 | grep -ci '<!doctype\|<html')" "0"
expect_match "manifest.webmanifest มี display standalone" "$(curl -s "$WEB/manifest.webmanifest")" '"display": ?"standalone"'
expect "badge-96.png เป็น image/png" "$(curl -sI "$WEB/icons/badge-96.png" | grep -i '^content-type' | tr -d '\r' | awk '{print tolower($2)}')" "image/png"
expect "icon-192x192.png เป็น image/png" "$(curl -sI "$WEB/icons/icon-192x192.png" | grep -i '^content-type' | tr -d '\r' | awk '{print tolower($2)}')" "image/png"
expect "ngsw.json ไม่ใช่ SPA fallback (เป็น JSON ที่มี assetGroups)" "$(curl -s "$WEB/ngsw.json" | grep -c 'assetGroups')" "1"
expect "/api/push/public-key ผ่าน nginx (:8080) ได้ 200" "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/api/push/public-key")" "200"

echo
echo "สรุป: ผ่าน $PASS · ไม่ผ่าน $FAIL"
[ "$FAIL" -eq 0 ]
