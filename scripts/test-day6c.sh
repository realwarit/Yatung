#!/usr/bin/env bash
# ทดสอบ Day 6C: ข้อความ LINE ชุดใหม่ (Flex/text + quick reply), "วันนี้" ทุกสถานะ, ปุ่ม "กินแล้ว" (สำเร็จ/ซ้ำ/หาไม่เจอ),
#              ช่วยเหลือ/วิธีใช้, #ตัวอย่าง (DEMO เปิด/ปิด), ปุ่มเดโมเลือกกลุ่มใกล้เวลาปัจจุบันที่สุด, สคริปต์ rich menu, line-validate, รูปมาสคอตผ่าน nginx,
#              และ snapshot ผู้ใช้จริงไม่เปลี่ยน (ข้อ 0.1: รันเทสด้วย REMINDER_ONLY_EMAIL_SUFFIX=@example.test)
# ใช้ LINE ปลอม (scripts/fake-line.js) ไม่ส่งข้อความจริง ; user ทดสอบสุ่มใหม่ทุกครั้งแล้วลบทิ้งตอนจบ
#   bash scripts/test-day6c.sh
# ข้อควรระวัง: สคริปต์ recreate nodered 3 ครั้ง (LINE ปลอม DEMO เปิด / DEMO ปิด / คืนค่าตาม .env) — ระหว่างนั้น cron จริงปิด (REMINDER_CRON=off)
#   ต้องมี frontend ที่ build ล่าสุด (รูปมาสคอตหลายท่าผ่าน nginx): docker compose up -d --build frontend

set -u
cd "$(dirname "$0")/.."
BASE="${BASE:-http://localhost:1880}"
WEB="${WEB:-http://localhost:8080}"
FAKE_PORT=8798
FAKE="http://localhost:$FAKE_PORT"
SECRET="test-channel-secret-day6c"
TOKEN_LINE="test-access-token-day6c"
PUBLIC="https://test-day6c.example.dev"
TMP="$(mktemp -d)"
RUN="$RANDOM$RANDOM"
mk() { local v="U6C${RUN}$1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; printf '%s' "${v:0:33}"; }
LA="$(mk a)"; LB="$(mk b)"; LC="$(mk c)"; LU="$(mk u)"; LD="$(mk d)"

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
section() { echo; echo "== $1"; }

# ---------- LINE ปลอม ----------
fl() { curl -s -m 5 "$@"; }
fl_clear() { fl -X DELETE "$FAKE/_requests" >/dev/null; }
fl_config() { printf '%s' "$1" > "$TMP/cfg.json"; fl -X POST "$FAKE/_config" -H 'Content-Type: application/json' --data-binary "@$TMP/cfg.json" >/dev/null; }
fl_count() { fl "$FAKE/_requests" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).filter(r=>r.path==="/v2/bot/message/"+process.argv[1]).length))' "$1"; }
fl_last() { fl "$FAKE/_requests" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).filter(r=>r.path==="/v2/bot/message/"+process.argv[1]);const r=a[a.length-1];try{const v=eval(process.argv[2]);console.log(typeof v==="object"?JSON.stringify(v):v)}catch(e){console.log("")}})' "$1" "$2"; }
wait_n() { local kind="$1" n="$2" i; for i in $(seq 24); do [ "$(fl_count "$kind")" -ge "$n" ] && return 0; sleep 0.5; done; return 1; }
# ข้อความที่ผู้ใช้เห็นของ reply ล่าสุด (Flex = altText + ทุก text component) รวมเป็นบรรทัดเดียว
reply_text() { fl "$FAKE/_requests" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).filter(r=>r.path==="/v2/bot/message/reply");const r=a[a.length-1];const out=[];const col=(o)=>{if(Array.isArray(o))o.forEach(col);else if(o&&typeof o==="object"){if(o.type==="text"&&typeof o.text==="string")out.push(o.text);Object.values(o).forEach(col)}};for(const m of(r?r.body.messages:[])){if(m.type==="flex"){out.push(m.altText);col(m.contents)}else out.push(m.text)}console.log(out.join(" | ").replace(/\s+/g," "))})'; }
qr_labels() { fl_last reply 'r.body.messages[r.body.messages.length-1].quickReply.items.map(i=>i.action.label).join(",")'; }

# ---------- webhook ----------
wh() { # wh BODY → STATUS
  printf '%s' "$1" > "$TMP/body"
  local sig; sig="$(node -e 'const c=require("crypto"),fs=require("fs");process.stdout.write(c.createHmac("sha256",process.argv[1]).update(fs.readFileSync(process.argv[2])).digest("base64"))' "$SECRET" "$TMP/body")"
  STATUS="$(curl -s -o "$TMP/resp" -w '%{http_code}' -X POST "$BASE/line/webhook" -H 'Content-Type: application/json' -H "x-line-signature: $sig" --data-binary "@$TMP/body")"
}
evid() { node -e "console.log(require('crypto').randomUUID())"; }
ev_text() { local id; id="$(evid)"; printf '{"destination":"U0","events":[{"type":"message","source":{"type":"user","userId":"%s"},"webhookEventId":"EV%s","replyToken":"rt%s","message":{"id":"m1","type":"text","text":"%s"}}]}' "$1" "$id" "$id" "$2"; }
ev_postback() { local id; id="$(evid)"; printf '{"destination":"U0","events":[{"type":"postback","source":{"type":"user","userId":"%s"},"webhookEventId":"EV%s","replyToken":"rt%s","postback":{"data":"%s"}}]}' "$1" "$id" "$id" "$2"; }
ev_follow() { local id; id="$(evid)"; printf '{"destination":"U0","events":[{"type":"follow","source":{"type":"user","userId":"%s"},"webhookEventId":"EV%s","replyToken":"rt%s"}]}' "$1" "$id" "$id"; }
# say LINE_ID TEXT / press LINE_ID DATA / follow LINE_ID → ส่งแล้วรอ reply 1 ครั้ง (ไม่มี reply = REPLY ว่าง)
say() { fl_clear; wh "$(ev_text "$1" "$2")"; wait_n reply 1; REPLY="$(reply_text)"; }
press() { fl_clear; wh "$(ev_postback "$1" "$2")"; wait_n reply 1; REPLY="$(reply_text)"; }
follow() { fl_clear; wh "$(ev_follow "$1")"; wait_n reply 1; REPLY="$(reply_text)"; }

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
new_user() { # new_user NAME → ตั้ง TOKEN_NEW และ UID_NEW
  local e="test-day6c-$RANDOM$RANDOM@example.test" pw
  pw="$(node -e 'console.log(require("crypto").randomBytes(9).toString("hex"))')"
  req POST /api/auth/register "" "{\"email\":\"$e\",\"password\":\"$pw\",\"display_name\":\"ผู้ทดสอบ day6c $1\"}"
  TEST_EMAILS+=("$e")
  TOKEN_NEW="$(jget 'o.token')"
  UID_NEW="$(sql "SELECT id FROM users WHERE email='$e';")"
  sql "UPDATE user_slot_times SET slot_time='23:59:00' WHERE user_id=$UID_NEW AND slot='bedtime';" >/dev/null
}
# mkdose USER_ID MED_NAME SLOT 'HH:MM:SS' [status] → แทรกรอบของวันนี้ตรงๆ (ใช้ยาที่สร้างไว้ชื่อ MED_NAME ของ user นั้น) ตั้ง LAST_DOSE
mkmed() { # mkmed TOKEN NAME → MED_ID (ยา bedtime 1 เม็ดหลังอาหาร ไม่มีรอบแล้วค่อยแทรกเอง)
  req POST /api/medications "$1" "{\"name\":\"$2\",\"strength\":\"500 mg\",\"dose_per_time\":1,\"unit\":\"tablet\",\"meal_relation\":\"after\",\"as_needed\":false,\"slots\":[\"bedtime\"],\"total_qty\":30}"
  MED_ID="$(jget 'o.id')"
}
mkdose() { # mkdose USER MED SLOT TIME [status]
  if [ "${5:-pending}" = "taken" ]; then
    sql "INSERT INTO dose_logs (medication_id, user_id, slot, scheduled_at, status, taken_at, source) VALUES ($2, $1, '$3', CONCAT(CURDATE(), ' $4'), 'taken', NOW(), 'app');" >/dev/null
  else
    sql "INSERT INTO dose_logs (medication_id, user_id, slot, scheduled_at, status) VALUES ($2, $1, '$3', CONCAT(CURDATE(), ' $4'), '${5:-pending}');" >/dev/null
  fi
  LAST_DOSE="$(sql "SELECT id FROM dose_logs WHERE medication_id=$2 AND scheduled_at=CONCAT(CURDATE(), ' $4');")"
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

section "เตรียม: LINE ปลอม + recreate nodered (DEMO_MODE=true, cron จริงปิด, ตัวกรอง REMINDER_ONLY_EMAIL_SUFFIX=@example.test)"
node scripts/fake-line.js $FAKE_PORT >"$TMP/fake.log" 2>&1 &
FAKE_PID=$!
sleep 1
fl_config "{\"profiles\":{\"$LA\":\"สมชาย ทดสอบ\",\"$LB\":\"สมหญิง ทดสอบ\",\"$LC\":\"ลูกสาว ทดสอบ\",\"$LD\":\"ดี ทดสอบ\"},\"quota\":200,\"usage\":0}"
NR_ENV=(LINE_CHANNEL_SECRET="$SECRET" LINE_CHANNEL_ACCESS_TOKEN="$TOKEN_LINE" LINE_API_BASE="http://host.docker.internal:$FAKE_PORT" LINE_OA_BASIC_ID="@014rktvr" LINE_PUSH_MONTHLY_CAP=200 LINE_PUSH_RESERVE=30 PUBLIC_BASE_URL="$PUBLIC" LINE_ASSET_BASE="" LINE_MASCOT_URL="" REMINDER_ONLY_EMAIL_SUFFIX="@example.test" REMINDER_CRON=off)
restart_nodered "${NR_ENV[@]}" DEMO_MODE=true || exit 1
ok "nodered พร้อม"
expect "env ตัวกรองถูกส่งเข้า container" "$(docker compose exec -T nodered printenv REMINDER_ONLY_EMAIL_SUFFIX | tr -d '\r')" "@example.test"
new_user A; TA="$TOKEN_NEW"; UA="$UID_NEW"
new_user B; TB="$TOKEN_NEW"; UB="$UID_NEW"
new_user D; TD="$TOKEN_NEW"; UD="$UID_NEW"
UREAL="$(sql "SELECT COUNT(*) FROM users WHERE email NOT LIKE '%@example.test';")"
expect "มีผู้ใช้จริงในฐานข้อมูล (ที่ต้องไม่ถูกแตะ) หรือ 0 ก็ได้" "$([ "${UREAL:-0}" -ge 0 ] && echo yes)" "yes"

section "follow: ยังไม่เชื่อม → Flex ต้อนรับ 3 ขั้นตอน + quick reply"
follow "$LU"
expect "reply 1 ครั้ง เป็น flex" "$(fl_last reply 'r.body.messages[0].type')" "flex"
expect_match "ข้อความต้อนรับ" "$REPLY" 'สวัสดีค่ะ.*เริ่มใช้ 3 ขั้นตอน.*1️⃣.*2️⃣.*3️⃣'
expect "รูปท่าสวัสดี (mascot-hello) จาก PUBLIC_BASE_URL/line" "$(fl_last reply 'JSON.stringify(r.body.messages[0].contents.header).match(/https:[^\"]+png/)[0]')" "$PUBLIC/line/mascot-hello.png"
expect "ปุ่มเปิดแอปไปหน้า /settings" "$(fl_last reply 'JSON.stringify(r.body.messages[0].contents.footer).match(/https:[^\"]+/)[0]')" "$PUBLIC/settings"
expect "quick reply (ยังไม่เชื่อม)" "$(qr_labels)" "🔗 วิธีเชื่อมบัญชี,📱 เปิดแอป"
expect "  ไม่มี push (reply ไม่เสียโควตา)" "$(fl_count push)" "0"

section "เชื่อมบัญชี: ผู้ป่วย / ผู้ดูแล / รหัสผิด / ผิดเกินกำหนด / ชนกับผู้ป่วยอื่น"
req POST /api/line/link-code "$TA"; CODE_A="$(jget 'o.code')"
say "$LA" "$CODE_A"
expect_match "ผู้ป่วยส่งรหัส → Flex เชื่อมสำเร็จ + ชื่อ" "$REPLY" '🎉 เชื่อมสำเร็จแล้วค่ะ.*เชื่อมสำเร็จแล้วค่ะ 🎉.*สวัสดีคุณ สมชาย ทดสอบ'
expect "  ปุ่ม 📋 ดูยาวันนี้ ส่งข้อความ 'วันนี้'" "$(fl_last reply 'JSON.stringify(r.body.messages[0].contents.footer).match(/\"text\":\"[^\"]+\"/)[0]')" '"text":"วันนี้"'
expect "  quick reply (ผู้ป่วย)" "$(qr_labels)" "📋 ยาวันนี้,📱 เปิดแอป,❓ ช่วยเหลือ"
follow "$LA"
expect_match "follow ซ้ำของผู้ป่วยที่เชื่อมแล้ว → วิธีใช้ (ไม่ใช่ขั้นตอนเชื่อม)" "$REPLY" 'วิธีใช้น้องยาตรงนะคะ'
req POST /api/caregivers "$TA" '{"name":"ลูกสาว","escalate_after_min":90}'; CG="$(jget 'o.id')"
req POST "/api/caregivers/$CG/link-code" "$TA"; CODE_C="$(jget 'o.code')"
say "$LC" "$CODE_C"
expect_match "ผู้ดูแลส่งรหัส → Flex เชื่อมเป็นผู้ดูแล + กี่นาที" "$REPLY" 'เชื่อมเป็นผู้ดูแลแล้วค่ะ 💚.*ผู้ดูแลของคุณ ผู้ทดสอบ day6c A.*เกิน 90 นาที'
expect "  quick reply (ผู้ดูแลอย่างเดียว)" "$(qr_labels)" "❓ ช่วยเหลือ"
say "$LU" "123456"
expect_match "รหัสผิด → ข้อความ text" "$REPLY" '🤔 รหัสนี้ใช้ไม่ได้ค่ะ รหัสใช้ได้ภายใน 10 นาทีเท่านั้น'
expect "  quick reply (ยังไม่เชื่อม)" "$(qr_labels)" "🔗 วิธีเชื่อมบัญชี,📱 เปิดแอป"
for i in 1 2 3 4; do say "$LU" "12345$i"; done
say "$LU" "654321"
expect_match "ผิดเกิน 5 ครั้ง → ลองหลายครั้งเกินไป" "$REPLY" '⏳ ลองหลายครั้งเกินไปค่ะ'
req POST /api/line/link-code "$TB"; CODE_B="$(jget 'o.code')"
say "$LA" "$CODE_B"
expect_match "LINE ที่เชื่อมผู้ป่วยอื่นแล้ว ส่งรหัสของ B → conflict" "$REPLY" '🔒 LINE นี้เชื่อมกับผู้ป่วยคนอื่นแล้วค่ะ'
sql "UPDATE users SET line_user_id='$LB', line_display_name='สมหญิง ทดสอบ' WHERE id=$UB;" >/dev/null

section "'วันนี้' ทุกสถานะ"
say "$LA" "วันนี้"
expect_match "ไม่มียา → Flex 'วันนี้ไม่มียาที่ต้องกินค่ะ 🌿'" "$REPLY" 'ยาของวันนี้: ไม่มียาที่ต้องกิน.*วันนี้ไม่มียาที่ต้องกินค่ะ 🌿'
expect "  ปุ่มเปิดแอปไป /today" "$(fl_last reply 'JSON.stringify(r.body.messages[0].contents.footer).match(/https:[^\"]+/)[0]')" "$PUBLIC/today"
mkmed "$TA" "TEST-6C-ยาเช้า"; M1="$MED_ID"
mkmed "$TA" "TEST-6C-ยาเย็น"; M2="$MED_ID"
sql "DELETE FROM dose_logs WHERE user_id=$UA;" >/dev/null
mkdose "$UA" "$M1" morning "00:01:00" taken; D_TAKEN="$LAST_DOSE"
mkdose "$UA" "$M2" noon "00:02:00" missed; D_MISSED="$LAST_DOSE"
mkdose "$UA" "$M1" evening "00:03:00"; D_LATE="$LAST_DOSE"
mkdose "$UA" "$M2" bedtime "23:59:00"; D_WAIT="$LAST_DOSE"
say "$LA" "วันนี้"
expect "Flex 'วันนี้' (บางส่วน)" "$(fl_last reply 'r.body.messages[0].type')" "flex"
expect_match "  ความคืบหน้า 1 จาก 4 (นับ missed ใน total เหมือนวงกลมของเว็บ)" "$REPLY" 'กินแล้ว 1 จาก 4 รายการ'
expect_match "  ป้ายสถานะครบ 3 แบบ" "$REPLY" '✅ กินแล้ว.*⏰ ยังไม่ได้กิน.*⏰ ยังไม่ได้กิน.*🕒 รอเวลา'
expect_match "  ชื่อยาที่ยังไม่กินอยู่ใต้มื้อ" "$REPLY" '• TEST-6C-ยาเย็น 500 mg.*• TEST-6C-ยาเช้า 500 mg'
expect_match "  วันที่ไทยแบบสั้น (วัน ที่ เดือน)" "$REPLY" '(อา\.|จ\.|อ\.|พ\.|พฤ\.|ศ\.|ส\.) [0-9]+ (ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)'
expect "  quick reply (ผู้ป่วย)" "$(qr_labels)" "📋 ยาวันนี้,📱 เปิดแอป,❓ ช่วยเหลือ"
expect "  altText ไม่เกิน 400" "$(fl_last reply 'r.body.messages[0].altText.length<=400')" "true"
sql "UPDATE dose_logs SET status='taken', taken_at=NOW(), source='app' WHERE user_id=$UA;" >/dev/null
say "$LA" "วันนี้"
expect_match "กินครบ → ชมด้วย mascot-cheer" "$REPLY" 'กินครบทุกรายการแล้ว.*กินแล้ว 4 จาก 4 รายการ.*วันนี้กินครบทุกรายการแล้ว เก่งมากค่ะ 🌟'
expect "  รูปท่าดีใจ" "$(fl_last reply 'JSON.stringify(r.body.messages[0].contents.header).match(/mascot-[a-z]+/)[0]')" "mascot-cheer"
say "$LC" "วันนี้"
expect_match "ผู้ดูแลอย่างเดียว → text บอกว่าเป็นผู้ดูแลของใคร" "$REPLY" '💚 คุณเป็นผู้ดูแลของ ผู้ทดสอบ day6c A.*จะแจ้งที่แชทนี้'
expect "  quick reply (ผู้ดูแล)" "$(qr_labels)" "❓ ช่วยเหลือ"
say "$LU" "วันนี้"
expect_match "ยังไม่เชื่อม → วิธีเชื่อมแบบสั้น" "$REPLY" '🔗 ยังไม่ได้เชื่อมบัญชีค่ะ.*รับรหัสเชื่อม LINE'

section "ปุ่ม 'กินแล้ว': สำเร็จ / ซ้ำ / หาไม่เจอ"
sql "UPDATE dose_logs SET status='pending', taken_at=NULL, source=NULL WHERE id IN ($D_TAKEN,$D_MISSED,$D_LATE,$D_WAIT);" >/dev/null
sql "UPDATE medications SET remaining_qty=30 WHERE user_id=$UA;" >/dev/null
press "$LA" "a=take&d=$D_TAKEN,$D_MISSED"
expect "กด 2 รายการ → Flex เล็ก" "$(fl_last reply 'r.body.messages[0].type')" "flex"
expect_match "  ชื่อยา + เวลาบันทึก + ความคืบหน้า" "$REPLY" 'เก่งมากเลยค่ะ! 🎉.*✅ TEST-6C-ยาเช้า 500 mg.*✅ TEST-6C-ยาเย็น 500 mg.*🕖 บันทึกเมื่อ [0-2][0-9]:[0-5][0-9] น\..*กินแล้ว [0-9] จาก 4 รายการ'
expect_match "  ยังมีมื้อถัดไป (ก่อนนอน 23:59 ที่ยังไม่ถึงเวลา)" "$REPLY" '🌙 มื้อถัดไป: ก่อนนอน 23:59 น\.'
expect "  source = line" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE id IN ($D_TAKEN,$D_MISSED) AND source='line' AND status='taken';")" "2"
expect "  quick reply (ผู้ป่วย)" "$(qr_labels)" "📋 ยาวันนี้,📱 เปิดแอป,❓ ช่วยเหลือ"
press "$LA" "a=take&d=$D_TAKEN,$D_MISSED"
expect "กดซ้ำ → text 'บันทึกไว้แล้วค่ะ' (ไม่หักสต็อกซ้ำ)" "$REPLY" "✅ บันทึกไว้แล้วค่ะ น้องยาตรงจำไว้ให้แล้ว ไม่ต้องกดซ้ำนะคะ"
expect "  สต็อกยาเช้าลด 1 ครั้งเดียว" "$(sql "SELECT remaining_qty FROM medications WHERE id=$M1;")" "29.00"
sql "UPDATE dose_logs SET status='taken', taken_at=NOW(), source='app' WHERE id=$D_LATE;" >/dev/null
press "$LA" "a=take&d=$D_WAIT"
expect_match "กินรอบสุดท้ายครบ → 'วันนี้กินครบทุกรายการแล้ว 🌟' และไม่มีมื้อถัดไป" "$REPLY" 'กินแล้ว 4 จาก 4 รายการ.*วันนี้กินครบทุกรายการแล้ว 🌟'
press "$LA" "a=take&d=99999999"
expect_match "รหัสรอบที่ไม่มีอยู่ → 'ไม่พบรายการยานี้แล้ว'" "$REPLY" '🔍 ไม่พบรายการยานี้แล้วค่ะ อาจถูกแก้ไขในแอป'
req PATCH "/api/medications/$M2/stop" "$TA"
sql "INSERT INTO dose_logs (medication_id, user_id, slot, scheduled_at, status) VALUES ($M2, $UA, 'noon', CONCAT(CURDATE(), ' 13:00:00'), 'pending');" >/dev/null
OLDID="$(sql "SELECT id FROM dose_logs WHERE medication_id=$M2 AND scheduled_at=CONCAT(CURDATE(), ' 13:00:00');")"
req PATCH "/api/medications/$M2/resume" "$TA"; req PATCH "/api/medications/$M2/stop" "$TA"
expect "ยาถูกหยุด → pending ถูกลบ" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE id=$OLDID;")" "0"
press "$LA" "a=take&d=$OLDID"
expect_match "กดปุ่มของรอบที่ถูกลบเพราะหยุดยา → ไม่พบรายการยา" "$REPLY" '🔍 ไม่พบรายการยานี้แล้ว'
MB="$(mkmed "$TB" "TEST-6C-ของB" >/dev/null; echo "$MED_ID")"
mkdose "$UB" "$MB" noon "00:05:00"; DB1="$LAST_DOSE"
press "$LA" "a=take&d=$DB1"
expect_match "A กดปุ่มของ B → ไม่พบรายการ (ไม่เผยของคนอื่น)" "$REPLY" '🔍 ไม่พบรายการยานี้แล้ว'
expect "  dose ของ B ไม่ถูกแตะ" "$(sql "SELECT status FROM dose_logs WHERE id=$DB1;")" "pending"
press "$LC" "a=take&d=$DB1"
expect "LINE ผู้ดูแลอย่างเดียวกดปุ่ม → เงียบ" "$(fl_count reply)" "0"

section "ช่วยเหลือ / วิธีใช้"
say "$LA" "ช่วยเหลือ"
expect_match "ช่วยเหลือ → text 4 บรรทัด" "$REPLY" '😊 น้องยาตรงช่วยได้แบบนี้ค่ะ 📋 พิมพ์ "วันนี้" ดูยาของวันนี้ 🔗 ส่งรหัส 6 หลัก เพื่อเชื่อมบัญชี หรือแตะปุ่มด้านล่าง'
say "$LA" "สวัสดีครับ"
expect_match "ข้อความอื่นๆ → เมนูช่วยเหลือ" "$REPLY" 'น้องยาตรงช่วยได้แบบนี้ค่ะ'
say "$LA" "วิธีใช้"
expect_match "วิธีใช้ (เชื่อมแล้ว) → ปุ่มกินแล้ว/วันนี้/เมนู" "$REPLY" 'วิธีใช้น้องยาตรงนะคะ.*กินแล้ว.*ยาวันนี้'
say "$LU" "วิธีใช้"
expect_match "วิธีใช้ (ยังไม่เชื่อม) → ขั้นตอนเชื่อม" "$REPLY" 'เริ่มใช้ 3 ขั้นตอน'

section "#ตัวอย่าง (DEMO_MODE=true): ทุกหน้าไม่เกิน 5 ข้อความ ไม่เขียน DB"
BEFORE="$(sql "SELECT COUNT(*), IFNULL(SUM(status='taken'),0) FROM dose_logs WHERE user_id=$UA;")"
say "$LA" "#ตัวอย่าง 1"
expect "หน้า 1 มีข้อความ 2–5" "$(fl_last reply 'r.body.messages.length>=2&&r.body.messages.length<=5')" "true"
expect_match "  หัวข้อความบอกแบบ" "$(fl_last reply 'r.body.messages[0].text')" '^ตัวอย่าง 1/[0-9]+: '
PAGES="$(fl_last reply 'r.body.messages[0].text.match(/\/([0-9]+):/)[1]')"
TOTAL_PAGES=$(( (PAGES + 1) / 2 ))
expect "  quick reply มีปุ่มหน้าถัดไป" "$(qr_labels | grep -c '➡️ #ตัวอย่าง 2')" "1"
MAXMSG=0
for p in $(seq 1 $TOTAL_PAGES); do
  say "$LA" "#ตัวอย่าง $p"
  n="$(fl_last reply 'r.body.messages.length')"; [ "$n" -gt "$MAXMSG" ] && MAXMSG="$n"
done
expect "ทุกหน้า (1–$TOTAL_PAGES) ตอบได้ และมากสุดไม่เกิน 5 ข้อความ" "$([ "$MAXMSG" -ge 2 ] && [ "$MAXMSG" -le 5 ] && echo yes)" "yes"
say "$LA" "#ตัวอย่าง ๑"
expect_match "เลขไทยใช้ได้" "$REPLY" 'ตัวอย่าง 1/'
say "$LA" "#ตัวอย่าง 999"
expect_match "หน้าเกินช่วง → บอกจำนวนหน้า" "$REPLY" 'มีตัวอย่าง 1 ถึง [0-9]+ หน้า'
sleep 1
press "$LA" "a=preview"
expect "ปุ่มในตัวอย่าง (a=preview) → ตอบว่ายังไม่ได้บันทึก" "$REPLY" "นี่คือข้อความตัวอย่างค่ะ ยังไม่ได้บันทึกนะคะ"
expect "  DB ของ A ไม่เปลี่ยน (จำนวนรอบ/ที่กินแล้ว)" "$(sql "SELECT COUNT(*), IFNULL(SUM(status='taken'),0) FROM dose_logs WHERE user_id=$UA;")" "$BEFORE"
say "$LU" "#ตัวอย่าง 1"
expect_match "ยังไม่เชื่อม (แม้ DEMO เปิด) → เมนูช่วยเหลือ" "$REPLY" 'น้องยาตรงช่วยได้แบบนี้ค่ะ'

section "ปุ่มเดโม: เลือกกลุ่ม pending ที่ใกล้เวลาปัจจุบันที่สุด (ทั้งก่อน/หลัง) + บอกมื้อ"
mkmed "$TD" "TEST-6C-D1"; MD1="$MED_ID"; mkmed "$TD" "TEST-6C-D2"; MD2="$MED_ID"
sql "DELETE FROM dose_logs WHERE user_id=$UD;" >/dev/null
sql "UPDATE users SET line_user_id='$LD' WHERE id=$UD;" >/dev/null
mkdose "$UD" "$MD1" morning "00:01:00"; DD1="$LAST_DOSE"
mkdose "$UD" "$MD2" bedtime "23:59:00"; DD2="$LAST_DOSE"
NEAR="$(sql "SELECT IF(ABS(TIMESTAMPDIFF(SECOND, CONCAT(CURDATE(),' 00:01:00'), NOW())) <= ABS(TIMESTAMPDIFF(SECOND, CONCAT(CURDATE(),' 23:59:00'), NOW())), 'morning', 'bedtime');")"
fl_clear
req POST /api/demo/remind-now "$TD"; expect "remind-now → 200" "$STATUS" "200"
expect "  เลือกมื้อที่ใกล้ที่สุด ($NEAR)" "$(jget 'o.slot')" "$NEAR"
expect_match "  response มี message บอกมื้อ+เวลา" "$(jget 'o.message')" "^ส่งเตือนมื้อ(เช้า|ก่อนนอน) [0-2][0-9]:[0-5][0-9] น\. \(1 รายการ\) เข้า LINE แล้วค่ะ"
expect "  response มี state" "$([ -n "$(jget 'o.state')" ] && echo yes)" "yes"
STATE="$(jget 'o.state')"
if [ "$NEAR" = "morning" ]; then
  expect "  morning 00:01 ผ่านมาแล้ว: state due/overdue (ไม่ใช่ soon)" "$([ "$STATE" != "soon" ] && echo yes)" "yes"
  expect "  reminded_at ของรอบที่ส่งถูกจอง (ครั้งแรก)" "$(sql "SELECT reminded_at IS NOT NULL FROM dose_logs WHERE id=$DD1;")" "1"
  expect "  อีกรอบไม่ถูกจอง" "$(sql "SELECT reminded_at IS NULL FROM dose_logs WHERE id=$DD2;")" "1"
else
  expect "  bedtime 23:59 ยังไม่ถึง: state soon" "$STATE" "soon"
  expect "  reminded_at ของรอบที่ส่งถูกจอง (ครั้งแรก)" "$(sql "SELECT reminded_at IS NOT NULL FROM dose_logs WHERE id=$DD2;")" "1"
fi
HDR="$(fl_last push 'r.body.messages[0].contents.header.contents.filter(n=>n.type==="text").map(n=>n.text).join("|")')"
case "$STATE" in
  soon) expect_match "  หัวข้อ 'ใกล้ถึงเวลากินยาแล้วนะคะ'" "$HDR" 'ใกล้ถึงเวลากินยาแล้วนะคะ' ;;
  due) expect_match "  หัวข้อ 'ถึงเวลากินยาแล้วนะคะ'" "$HDR" '^ถึงเวลากินยาแล้วนะคะ' ;;
  overdue) expect_match "  หัวข้อ 'ยังไม่ได้กินยามื้อ…นะคะ' + 'เลยเวลามา'" "$HDR" 'ยังไม่ได้กินยามื้อ.*นะคะ[|]⏰ เลยเวลามา'
           expect "  หัวพื้นเหลือง" "$(fl_last push 'r.body.messages[0].contents.header.backgroundColor')" "#fef3c7" ;;
esac
# เคสบังคับ: เหลือรอบเดียวที่เลยเวลามาก (> 30 นาที) → state overdue + หัวเหลือง
sql "DELETE FROM dose_logs WHERE user_id=$UD;" >/dev/null
sql "INSERT INTO dose_logs (medication_id, user_id, slot, scheduled_at, status) VALUES ($MD1, $UD, 'morning', NOW() - INTERVAL 3 HOUR, 'pending');" >/dev/null
fl_clear
req POST /api/demo/remind-now "$TD"
if [ "$(sql "SELECT DATE(NOW() - INTERVAL 3 HOUR) = CURDATE();")" = "1" ]; then
  expect "รอบเลยเวลา 3 ชม. → 200 state overdue" "$STATUS:$(jget 'o.state')" "200:overdue"
  expect_match "  message บอก 'เลยเวลามา 3 ชม.'" "$(jget 'o.message')" 'เลยเวลามา 3 ชม\.'
  expect_match "  หัวพื้นเหลือง + altText 'ยังไม่ได้กินยามื้อเช้า · เลยเวลามา 3 ชม.'" "$(fl_last push 'r.body.messages[0].contents.header.backgroundColor+"|"+r.body.messages[0].altText')" '^#fef3c7[|]⏰ ยังไม่ได้กินยามื้อเช้า · เลยเวลามา 3 ชม\.( [0-9]+ นาที)?$'
else
  echo "  ! ข้ามเคสเลยเวลา 3 ชม. (ตอนนี้ยังไม่ถึง 03:00 จึงข้ามวัน)"
fi
sql "DELETE FROM dose_logs WHERE user_id=$UD;" >/dev/null
sql "INSERT INTO dose_logs (medication_id, user_id, slot, scheduled_at, status) VALUES ($MD1, $UD, 'evening', NOW() + INTERVAL 5 MINUTE, 'pending');" >/dev/null
fl_clear
req POST /api/demo/remind-now "$TD"
if [ "$(sql "SELECT DATE(NOW() + INTERVAL 5 MINUTE) = CURDATE();")" = "1" ]; then
  expect "รอบอีก 5 นาที → 200 state soon" "$STATUS:$(jget 'o.state')" "200:soon"
  expect_match "  altText 'อีก … ถึงเวลากินยามื้อเย็น'" "$(fl_last push 'r.body.messages[0].altText')" '^⏰ อีก [0-9] นาที ถึงเวลากินยามื้อเย็น$'
else
  echo "  ! ข้ามเคสรอบอีก 5 นาที (ใกล้เที่ยงคืน)"
fi
fl_clear; req POST /api/demo/remind-now "$TD"
expect "ตัวกรองทดสอบ: ผู้ใช้ทดสอบยังส่งได้ (200)" "$STATUS" "200"

section "รูปมาสคอตทุกท่าผ่าน nginx (User-Agent ที่ไม่ใช่เบราว์เซอร์)"
for f in mascot mascot-bell mascot-cheer mascot-hello; do
  H="$(curl -s -m 15 -D - -o "$TMP/$f.png" -A 'LineBotWebhook/2.0' "$WEB/line/$f.png" | tr -d '\r')"
  expect "GET /line/$f.png → 200" "$(printf '%s' "$H" | head -1 | awk '{print $2}')" "200"
  expect_match "  content-type image/png" "$(printf '%s' "$H" | grep -i '^content-type:')" 'image/png'
  expect "  PNG จริง 512×512 < 1 MB" "$(node -e 'const b=require("fs").readFileSync(process.argv[1]);console.log(b.slice(1,4).toString()+":"+b.readUInt32BE(16)+"x"+b.readUInt32BE(20)+":"+(b.length<1000000))' "$TMP/$f.png")" "PNG:512x512:true"
done
expect "GET /line/mascot-evil.png (ไม่อยู่ในรายการ) → ไม่ใช่รูป (SPA fallback html)" "$(curl -s -m 10 -o /dev/null -w '%{content_type}' "$WEB/line/mascot-evil.png" | grep -c 'image/png')" "0"

section "rich menu: --dry-run / สร้าง / รันซ้ำไม่ซ้อน / ตั้งค่าเริ่มต้น (กับ LINE ปลอม)"
RM_ENV=(LINE_API_BASE="$FAKE" LINE_API_DATA_BASE="$FAKE" LINE_CHANNEL_ACCESS_TOKEN="$TOKEN_LINE" PUBLIC_BASE_URL="$PUBLIC")
fl_clear
OUT="$(env "${RM_ENV[@]}" node scripts/line-richmenu.mjs --dry-run 2>&1)"; expect "--dry-run exit" "$?" "0"
expect_match "  ตรวจ validate แล้วหยุด" "$(printf '%s' "$OUT" | paste -sd' ' -)" 'validate: โครงสร้างเมนูถูกต้อง.*DRY-RUN'
expect "  ไม่สร้างเมนู" "$(fl "$FAKE/_richmenus" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).menus.length))')" "0"
OUT="$(env "${RM_ENV[@]}" node scripts/line-richmenu.mjs 2>&1)"; expect "สร้างครั้งที่ 1 exit" "$?" "0"
OUT2="$(env "${RM_ENV[@]}" node scripts/line-richmenu.mjs 2>&1)"; expect "สร้างครั้งที่ 2 (รันซ้ำ) exit" "$?" "0"
expect_match "  ลบเมนูเดิมชื่อเดียวกัน 1 รายการ" "$OUT2" 'ลบเมนูเดิมชื่อเดียวกัน 1 รายการ'
RMJ="$(fl "$FAKE/_richmenus")"
rm_eval() { printf '%s' "$RMJ" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);const m=o.menus[0];try{const v=eval(process.argv[1]);console.log(typeof v==="object"?JSON.stringify(v):v)}catch(e){console.log("")}})' "$1"; }
expect "มีเมนูเดียว (ไม่ซ้อน)" "$(rm_eval 'o.menus.length')" "1"
expect "  ขนาด 2500×843 selected=true chatBarText" "$(rm_eval 'm.size.width+"x"+m.size.height+"|"+m.selected+"|"+m.chatBarText')" "2500x843|true|เมนูน้องยาตรง"
expect "  3 ช่องเท่ากัน (833+833+834)" "$(rm_eval 'm.areas.map(a=>a.bounds.width).join(",")')" "833,833,834"
expect "  ซ้าย = message 'วันนี้'" "$(rm_eval 'm.areas[0].action.type+":"+m.areas[0].action.text')" "message:วันนี้"
expect "  กลาง = uri PUBLIC_BASE_URL/today" "$(rm_eval 'm.areas[1].action.type+":"+m.areas[1].action.uri')" "uri:$PUBLIC/today"
expect "  ขวา = message 'วิธีใช้'" "$(rm_eval 'm.areas[2].action.type+":"+m.areas[2].action.text')" "message:วิธีใช้"
expect "  อัปโหลดรูป PNG ≤ 1 MB" "$(rm_eval 'o.images[m.richMenuId].type+":"+(o.images[m.richMenuId].bytes<=1000000)')" "image/png:true"
expect "  ตั้งเป็นค่าเริ่มต้น" "$(rm_eval 'o.default===m.richMenuId')" "true"
expect "ไม่ log token" "$(printf '%s%s' "$OUT" "$OUT2" | grep -c "$TOKEN_LINE")" "0"
fl_clear
OUT="$(env LINE_API_BASE="$FAKE" LINE_CHANNEL_ACCESS_TOKEN="" PUBLIC_BASE_URL="$PUBLIC" node scripts/line-richmenu.mjs --dry-run 2>&1)"; expect "ไม่มี token → ไม่ผ่าน (exit 1)" "$?" "1"

section "line-validate.mjs: ข้อความทุกแบบผ่าน endpoint validate reply+push (LINE ปลอมตรวจขีดจำกัดเหมือนจริง)"
OUT="$(env LINE_API_BASE="$FAKE" LINE_CHANNEL_ACCESS_TOKEN="$TOKEN_LINE" PUBLIC_BASE_URL="$PUBLIC" node scripts/line-validate.mjs 2>&1)"; RC=$?
expect "exit" "$RC" "0"
expect_match "  สรุปผ่านครบ" "$OUT" 'สรุป: ผ่าน ([0-9]+) / \1 การตรวจ'
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$FAKE/v2/bot/message/validate/reply" -H 'Authorization: Bearer x' -H 'Content-Type: application/json' -d '{"messages":[{"type":"text","text":"x","quickReply":{"items":[{"type":"action","action":{"type":"message","label":"ป้ายที่ยาวเกินยี่สิบตัวอักษรแน่นอนค่ะ","text":"a"}}]}}]}')"
expect "ตัวตรวจของ LINE ปลอมจับ quick reply ป้ายเกิน 20 ตัวได้ (400)" "$CODE" "400"

section "DEMO_MODE=false: #ตัวอย่าง = ข้อความทั่วไป และ remind-now = 404"
restart_nodered "${NR_ENV[@]}" DEMO_MODE=false || exit 1
say "$LA" "#ตัวอย่าง 1"
expect_match "ผู้ป่วยพิมพ์ #ตัวอย่าง 1 → เมนูช่วยเหลือ" "$REPLY" 'น้องยาตรงช่วยได้แบบนี้ค่ะ'
expect "  ไม่ใช่ Flex" "$(fl_last reply 'r.body.messages[0].type')" "text"
req POST /api/demo/remind-now "$TA"; expect "remind-now → 404" "$STATUS" "404"

section "log ไม่มีความลับ / userId เต็ม / ข้อความ"
LOGS="$(docker compose logs nodered 2>&1)"
for needle in "$SECRET" "$TOKEN_LINE" "$LA" "$LB" "$LC" "$LU" "$LD"; do
  if printf '%s' "$LOGS" | grep -qF -- "$needle"; then bad "log มี '${needle:0:12}…'"; else ok "log ไม่มี '${needle:0:12}…'"; fi
done

echo
echo "สรุป: ผ่าน $PASS · ไม่ผ่าน $FAIL"
[ "$FAIL" -eq 0 ]
