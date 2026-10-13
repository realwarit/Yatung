#!/usr/bin/env bash
# ทดสอบ Day 8A: GET /api/stats/adherence (ตัวเลขทุกช่องตรงตัวกับข้อมูลที่ seed ให้รู้คำตอบ) + LINE "สรุป"
#   + 8B: migration 006 tts_name (รันซ้ำได้, init = live) + API ยารับ/คืน tts_name + ไม่รั่วไป LINE  + 8C: ngsw.json ไม่มี /api, manifest, ไม่โหลดจาก CDN
# ใช้ผู้ใช้ทดสอบสุ่มแล้วลบทิ้ง (@example.test) + LINE ปลอม (scripts/fake-line.js) ไม่มี push จริง ไม่กินโควตา ; real-snapshot ตรวจผู้ใช้จริงไม่ถูกแตะ
#   bash scripts/test-day8.sh
# ข้อควรระวัง: recreate nodered 2 ครั้ง (ปิด cron จริงชั่วคราว) — อย่ารันใกล้มื้อยา ; ต้องหยุด/เริ่ม nodered หลังแก้ flows.json แล้ว

set -u
cd "$(dirname "$0")/.."
source scripts/lib/nodered-log.sh   # dump log nodered ก่อน recreate (ดู lib)
source scripts/lib/clock.sh; clock_guard 5 5   # seed ใช้รอบเวลา 00:01 / 23:58 ของวันนี้ → ห้ามรันใกล้เที่ยงคืน
BASE="${BASE:-http://localhost:1880}"
FAKE_PORT=8798
FAKE="http://localhost:$FAKE_PORT"
SECRET="test-channel-secret-day8"
TOKEN_LINE="test-access-token-day8"
PUBLIC="https://test-day8.example.dev"
TMP="$(mktemp -d)"
RUN="$RANDOM$RANDOM"
mk() { local v="U8${RUN}$1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; printf '%s' "${v:0:33}"; }
LA="$(mk a)"; LB="$(mk b)"; LG="$(mk g)"; LU="$(mk u)"

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
expect_match() { if printf '%s' "$2" | grep -qE -- "$3"; then ok "$1"; else bad "$1 (ได้ '$2' ไม่ตรง /$3/)"; fi; }
expect_nomatch() { if printf '%s' "$2" | grep -qE -- "$3"; then bad "$1 (เจอ /$3/ ใน '$2')"; else ok "$1"; fi; }
section() { echo; echo "== $1"; }

# ---------- LINE ปลอม ----------
fl() { curl -s -m 5 "$@"; }
fl_clear() { fl -X DELETE "$FAKE/_requests" >/dev/null; }
fl_config() { printf '%s' "$1" > "$TMP/cfg.json"; fl -X POST "$FAKE/_config" -H 'Content-Type: application/json' --data-binary "@$TMP/cfg.json" >/dev/null; }
fl_count() { fl "$FAKE/_requests" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).filter(r=>r.path==="/v2/bot/message/"+process.argv[1]).length))' "$1"; }
fl_last() { fl "$FAKE/_requests" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).filter(r=>r.path==="/v2/bot/message/"+process.argv[1]);const r=a[a.length-1];try{const v=eval(process.argv[2]);console.log(typeof v==="object"?JSON.stringify(v):v)}catch(e){console.log("")}})' "$1" "$2"; }
wait_n() { local kind="$1" n="$2" i; for i in $(seq 24); do [ "$(fl_count "$kind")" -ge "$n" ] && return 0; sleep 0.5; done; return 1; }
reply_text() { fl "$FAKE/_requests" | node scripts/lib/fl-text.js "$(fl_count reply)"; }   # reply ล่าสุด (Flex = altText + ทุก text component)
qr_labels() { fl_last reply 'r.body.messages[r.body.messages.length-1].quickReply.items.map(i=>i.action.label).join(",")'; }
msg_count() { fl_last reply 'r.body.messages.length'; }

wh() { # wh BODY → STATUS
  printf '%s' "$1" > "$TMP/body"
  local sig; sig="$(node -e 'const c=require("crypto"),fs=require("fs");process.stdout.write(c.createHmac("sha256",process.argv[1]).update(fs.readFileSync(process.argv[2])).digest("base64"))' "$SECRET" "$TMP/body")"
  STATUS="$(curl -s -o "$TMP/resp" -w '%{http_code}' -X POST "$BASE/line/webhook" -H 'Content-Type: application/json' -H "x-line-signature: $sig" --data-binary "@$TMP/body")"
}
evid() { node -e "console.log(require('crypto').randomUUID())"; }
ev_text() { local id; id="$(evid)"; printf '{"destination":"U0","events":[{"type":"message","source":{"type":"user","userId":"%s"},"webhookEventId":"EV%s","replyToken":"rt%s","message":{"id":"m1","type":"text","text":"%s"}}]}' "$1" "$id" "$id" "$2"; }
say() { fl_clear; wh "$(ev_text "$1" "$2")"; wait_n reply 1; REPLY="$(reply_text)"; }

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
new_user() { # new_user NAME → TOKEN_NEW, UID_NEW
  local e="test-day8-$RANDOM$RANDOM@example.test" pw
  pw="$(node -e 'console.log(require("crypto").randomBytes(9).toString("hex"))')"
  req POST /api/auth/register "" "{\"email\":\"$e\",\"password\":\"$pw\",\"display_name\":\"ผู้ทดสอบ day8 $1\"}"
  TEST_EMAILS+=("$e")
  TOKEN_NEW="$(jget 'o.token')"
  UID_NEW="$(sql "SELECT id FROM users WHERE email='$e';")"
}
mkmed() { # mkmed TOKEN NAME SLOTS_JSON [as_needed] → MED_ID (ล้างรอบที่ API สร้างอัตโนมัติ — seed เองทั้งหมด)
  local an="${4:-false}"
  req POST /api/medications "$1" "{\"name\":\"$2\",\"strength\":\"5 mg\",\"dose_per_time\":1,\"unit\":\"tablet\",\"meal_relation\":\"after\",\"as_needed\":$an,\"slots\":$3,\"total_qty\":60}"
  MED_ID="$(jget 'o.id')"
  sql "DELETE FROM dose_logs WHERE medication_id=$MED_ID;" >/dev/null
}
# ins USER MED SLOT DAYS_AGO 'HH:MM:SS' STATUS [SOURCE]
ins() {
  local src="NULL" ta="NULL"
  if [ "$6" = "taken" ]; then src="'${7:-app}'"; ta="NOW()"; fi
  sql "INSERT INTO dose_logs (medication_id, user_id, slot, scheduled_at, status, taken_at, source) VALUES ($2, $1, '$3', CONCAT(DATE_SUB(CURDATE(), INTERVAL $4 DAY), ' $5'), '$6', $ta, $src);" >/dev/null
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
source scripts/lib/real-snapshot.sh
real_snapshot_take
trap cleanup EXIT

section "เตรียม: LINE ปลอม + recreate nodered (cron จริงปิด, ตัวกรองผู้ใช้ทดสอบ)"
node scripts/fake-line.js $FAKE_PORT >"$TMP/fake.log" 2>&1 &
FAKE_PID=$!
sleep 1
fl_config "{\"profiles\":{\"$LA\":\"สมชาย ทดสอบ\",\"$LB\":\"สมหญิง ทดสอบ\",\"$LG\":\"ลูกสาว ทดสอบ\"},\"quota\":200,\"usage\":0}"
NR_ENV=(LINE_CHANNEL_SECRET="$SECRET" LINE_CHANNEL_ACCESS_TOKEN="$TOKEN_LINE" LINE_API_BASE="http://host.docker.internal:$FAKE_PORT" LINE_OA_BASIC_ID="@014rktvr" LINE_PUSH_MONTHLY_CAP=200 LINE_PUSH_RESERVE=30 LINE_QUOTA_CACHE_MS=0 PUBLIC_BASE_URL="$PUBLIC" LINE_MASCOT_URL="" REMINDER_ONLY_EMAIL_SUFFIX="@example.test")
restart_nodered "${NR_ENV[@]}" REMINDER_CRON=off || exit 1
ok "nodered พร้อม (tab 5-Dashboard โหลดแล้ว)"
expect "ไม่ใช้ NOW()/CURDATE() ในโค้ดของ stats-service (ไม่นับบรรทัดคอมเมนต์)" "$(grep -v '^[[:space:]]*//' node-red/data/lib/stats-service.js | grep -cF -e 'NOW(' -e 'CURDATE(' | tr -d '')" "0"

section "seed: ผู้ใช้ A มี dose 7 วันที่รู้คำตอบแน่นอน (+ PRN, ยาที่หยุดแล้ว, รอบ upcoming)"
new_user A; TA="$TOKEN_NEW"; UA="$UID_NEW"
mkmed "$TA" "TEST-8-ยาหลัก" '["morning","evening"]'; M1="$MED_ID"
mkmed "$TA" "TEST-8-ยากลางวัน" '["noon"]'; M2="$MED_ID"
mkmed "$TA" "TEST-8-ยาหยุดแล้ว" '["bedtime"]'; M3="$MED_ID"
mkmed "$TA" "TEST-8-PRN" '[]' true; MP="$MED_ID"
# วันนี้ (0): กินแล้ว 1 · ถึงเวลาแต่ยังไม่กิน 1 · ยังไม่ถึงเวลา 1
ins $UA $M1 morning 0 00:01:00 taken app; ins $UA $M1 evening 0 00:02:00 pending; ins $UA $M2 noon 0 23:58:00 pending
# เมื่อวาน (1): ครบ 3 ผ่าน line / caregiver / push + PRN (ต้องไม่นับ)
ins $UA $M1 morning 1 08:00:00 taken line; ins $UA $M1 evening 1 18:00:00 taken caregiver; ins $UA $M2 noon 1 12:00:00 taken push; ins $UA $MP morning 1 08:00:00 taken app
# 2 วันก่อน (2): ไม่มียา
# 3: กิน 1 · ลืม 1 · ค้าง pending ที่เลยเวลาแล้ว 1 (นับเป็น pending_due) + PRN missed (ต้องไม่นับ)
ins $UA $M1 morning 3 08:00:00 taken app; ins $UA $M1 evening 3 18:00:00 missed; ins $UA $M2 noon 3 12:00:00 pending; ins $UA $MP morning 3 08:00:00 missed
# 4: ครบ 4 (รวมยาที่หยุดแล้ว M3)
ins $UA $M1 morning 4 08:00:00 taken app; ins $UA $M1 evening 4 18:00:00 taken app; ins $UA $M2 noon 4 12:00:00 taken app; ins $UA $M3 bedtime 4 21:00:00 taken app
# 5: ลืมทั้งหมด 3
ins $UA $M1 morning 5 08:00:00 missed; ins $UA $M1 evening 5 18:00:00 missed; ins $UA $M2 noon 5 12:00:00 missed
# 6: ไม่มียา
sql "UPDATE medications SET is_active=0, end_date=CURDATE() WHERE id=$M3;" >/dev/null
ok "seed เสร็จ"

section "GET /api/stats/adherence — ตรวจสิทธิ์และพารามิเตอร์"
req GET /api/stats/adherence ""; expect "ไม่มี JWT → 401" "$STATUS" "401"
req GET /api/stats/adherence "bad.token.value"; expect "JWT ปลอม → 401" "$STATUS" "401"
for d in 6 31 0 -7 abc 7.5 1e1; do
  req GET "/api/stats/adherence?days=$d" "$TA"
  expect "days=$d → 400" "$STATUS" "400"
done
expect "400: error = VALIDATION" "$(jget 'o.error')" "VALIDATION"
expect_match "400: details เป็นภาษาไทย บอกช่วง 7–30" "$(jget 'o.details')" 'ตั้งแต่ 7 ถึง 30'
req GET "/api/stats/adherence?days=30" "$TA"; expect "days=30 → 200" "$STATUS" "200"
expect "days=30 → days[] 30 วัน" "$(jget 'o.days.length')" "30"
expect "days=30 → range.days" "$(jget 'o.range.days')" "30"
req GET "/api/stats/adherence?days=7" "$TA"; expect "days=7 → 200" "$STATUS" "200"
expect "days=7 → days[] 7 วัน" "$(jget 'o.days.length')" "7"
HDR="$(curl -s -D - -o /dev/null -H "Authorization: Bearer $TA" "$BASE/api/stats/adherence")"
expect_match "Cache-Control: private, no-store" "$HDR" 'Cache-Control: private, no-store'
req GET "/api/stats/adherence" "$TA"; expect "ไม่ส่ง days → 200 (ค่าเริ่มต้น 7)" "$(jget 'o.days.length')" "7"
SAVED="$BODY"

section "ตัวเลขทุกช่องตรงตัว (A)"
BODY="$SAVED"
expect "overall" "$(jget 'o.overall')" '{"taken":9,"missed":4,"pending_due":2,"due":15,"rate":60}'
expect "days[0..6] ตามลำดับเก่า→ใหม่: rate" "$(jget 'o.days.map(d=>d.rate)')" '[null,0,100,33,null,100,50]'
expect "days: due" "$(jget 'o.days.map(d=>d.due)')" '[0,3,4,3,0,3,2]'
expect "days: taken" "$(jget 'o.days.map(d=>d.taken)')" '[0,0,4,1,0,3,1]'
expect "days: missed" "$(jget 'o.days.map(d=>d.missed)')" '[0,3,0,1,0,0,0]'
expect "days: pending_due (ค้างที่เลยเวลาแล้ว + ถึงเวลาวันนี้)" "$(jget 'o.days.map(d=>d.pending_due)')" '[0,0,0,1,0,0,1]'
expect "days: upcoming (ไม่นับใน due)" "$(jget 'o.days.map(d=>d.upcoming)')" '[0,0,0,0,0,0,1]'
expect "is_today เฉพาะวันสุดท้าย" "$(jget 'o.days.map(d=>d.is_today)')" '[false,false,false,false,false,false,true]'
expect "วันไม่มียา rate เป็น null (ไม่ใช่ 0/100)" "$(jget '[o.days[0].rate,o.days[4].rate]')" '[null,null]'
expect "range.to = วันนี้ของ DB" "$(jget 'o.range.to')" "$(sql 'SELECT CURDATE();')"
expect "range.from = วันนี้ − 6" "$(jget 'o.range.from')" "$(sql 'SELECT DATE_SUB(CURDATE(), INTERVAL 6 DAY);')"
expect_match "label_th วันสุดท้ายเป็นรูปแบบ 'จ. 12 ต.ค.'" "$(jget 'o.days[6].label_th')" '^(อา|จ|อ|พ|พฤ|ศ|ส)\. [0-9]{1,2} (ม\.ค|ก\.พ|มี\.ค|เม\.ย|พ\.ค|มิ\.ย|ก\.ค|ส\.ค|ก\.ย|ต\.ค|พ\.ย|ธ\.ค)\.$'
expect "by_meal (เรียงเช้า→ก่อนนอน, เฉพาะมื้อที่มี due)" "$(jget 'o.by_meal')" '[{"meal":"morning","label_th":"เช้า","due":5,"taken":4,"rate":80},{"meal":"noon","label_th":"กลางวัน","due":4,"taken":2,"rate":50},{"meal":"evening","label_th":"เย็น","due":5,"taken":2,"rate":40},{"meal":"bedtime","label_th":"ก่อนนอน","due":1,"taken":1,"rate":100}]'
expect "by_medication (rate น้อย→มาก, ยาหยุดแล้วยังอยู่ + is_active=false, PRN ไม่อยู่)" "$(jget 'o.by_medication.map(m=>[m.medication_id,m.name,m.due,m.taken,m.rate,m.is_active])')" "[[$M2,\"TEST-8-ยากลางวัน\",4,2,50,true],[$M1,\"TEST-8-ยาหลัก\",10,6,60,true],[$M3,\"TEST-8-ยาหยุดแล้ว\",1,1,100,false]]"
expect "by_medication มี strength" "$(jget 'o.by_medication[0].strength')" "5 mg"
expect "by_source (แยกทุกช่องทาง ไม่มี = 0)" "$(jget 'o.by_source')" '{"app":6,"push":1,"line":1,"caregiver":1,"other":0}'
expect "streak_days (เมื่อวานครบ ข้ามวันไม่มียา หยุดที่วันที่ไม่ครบ ; วันนี้ยังไม่ครบ)" "$(jget 'o.streak_days')" "1"
expect "ไม่มี prn_taken" "$(jget '"prn_taken" in o')" "false"
expect "PRN ไม่ถูกนับ (taken ทั้งหมด = 9 ไม่ใช่ 10)" "$(jget 'o.overall.taken')" "9"
expect_match "generated_at เวลาไทย" "$(jget 'o.generated_at')" '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\+07:00$'
expect "คีย์ของ response ครบตามสเปก" "$(jget 'Object.keys(o)')" '["range","overall","days","by_meal","by_medication","by_source","streak_days","generated_at"]'

section "ยาที่หยุดใช้: หยุดผ่าน API แล้ว dose ที่ pending ถูกลบ แต่ taken/missed ยังนับ (ไม่กรอง is_active)"
mkmed "$TA" "TEST-8-หยุดผ่าน-API" '["morning"]'; M4="$MED_ID"
ins $UA $M4 morning 2 08:00:00 taken app; ins $UA $M4 morning 1 08:00:00 missed; ins $UA $M4 morning 0 00:03:00 pending
req PATCH "/api/medications/$M4/stop" "$TA"; expect "stop → 200" "$STATUS" "200"
req GET "/api/stats/adherence" "$TA"
expect "ยาที่หยุดแล้ว: taken 1, missed 1 ยังนับ · pending วันนี้ถูกลบ (due = 2)" "$(jget "o.by_medication.filter(m=>m.medication_id===$M4).map(m=>[m.due,m.taken,m.is_active])")" '[[2,1,false]]'
expect "overall รวมยาที่หยุดแล้ว" "$(jget 'o.overall')" '{"taken":10,"missed":5,"pending_due":2,"due":17,"rate":59}'
sql "DELETE FROM dose_logs WHERE medication_id=$M4;" >/dev/null; sql "DELETE FROM medications WHERE id=$M4;" >/dev/null

section "ผู้ใช้ B ไม่เห็นข้อมูลของ A"
new_user B; TB="$TOKEN_NEW"; UB="$UID_NEW"
req GET /api/stats/adherence "$TB"; expect "B → 200" "$STATUS" "200"
expect "B: overall ว่าง (rate null)" "$(jget 'o.overall')" '{"taken":0,"missed":0,"pending_due":0,"due":0,"rate":null}'
expect "B: by_medication ว่าง" "$(jget 'o.by_medication')" '[]'
expect "B: by_source เป็น 0 ทั้งหมด" "$(jget 'o.by_source')" '{"app":0,"push":0,"line":0,"caregiver":0,"other":0}'
expect "B: streak 0" "$(jget 'o.streak_days')" "0"
expect "B: days ครบ 7 วัน ทุกวัน rate null" "$(jget 'o.days.filter(d=>d.rate===null).length')" "7"
expect "A ยังเห็นของตัวเองเหมือนเดิม" "$(req GET /api/stats/adherence "$TA"; jget 'o.overall.rate')" "60"

section "ขอบเที่ยงคืน: 23:30 กับ 00:30 อยู่คนละวัน (ผ่าน clock.sh) และ \"ตอนนี้\" มาจาก JS ไม่ใช่นาฬิกาของ SQL"
new_user C; TC="$TOKEN_NEW"; UC="$UID_NEW"
mkmed "$TC" "TEST-8-ขอบเที่ยงคืน" '["morning","bedtime"]'; MC="$MED_ID"
ins $UC $MC bedtime 1 23:30:00 taken app       # เมื่อวาน 23:30
ins $UC $MC morning 0 00:30:00 pending         # วันนี้ 00:30
req GET /api/stats/adherence "$TC"
expect "23:30 ของเมื่อวานนับเป็นวันเมื่อวาน (taken)" "$(jget '[o.days[5].taken,o.days[5].due]')" '[1,1]'
expect "00:30 ของวันนี้นับเป็นวันนี้ (pending_due)" "$(jget '[o.days[6].taken,o.days[6].pending_due,o.days[6].due]')" '[0,1,1]'
RUNJS="const db=require('/data/lib/db'),S=require('/data/lib/stats-service');(async()=>{const r=await db.query('SELECT CURDATE() AS d');const d=r[0].d;const t=(x)=>new Date(d+'T'+x+'+07:00');const y=new Date(t('00:00:00').getTime()-1000*60*15);const out=[];for(const [tag,now] of [['0015',t('00:15:00')],['0045',t('00:45:00')],['yday2345',y]]){const b=(await S.adherence(db,$UC,7,now)).body;const l=b.days[6];out.push([tag,b.range.to===d,l.taken,l.pending_due,l.upcoming,l.due])}console.log(JSON.stringify(out));process.exit(0)})().catch(e=>{console.log('ERR '+e.message);process.exit(1)})"
OUT="$(docker compose exec -T nodered node -e "$RUNJS" 2>/dev/null | tail -1)"
expect "now=00:15 (ก่อน 00:30) → รอบวันนี้เป็น upcoming ไม่นับ due" "$(printf '%s' "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s)[0])))')" '["0015",true,0,0,1,0]'
expect "now=00:45 (หลัง 00:30) → pending_due 1 เปลี่ยนตาม now ที่ส่งจาก JS" "$(printf '%s' "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s)[1])))')" '["0045",true,0,1,0,1]'
expect "now=23:45 ของเมื่อวาน → 'วันนี้' เลื่อนเป็นเมื่อวาน (ช่วงเลื่อนตาม ไม่ใช่ตามนาฬิกา SQL)" "$(printf '%s' "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s)[2])))')" '["yday2345",false,1,0,0,1]'

section "LINE \"สรุป\" — ผู้ป่วย / ผู้ดูแล / สองบทบาท / ยังไม่เชื่อม (reply เท่านั้น ไม่มี push)"
sql "UPDATE users SET line_user_id='$LA', line_display_name='สมชาย' WHERE id=$UA;" >/dev/null
sql "UPDATE users SET line_user_id='$LB', line_display_name='สมหญิง' WHERE id=$UB;" >/dev/null
req POST /api/caregivers "$TA" '{"name":"ลูกสาวทดสอบ","relation":"ลูก","escalate_after_min":60}'; CG1="$(jget 'o.id')"
sql "UPDATE caregivers SET line_user_id='$LG', line_display_name='ลูกสาว' WHERE id=$CG1;" >/dev/null
req POST /api/caregivers "$TA" '{"name":"สมหญิงญาติ","relation":"ภรรยา","escalate_after_min":60}'; CG2="$(jget 'o.id')"
sql "UPDATE caregivers SET line_user_id='$LB', line_display_name='สมหญิง' WHERE id=$CG2;" >/dev/null   # B เป็นผู้ป่วยของตัวเองและผู้ดูแลของ A
fl_clear
APIRATE="$(req GET /api/stats/adherence "$TA"; jget 'o.overall.rate')"

say "$LA" "สรุป"
expect_match "ผู้ป่วย: altText มีอัตราเท่ากับ API ($APIRATE%)" "$REPLY" "📊 สรุปการกินยา 7 วัน: $APIRATE%"
expect "ผู้ป่วย: 1 ข้อความ" "$(msg_count)" "1"
expect_match "ผู้ป่วย: ข้อความระดับตาม 50–79" "$REPLY" 'ค่อยๆ เพิ่มขึ้นได้นะคะ'
expect_match "ผู้ป่วย: กินครบติดกัน 1 วัน" "$REPLY" 'กินครบติดกัน 1 วัน'
expect_match "ผู้ป่วย: สัญลักษณ์ครบ/ไม่ครบ" "$REPLY" '✓ ครบ · ✕ ไม่ครบ'
expect "ผู้ป่วย: quick reply มี 📊 สรุป" "$(qr_labels)" "📋 ยาวันนี้,📊 สรุป,📱 เปิดแอป,❓ ช่วยเหลือ"
expect "ผู้ป่วย: ปุ่มดูรายละเอียดไป /overview" "$(fl_last reply 'JSON.stringify(r.body.messages[0].contents).match(/\"uri\":\"([^\"]+)\"/)[1]')" "$PUBLIC/overview"
expect_nomatch "ผู้ป่วย: ไม่ทำให้เกิดข้อความอื่นนอกจาก reply" "$(fl_count push)" '^[1-9]'

say "$LG" "สรุป 7 วัน"
expect_match "ผู้ดูแล: ผู้ที่คุณดูแล 1 คน" "$REPLY" 'ผู้ที่คุณดูแล 1 คน'
expect_match "ผู้ดูแล: ชื่อผู้ป่วย + อัตรา" "$REPLY" 'คุณผู้ทดสอบ day8 A.*กินครบ [0-9]+% ใน 7 วัน'
expect_nomatch "ผู้ดูแล: ไม่มีชื่อยาในข้อความ" "$REPLY" 'TEST-8'
expect_nomatch "ผู้ดูแล: ไม่มีชื่อยาแม้ดูทั้ง JSON" "$(fl_last reply 'JSON.stringify(r.body.messages)')" 'TEST-8'
expect "ผู้ดูแล: quick reply" "$(qr_labels)" "📊 สรุป,❓ ช่วยเหลือ"

say "$LB" "สรุป"
expect "สองบทบาท: 2 ข้อความ" "$(msg_count)" "2"
expect_match "สองบทบาท: ของตัวเองก่อน (ยังไม่มีข้อมูล) ตามด้วยผู้ที่ดูแล" "$REPLY" '^📊 สรุปการกินยา 7 วัน: ยังไม่มีข้อมูล .*📊 สรุปการกินยา 7 วันของผู้ที่คุณดูแล 1 คน'
expect "สองบทบาท: ข้อความแรกเป็นของตัวเอง" "$(fl_last reply 'r.body.messages[0].altText')" "📊 สรุปการกินยา 7 วัน: ยังไม่มีข้อมูล"
expect_match "สองบทบาท: ข้อความที่สองเป็นของผู้ป่วยที่ดูแล" "$(fl_last reply 'r.body.messages[1].altText')" 'ผู้ที่คุณดูแล 1 คน'

say "$LU" "สรุป"
expect_match "ยังไม่เชื่อมบัญชี → วิธีเชื่อมเหมือนข้อความอื่น" "$REPLY" 'ยังไม่ได้เชื่อมบัญชี'
expect "ยังไม่เชื่อม: quick reply" "$(qr_labels)" "🔗 วิธีเชื่อมบัญชี,📱 เปิดแอป"
say "$LA" "ช่วยเหลือ"
expect_match "เมนูช่วยเหลือมีบรรทัดแนะนำ 'สรุป'" "$REPLY" 'พิมพ์ "สรุป"'
expect "ตลอดชุดนี้ไม่มี push จริงสักครั้ง (fake-line)" "$(fl_count push)" "0"

# ================= 8B: ชื่อที่ให้อ่านออกเสียง (medications.tts_name) =================
section "8B: migration 006 รันซ้ำได้ + คอลัมน์ tts_name ใน init = live"
bash scripts/migrate.sh >/dev/null 2>&1; expect "migrate.sh รันซ้ำ (ครั้งที่ 1) exit" "$?" "0"
bash scripts/migrate.sh >/dev/null 2>&1; expect "migrate.sh รันซ้ำ (ครั้งที่ 2) exit" "$?" "0"
rootsql() { docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4' 2>/dev/null <<<"$1"; }
rootsql "DROP DATABASE IF EXISTS yt_schema_test; CREATE DATABASE yt_schema_test;" >/dev/null
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 yt_schema_test' < db/init/01_schema.sql 2>/dev/null
cols() { docker compose exec -T db sh -c "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -N -B -e \"SELECT ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, IFNULL(COLUMN_DEFAULT,'NULL') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$1' AND TABLE_NAME='$2' ORDER BY ORDINAL_POSITION\"" 2>/dev/null; }
LIVE_DB="$(docker compose exec -T db sh -c 'echo $MYSQL_DATABASE' | tr -d '')"
expect "ตาราง medications: คอลัมน์ (ลำดับ/ชนิด/NULL) init = live" "$(cols yt_schema_test medications | md5sum)" "$(cols "$LIVE_DB" medications | md5sum)"
expect "tts_name เป็น VARCHAR(100) NULL" "$(sql "SELECT CONCAT(COLUMN_TYPE,' ',IS_NULLABLE) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='medications' AND COLUMN_NAME='tts_name';")" "varchar(100) YES"
rootsql "DROP DATABASE yt_schema_test;" >/dev/null

section "8B: API ยารับ/คืน tts_name (ตัดช่องว่าง, ว่าง→null, >100 → 400, PUT ไม่ส่ง = คงเดิม)"
new_user T; TT="$TOKEN_NEW"
MBODY='"dose_per_time":1,"unit":"tablet","meal_relation":"after","as_needed":false,"slots":["evening"],"total_qty":30'
req POST /api/medications "$TT" "{\"name\":\"TEST-8B-ไม่มีชื่ออ่าน\",$MBODY}"
expect "POST ไม่ส่ง tts_name → 201" "$STATUS" "201"
expect "POST ไม่ส่ง tts_name → คืน null" "$(jget 'o.tts_name')" "null"
req POST /api/medications "$TT" "{\"name\":\"TEST-8B-Amlodipine\",\"tts_name\":\"  ยาความดัน  \",$MBODY}"
expect "POST ส่ง tts_name → 201" "$STATUS" "201"
expect "POST: tts_name ถูก trim" "$(jget 'o.tts_name')" "ยาความดัน"
MT="$(jget 'o.id')"
req GET "/api/medications/$MT" "$TT"
expect "GET ยา: คืน tts_name" "$(jget 'o.tts_name')" "ยาความดัน"
req GET /api/medications "$TT"
expect "GET รายการยา: ทุกตัวมีคีย์ tts_name" "$(jget 'o.every(m => "tts_name" in m)')" "true"
req PUT "/api/medications/$MT" "$TT" "{\"name\":\"TEST-8B-Amlodipine\",$MBODY}"
expect "PUT ไม่ส่ง tts_name → 200" "$STATUS" "200"
expect "PUT ไม่ส่ง tts_name → คงค่าเดิม" "$(jget 'o.tts_name')" "ยาความดัน"
req PUT "/api/medications/$MT" "$TT" "{\"name\":\"TEST-8B-Amlodipine\",\"tts_name\":\"ยาเบาหวาน\",$MBODY}"
expect "PUT ส่ง tts_name ใหม่ → เปลี่ยน" "$(jget 'o.tts_name')" "ยาเบาหวาน"
req PUT "/api/medications/$MT" "$TT" "{\"name\":\"TEST-8B-Amlodipine\",\"tts_name\":\"   \",$MBODY}"
expect "PUT ส่ง tts_name ว่าง → null" "$(jget 'o.tts_name')" "null"
req PUT "/api/medications/$MT" "$TT" "{\"name\":\"TEST-8B-Amlodipine\",\"tts_name\":\"ยาความดัน\",$MBODY}"
req PUT "/api/medications/$MT" "$TT" "{\"name\":\"TEST-8B-Amlodipine\",\"tts_name\":null,$MBODY}"
expect "PUT ส่ง tts_name = null → ล้างค่า" "$(jget 'o.tts_name')" "null"
LONG="$(node -e 'process.stdout.write("ก".repeat(101))')"
req POST /api/medications "$TT" "{\"name\":\"TEST-8B-ยาว\",\"tts_name\":\"$LONG\",$MBODY}"
expect "tts_name 101 ตัวอักษร → 400" "$STATUS" "400"
expect_match "ข้อความ error ขึ้นต้นด้วย 'ชื่อที่ให้อ่านออกเสียง' (frontend map เข้าช่อง)" "$(jget 'o.details')" '^ชื่อที่ให้อ่านออกเสียง'
expect "ชื่อ error code = VALIDATION" "$(jget 'o.error')" "VALIDATION"
req POST /api/medications "$TT" "{\"name\":\"TEST-8B-ผิดชนิด\",\"tts_name\":5,$MBODY}"
expect "tts_name ไม่ใช่ข้อความ → 400" "$STATUS" "400"
LONG100="$(node -e 'process.stdout.write("ก".repeat(100))')"
req POST /api/medications "$TT" "{\"name\":\"TEST-8B-100\",\"tts_name\":\"$LONG100\",$MBODY}"
expect "tts_name 100 ตัวอักษร → 201" "$STATUS" "201"
expect "DB: ยาของผู้ใช้ทดสอบที่ไม่ผ่าน validation ไม่ถูกสร้าง" "$(sql "SELECT COUNT(*) FROM medications WHERE user_id=(SELECT id FROM users WHERE email='${TEST_EMAILS[${#TEST_EMAILS[@]}-1]}') AND name IN ('TEST-8B-ยาว','TEST-8B-ผิดชนิด');")" "0"

section "8B: GET /api/doses/today คืน tts_name · LINE/Web Push ไม่ใช้ tts_name"
req PUT "/api/medications/$M1" "$TA" "{\"name\":\"TEST-8-ยาหลัก\",\"tts_name\":\"ชื่ออ่านพิเศษ\",\"strength\":\"5 mg\",\"dose_per_time\":1,\"unit\":\"tablet\",\"meal_relation\":\"after\",\"as_needed\":false,\"slots\":[\"morning\",\"evening\"],\"total_qty\":60}"
expect "ตั้ง tts_name ให้ยาของ A → 200" "$STATUS" "200"
req GET /api/doses/today "$TA"
expect "doses/today: dose ของยานั้นมี tts_name" "$(jget 'o.slots.flatMap(s=>s.doses).filter(d=>d.medication_id==='"$M1"').map(d=>d.tts_name).join(",")')" "ชื่ออ่านพิเศษ,ชื่ออ่านพิเศษ"
expect "doses/today: dose ของยาที่ไม่ตั้ง tts_name = null" "$(jget 'o.slots.flatMap(s=>s.doses).filter(d=>d.medication_id==='"$M2"').map(d=>String(d.tts_name)).join(",")')" "null"
say "$LA" "วันนี้"
expect_match "LINE 'วันนี้': ยังแสดงชื่อยาจริง" "$REPLY" 'TEST-8-ยาหลัก'
expect_nomatch "LINE 'วันนี้': ไม่แสดง tts_name" "$REPLY" 'ชื่ออ่านพิเศษ'
expect_nomatch "LINE 'วันนี้': ไม่มี tts_name แม้ดูทั้ง JSON" "$(fl_last reply 'JSON.stringify(r.body.messages)')" 'ชื่ออ่านพิเศษ'
expect "โค้ดที่แตะ tts_name มีเฉพาะ medication/dose/validate (ไม่มี line-*, push, reminder, escalation, stock)" "$(grep -l 'tts_name' node-red/data/lib/*.js | xargs -n1 basename | tr '
' ' ')" "dose-service.js medication-service.js validate-medication.js "

section "C6: /api ห้ามแคช + ไม่ตอบ 304 แม้ส่ง If-None-Match มา · apple-touch-icon ที่ root"
for P in /api/medications /api/doses/today; do
  H1="$(curl -s -m 10 -D - -o /dev/null -H "Authorization: Bearer $TA" "$BASE$P")"
  expect "GET $P: Cache-Control private, no-store" "$(printf '%s' "$H1" | tr -d '\r' | grep -i '^cache-control:' | sed 's/^[^:]*: *//')" "private, no-store"
  ET="$(printf '%s' "$H1" | tr -d '\r' | grep -i '^etag:' | sed 's/^[^:]*: *//')"
  CODE="$(curl -s -m 10 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TA" -H "If-None-Match: ${ET:-W/\"x\"}" -H 'If-Modified-Since: Tue, 13 Oct 2026 00:00:00 GMT' "$BASE$P")"
  expect "GET $P พร้อม If-None-Match (${ET:+มี ETag}${ET:-ไม่มี ETag}) → 200 ไม่ใช่ 304" "$CODE" "200"
done
expect "GET /api/config (สาธารณะ): Cache-Control private, no-store" "$(curl -s -m 10 -D - -o /dev/null "$BASE/api/config" | tr -d '\r' | grep -i '^cache-control:' | sed 's/^[^:]*: *//')" "private, no-store"
expect "/line/webhook ไม่ถูกเติม Cache-Control (ไม่แตะ path นอก /api/)" "$(curl -s -m 10 -D - -o /dev/null -X POST "$BASE/line/webhook" -H 'Content-Type: application/json' -d '{}' | tr -d '\r' | grep -ci '^cache-control: private, no-store')" "0"
for F in /apple-touch-icon.png /apple-touch-icon-precomposed.png; do
  expect "เว็บ $F = 200 image/png" "$(curl -s -o /dev/null -m 10 -w '%{http_code} %{content_type}' "${WEB:-http://localhost:8080}$F")" "200 image/png"
done

# ================= 8C: PWA (ไฟล์ที่ nginx เสิร์ฟ — ต้อง docker compose up -d --build frontend ก่อนถ้าแก้ frontend) =================
section "8C: ngsw.json ไม่แคช /api · manifest · ไม่โหลดจาก CDN"
WEB_URL="${WEB:-http://localhost:8080}"
NGSW="$(curl -s -m 10 -H 'Accept: application/json' "$WEB_URL/ngsw.json")"
expect "ngsw.json เป็น JSON (ไม่ใช่หน้า HTML)" "$(printf '%s' "$NGSW" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{JSON.parse(s);console.log("json")}catch(e){console.log("not-json")}})')" "json"
expect "ngsw.json ไม่มี /api เลย (cache key ของ ngsw ไม่แยก JWT → ห้ามแคชข้อมูลผู้ใช้)" "$(printf '%s' "$NGSW" | grep -c '/api')" "0"
expect "ngsw.json ไม่มี dataGroups" "$(printf '%s' "$NGSW" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log((JSON.parse(s).dataGroups||[]).length)}catch(e){console.log("x")}})')" "0"
MANI="$(curl -s -m 10 "$WEB_URL/manifest.webmanifest")"
mget() { printf '%s' "$MANI" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const m=JSON.parse(s);const v=eval(process.argv[1]);console.log(v===undefined?"":typeof v==="object"?JSON.stringify(v):v)}catch(e){console.log("")}})' "$1"; }
expect "manifest: id" "$(mget 'm.id')" "/"
expect "manifest: start_url" "$(mget 'm.start_url')" "/today"
expect "manifest: display" "$(mget 'm.display')" "standalone"
expect "manifest: shortcuts (ยาวันนี้, สแกนซองยา)" "$(mget 'm.shortcuts.map(x=>x.name+"="+x.url).join(",")')" "ยาวันนี้=/today,สแกนซองยา=/scan"
expect "manifest: ไอคอน maskable 192 และ 512" "$(mget 'm.icons.filter(i=>i.purpose==="maskable").map(i=>i.sizes).join(",")')" "192x192,512x512"
expect "manifest: background_color เป็นสี hex (มิ้นต์จาก token)" "$(mget '/^#[0-9a-f]{6}$/i.test(m.background_color)')" "true"
expect "ไอคอน maskable 512 ดึงได้จริง (200)" "$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$WEB_URL/icons/icon-maskable-512x512.png")" "200"
expect "index.html ไม่โหลดจาก CDN ภายนอก" "$(curl -s -m 10 "$WEB_URL/" | grep -ciE 'googleapis|gstatic|cdn\.')" "0"

echo
echo "สรุป: ผ่าน $PASS · ไม่ผ่าน $FAIL"
[ "$FAIL" -eq 0 ]
