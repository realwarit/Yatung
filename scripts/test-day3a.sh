#!/usr/bin/env bash
# ทดสอบ Day 3A: ยา / ตารางวันนี้ / กินแล้ว-undo / ความเป็นเจ้าของข้อมูล / cron
# ต้องรันระบบอยู่ (docker compose up -d) ; ไม่มี credential ฝังในไฟล์:
#   DEMO_EMAIL    (ค่าเริ่มต้น demo@yatung.app — ดู db/init/02_seed.sql)
#   DEMO_PASSWORD (ไม่ตั้ง = อ่านจาก .env เอง)        BASE (ค่าเริ่มต้น http://localhost:8080)
# user ที่ 2 สร้างใหม่ด้วยอีเมล/รหัสผ่านสุ่มทุกครั้ง แล้วลบทิ้งตอนจบ
# ข้อควรระวัง: ทดสอบด้วยการตั้งเวลามื้อของบัญชีเดโมชั่วคราว (แล้วคืนค่าเดิม) อย่ารันช่วง 23:55–00:05
#   DEMO_PASSWORD=... bash scripts/test-day3a.sh

set -u
BASE="${BASE:-http://localhost:8080}"
DEMO_EMAIL="${DEMO_EMAIL:-demo@yatung.app}"
cd "$(dirname "$0")/.."
source scripts/lib/demo-password.sh   # อ่าน DEMO_PASSWORD จาก .env เองถ้าไม่ได้ตั้ง (ไม่แสดงค่า)
source scripts/lib/clock.sh; clock_guard 5 6   # กันรันใกล้เที่ยงคืน (รอบกินยาข้ามวัน) ดู scripts/lib/clock.sh

PASS=0; FAIL=0
STATUS=""; BODY=""

sql() { docker compose exec -T db sh -c 'mysql --default-character-set=utf8mb4 -N -B -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' 2>/dev/null <<<"$1"; }

# jq แบบบ้านๆ: jget '<js expression บน o>'  (อ่าน JSON จาก $BODY)
jget() { printf '%s' "$BODY" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);const v=eval(process.argv[1]);console.log(typeof v==="object"?JSON.stringify(v):v)}catch(e){console.log("")}})' "$1"; }

# req METHOD PATH TOKEN [JSON_BODY]
req() {
  local m="$1" p="$2" t="$3" b="${4:-}" out
  local args=(-s -X "$m" "$BASE$p" -w $'\n%{http_code}' -H 'Content-Type: application/json')
  [ -n "$t" ] && args+=(-H "Authorization: Bearer $t")
  # ส่ง body ผ่าน stdin: บน Windows อาร์กิวเมนต์ที่เป็นภาษาไทยจะเพี้ยนเป็น codepage เครื่อง
  [ -n "$b" ] && args+=(--data-binary @-)
  out="$(printf "%s" "$b" | curl "${args[@]}")"
  STATUS="${out##*$'\n'}"; BODY="${out%$'\n'*}"
}

show() { echo "    → HTTP $STATUS $(printf '%s' "$BODY" | cut -c1-300)"; }
ok() { PASS=$((PASS+1)); echo "  ✔ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✘ $1"; }
expect() { # expect "คำอธิบาย" ค่าที่ได้ ค่าที่ควรได้
  if [ "$2" = "$3" ]; then ok "$1 (= $3)"; else bad "$1 (ได้ '$2' ควรเป็น '$3')"; fi
}
section() { echo; echo "== $1"; }

TOKEN_A=""; TOKEN_B=""; B_EMAIL=""; ORIG_TIMES=""
cleanup() {
  [ -n "$TOKEN_A" ] && [ -n "$ORIG_TIMES" ] && req PUT /api/settings/slot-times "$TOKEN_A" "$ORIG_TIMES"
  sql "DELETE FROM medications WHERE name LIKE 'TEST-day3a-%';"
  [ -n "$B_EMAIL" ] && sql "DELETE FROM users WHERE email='$B_EMAIL';"
}
trap cleanup EXIT

section "เตรียม: login demo + สมัคร user ที่ 2 (สุ่ม)"
req POST /api/auth/login "" "{\"email\":\"$DEMO_EMAIL\",\"password\":\"$DEMO_PASSWORD\"}"
TOKEN_A="$(jget 'o.token')"
[ -n "$TOKEN_A" ] && ok "login demo ได้ token" || { bad "login demo ไม่สำเร็จ ($STATUS)"; exit 1; }
B_EMAIL="test-day3a-$RANDOM$RANDOM@example.test"
B_PASS="$(node -e 'console.log(require("crypto").randomBytes(9).toString("hex"))')"
req POST /api/auth/register "" "{\"email\":\"$B_EMAIL\",\"password\":\"$B_PASS\",\"display_name\":\"ผู้ทดสอบ B\"}"
TOKEN_B="$(jget 'o.token')"
[ -n "$TOKEN_B" ] && ok "สมัคร/ได้ token ของ user B" || { bad "สมัคร user B ไม่สำเร็จ ($STATUS) $BODY"; exit 1; }

# ตั้งเวลามื้อชั่วคราวให้ เช้า/กลางวัน ผ่านไปแล้ว และ เย็น/ก่อนนอน ยังไม่ถึง (คืนค่าเดิมตอนจบ)
req GET /api/settings/slot-times "$TOKEN_A"; ORIG_TIMES="$BODY"
expect "GET slot-times ครบ 4 มื้อ" "$(jget 'Object.keys(o).length')" "4"
req PUT /api/settings/slot-times "$TOKEN_A" '{"morning":"00:01","noon":"00:02","evening":"23:57","bedtime":"23:58"}'
expect "PUT slot-times (เวลาทดสอบ)" "$STATUS" "200"

dose_count() { # dose_count MED_ID -> จำนวนรอบวันนี้ของยานั้น (จาก /doses/today)
  req GET /api/doses/today "$TOKEN_A"; jget "o.slots.flatMap(s=>s.doses).filter(d=>d.medication_id==$1).length"
}
dose_id() { # dose_id MED_ID SLOT
  req GET /api/doses/today "$TOKEN_A"; jget "o.slots.find(s=>s.slot=='$2').doses.find(d=>d.medication_id==$1).id"
}

section "1) สร้างยาใหม่ → เห็นใน /doses/today เฉพาะรอบที่ยังไม่ถึงเวลา"
req POST /api/medications "$TOKEN_A" '{"name":"TEST-day3a-พารา","strength":"500 mg","dose_per_time":2,"unit":"tablet","meal_relation":"after","as_needed":false,"slots":["morning","noon","evening","bedtime"],"warnings":["ทดสอบ"],"total_qty":30}'
show
expect "POST ตอบ 201" "$STATUS" "201"
MED="$(jget 'o.id')"
expect "remaining_qty = total_qty (ไม่ส่ง remaining)" "$(jget 'o.remaining_qty')" "30"
expect "skipped_slots_today" "$(jget 'o.skipped_slots_today')" '["morning","noon"]'
expect "days_left = 30/(2×4)" "$(jget 'o.days_left')" "3"
expect "รอบวันนี้ของยานี้มี 2 รอบ (เย็น+ก่อนนอน)" "$(dose_count "$MED")" "2"
expect "GET /api/medications/:id" "$(req GET /api/medications/$MED "$TOKEN_A"; jget 'o.slots')" '["morning","noon","evening","bedtime"]'
req GET "/api/medications?active=1" "$TOKEN_A"
expect "GET list active=1 มียานี้ + slots เป็น array" "$(jget "o.find(m=>m.id==$MED).slots.length")" "4"
req GET /api/doses/today "$TOKEN_A"
echo "    today summary: $(jget 'o.summary')"
expect "is_overdue เป็น false สำหรับรอบที่ยังไม่ถึง" "$(jget "o.slots.flatMap(s=>s.doses).filter(d=>d.medication_id==$MED).every(d=>d.is_overdue===false)")" "true"

section "2) กินแล้ว → remaining ลด / กดซ้ำ 409 / undo (escalated_at เป็น NULL → pending)"
D_EVE="$(dose_id "$MED" evening)"
req POST /api/doses/$D_EVE/take "$TOKEN_A"; show
expect "take → 200 status taken" "$(jget 'o.status')" "taken"
expect "remaining 30 → 28" "$(jget 'o.remaining_qty')" "28"
req POST /api/doses/$D_EVE/take "$TOKEN_A"; show
expect "take ซ้ำ → 409" "$STATUS" "409"
expect "error code ALREADY_TAKEN" "$(jget 'o.error')" "ALREADY_TAKEN"
req POST /api/doses/$D_EVE/undo "$TOKEN_A"; show
expect "undo (escalated_at NULL) → pending" "$(jget 'o.status')" "pending"
expect "undo คืน remaining = 30" "$(jget 'o.remaining_qty')" "30"
req POST /api/doses/$D_EVE/undo "$TOKEN_A"
expect "undo ซ้ำ → 409 NOT_TAKEN" "$STATUS $(jget 'o.error')" "409 NOT_TAKEN"

section "3) undo เมื่อ escalated_at ไม่เป็น NULL → missed (กันแจ้งญาติซ้ำ)"
D_BED="$(dose_id "$MED" bedtime)"
req POST /api/doses/$D_BED/take "$TOKEN_A"
expect "take รอบก่อนนอน" "$(jget 'o.status')" "taken"
sql "UPDATE dose_logs SET escalated_at = NOW() WHERE id = $D_BED;"
req POST /api/doses/$D_BED/undo "$TOKEN_A"; show
expect "undo (escalated_at NOT NULL) → missed" "$(jget 'o.status')" "missed"
expect "escalated_at ยังคงอยู่" "$(sql "SELECT escalated_at IS NOT NULL FROM dose_logs WHERE id = $D_BED;")" "1"
expect "remaining กลับเป็น 30" "$(jget 'o.remaining_qty')" "30"
req POST /api/doses/$D_BED/take "$TOKEN_A"
expect "take dose ที่เป็น missed ได้ (กินช้า)" "$(jget 'o.status')" "taken"
expect "remaining 28" "$(jget 'o.remaining_qty')" "28"

section "3b) undo เกิน 10 นาที → 409 UNDO_EXPIRED"
sql "UPDATE dose_logs SET taken_at = NOW() - INTERVAL 11 MINUTE WHERE id = $D_BED;"
req POST /api/doses/$D_BED/undo "$TOKEN_A"; show
expect "UNDO_EXPIRED" "$STATUS $(jget 'o.error')" "409 UNDO_EXPIRED"

section "4) validation ผิด → 400 VALIDATION ข้อความไทย"
for case in \
  '{"name":"","dose_per_time":1,"unit":"tablet","meal_relation":"after","as_needed":false,"slots":["morning"]}' \
  '{"name":"X","dose_per_time":25,"unit":"tablet","meal_relation":"after","as_needed":false,"slots":["morning"]}' \
  '{"name":"X","dose_per_time":1,"unit":"bottle","meal_relation":"after","as_needed":false,"slots":["morning"]}' \
  '{"name":"X","dose_per_time":1,"unit":"tablet","meal_relation":"after","as_needed":true,"slots":["morning"]}' \
  '{"name":"X","dose_per_time":1,"unit":"tablet","meal_relation":"after","as_needed":false,"slots":[]}'; do
  req POST /api/medications "$TOKEN_A" "$case"; show
  expect "→ 400 VALIDATION" "$STATUS $(jget 'o.error')" "400 VALIDATION"
done
expect "ไม่มียาถูกสร้างเพิ่มจากเคสผิด" "$(sql "SELECT COUNT(*) FROM medications WHERE user_id=(SELECT id FROM users WHERE email='$DEMO_EMAIL') AND name IN ('','X');")" "0"
req PUT /api/settings/slot-times "$TOKEN_A" '{"morning":"08:00","noon":"07:00","evening":"18:00","bedtime":"21:00"}'; show
expect "slot-times เรียงเวลาผิด → 400" "$STATUS" "400"
req PUT /api/settings/slot-times "$TOKEN_A" '{"morning":"8:00","noon":"12:00","evening":"18:00","bedtime":"21:00"}'
expect "slot-times รูปแบบผิด → 400" "$STATUS" "400"

section "5) token ของ user อื่น → 404 (ไม่ใช่ 403)"
req GET /api/medications/$MED "$TOKEN_B";                       expect "GET ยาของ demo" "$STATUS" "404"
req PUT /api/medications/$MED "$TOKEN_B" '{"name":"hack","dose_per_time":1,"unit":"tablet","meal_relation":"after","as_needed":false,"slots":["morning"]}'
expect "PUT ยาของ demo" "$STATUS" "404"
req PATCH /api/medications/$MED/stop "$TOKEN_B";                expect "PATCH stop" "$STATUS" "404"
req POST /api/medications/$MED/refill "$TOKEN_B" '{"qty":5}';   expect "POST refill" "$STATUS" "404"
req POST /api/doses/$D_EVE/take "$TOKEN_B";                     expect "POST take dose ของ demo" "$STATUS" "404"
req POST /api/doses/$D_EVE/undo "$TOKEN_B";                     expect "POST undo dose ของ demo" "$STATUS" "404"
req GET /api/medications "$TOKEN_B";                            expect "list ของ B ไม่เห็นยา demo" "$(jget 'o.length')" "0"
req GET /api/medications/$MED "";                               expect "ไม่มี token → 401" "$STATUS" "401"
expect "ยาของ demo ไม่ถูกแก้" "$(sql "SELECT name FROM medications WHERE id=$MED;")" "TEST-day3a-พารา"

section "6) PUT ยา + refill + PUT slot-times (reminded_at คงเวลาเดิม)"
req PUT /api/medications/$MED "$TOKEN_A" '{"name":"TEST-day3a-พารา","strength":"500 mg","dose_per_time":2,"unit":"tablet","meal_relation":"before","as_needed":false,"slots":["evening","bedtime"],"total_qty":30}'
show
expect "PUT 200 meal_relation เปลี่ยน" "$STATUS $(jget 'o.meal_relation')" "200 before"
expect "PUT ไม่ส่ง remaining_qty → คงค่าเดิม (28)" "$(jget 'o.remaining_qty')" "28"
expect "pending ที่ยังไม่ถึงเวลาถูกสร้างใหม่: เย็น (ก่อนนอนกินไปแล้ว)" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE medication_id=$MED AND slot='evening' AND status='pending';")" "1"
req POST /api/medications/$MED/refill "$TOKEN_A" '{"qty":10}'; show
expect "refill remaining 28+10" "$(jget 'o.remaining_qty')" "38"
expect "refill total 30+10" "$(jget 'o.total_qty')" "40"
req POST /api/medications/$MED/refill "$TOKEN_A" '{"qty":0}'
expect "refill qty=0 → 400" "$STATUS" "400"

D_EVE="$(dose_id "$MED" evening)"
sql "UPDATE dose_logs SET reminded_at = NOW() WHERE id = $D_EVE;"
OLD_EVE="$(sql "SELECT scheduled_at FROM dose_logs WHERE id=$D_EVE;")"
req PUT /api/settings/slot-times "$TOKEN_A" '{"morning":"00:01","noon":"00:02","evening":"23:50","bedtime":"23:59"}'
expect "PUT slot-times ใหม่ 200" "$STATUS" "200"
expect "dose ที่ reminded แล้ว (pending) ย้ายไปเวลาใหม่ 23:50 (กฎใหม่ fix 7C: ย้ายแถวเดิม ไม่สร้างใหม่)" "$(sql "SELECT TIME(scheduled_at) FROM dose_logs WHERE id=$D_EVE;")" "23:50:00"
expect "  เวลาใหม่ยังไม่ถึง → ล้าง reminded_at (เตือนใหม่)" "$(sql "SELECT reminded_at IS NULL FROM dose_logs WHERE id=$D_EVE;")" "1"
sql "UPDATE dose_logs SET reminded_at = NULL WHERE id = $D_EVE;"
req PUT /api/settings/slot-times "$TOKEN_A" '{"morning":"00:01","noon":"00:02","evening":"23:50","bedtime":"23:59"}'
expect "dose ที่ยังไม่เตือน ย้ายไปเวลาใหม่ (23:50)" "$(sql "SELECT TIME(scheduled_at) FROM dose_logs WHERE id=$D_EVE;")" "23:50:00"
expect "dose ที่ taken แล้วไม่ถูกย้าย" "$(sql "SELECT TIME(scheduled_at) FROM dose_logs WHERE id=$D_BED;")" "23:58:00"

section "7) หยุดยา → is_active=0, end_date=วันนี้, ลบ pending ทั้งหมด (รวมที่เลยเวลาแล้ว)"
sql "UPDATE dose_logs SET scheduled_at = NOW() - INTERVAL 2 HOUR WHERE id = $D_EVE;"   # จำลองรอบที่เลยเวลาแล้วและยังไม่กิน
expect "ก่อนหยุด: ยานี้อยู่ใน /doses/today (2 รอบ: เลยเวลา 1 + taken 1)" "$(dose_count "$MED")" "2"
req PATCH /api/medications/$MED/stop "$TOKEN_A"; show
expect "stop → is_active false" "$(jget 'o.is_active')" "false"
expect "pending ทั้งหมดถูกลบ (ทั้งเลยเวลาและยังไม่ถึง)" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE medication_id=$MED AND status='pending';")" "0"
expect "หยุดแล้ว: /doses/today เหลือเฉพาะ dose ที่ taken (ไม่มีรอบเลยเวลาค้าง)" "$(dose_count "$MED")" "1"
req GET /api/doses/today "$TOKEN_A"
expect "dose ที่เหลือคือ taken" "$(jget "o.slots.flatMap(s=>s.doses).filter(d=>d.medication_id==$MED).map(d=>d.status)")" '["taken"]'
expect "dose ที่ taken ยังอยู่" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE id=$D_BED AND status='taken';")" "1"
req GET "/api/medications?active=1" "$TOKEN_A"
expect "ไม่อยู่ใน list active=1" "$(jget "o.some(m=>m.id==$MED)")" "false"

section "7b) กลับมาใช้ยา (resume) → is_active=1, end_date=NULL, สร้างรอบวันนี้ที่ยังไม่ถึงเวลา"
req PATCH /api/medications/$MED/resume "$TOKEN_B"; expect "resume ยาของ demo ด้วย token B → 404" "$STATUS" "404"
req PATCH /api/medications/$MED/resume "" ;       expect "resume ไม่มี token → 401" "$STATUS" "401"
req PATCH /api/medications/$MED/resume "$TOKEN_A"; show
expect "resume → 200 is_active true" "$STATUS $(jget 'o.is_active')" "200 true"
expect "end_date เป็น null" "$(jget 'o.end_date')" "null"
expect "skipped_slots_today ว่าง (ยาเหลือมื้อเย็น/ก่อนนอนที่ยังไม่ถึงเวลา)" "$(jget 'o.skipped_slots_today')" "[]"
expect "สร้างรอบเย็นที่ยังไม่ถึงเวลา" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE medication_id=$MED AND slot='evening' AND status='pending' AND scheduled_at > NOW();")" "1"
req PATCH /api/medications/$MED/resume "$TOKEN_A"
expect "resume ซ้ำ (ใช้งานอยู่แล้ว) ไม่พัง → 200" "$STATUS" "200"
expect "resume ซ้ำไม่สร้างรอบซ้ำ" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE medication_id=$MED AND slot='evening' AND status='pending';")" "1"
req PATCH /api/medications/9999999/resume "$TOKEN_A"; expect "resume id ที่ไม่มี → 404" "$STATUS" "404"
# resume ตอนที่เวลาของมื้อผ่านไปแล้ว → ไม่สร้างรอบ และตอบ skipped_slots_today (ข้ามถ้ารันช่วงเที่ยงคืน–02:00 เพราะเวลา 01:xx จะยังไม่ผ่าน)
if [ "$(date +%H)" -ge 2 ]; then
  req PATCH /api/medications/$MED/stop "$TOKEN_A"
  req PUT /api/settings/slot-times "$TOKEN_A" '{"morning":"01:00","noon":"01:10","evening":"01:20","bedtime":"01:30"}'
  req PATCH /api/medications/$MED/resume "$TOKEN_A"
  expect "resume หลังเวลามื้อผ่านไปแล้ว → 200 + skipped_slots_today ครบ" "$STATUS $(jget 'o.skipped_slots_today')" '200 ["evening","bedtime"]'
  expect "ไม่สร้างรอบที่ผ่านเวลาไปแล้ว" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE medication_id=$MED AND status='pending';")" "0"
  req PUT /api/settings/slot-times "$TOKEN_A" "$ORIG_TIMES"
else
  echo "  - ข้ามเคส skipped_slots_today (รันช่วง 00:00–01:59)"
fi
req PATCH /api/medications/$MED/stop "$TOKEN_A"
expect "หยุดอีกครั้ง → pending หมด" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE medication_id=$MED AND status='pending';")" "0"

section "8) cron: รัน 2 ครั้งติดกัน → จำนวน dose_logs ไม่เพิ่ม"
req POST /api/medications "$TOKEN_A" '{"name":"TEST-day3a-cron","dose_per_time":1,"unit":"tablet","meal_relation":"any","as_needed":false,"slots":["morning","noon","evening","bedtime"],"total_qty":20}'
MED2="$(jget 'o.id')"
sql "DELETE FROM dose_logs WHERE medication_id=$MED2;"   # จำลองว่า cron เมื่อคืนไม่ได้รัน
run_cron() {
  docker compose exec -T nodered node -e "const db=require('/data/lib/db');require('/data/lib/dose-service').generateToday(db).then(r=>{console.log(r.inserted);return db.close()}).catch(e=>{console.error(e);process.exit(1)})" 2>/dev/null
}
C0="$(sql "SELECT COUNT(*) FROM dose_logs;")"
R1="$(run_cron)"; C1="$(sql "SELECT COUNT(*) FROM dose_logs;")"
R2="$(run_cron)"; C2="$(sql "SELECT COUNT(*) FROM dose_logs;")"
echo "    dose_logs ทั้งตาราง: ก่อน=$C0  หลังรันครั้งที่ 1=$C1 (inserted $R1)  หลังรันครั้งที่ 2=$C2 (inserted $R2)"
expect "รอบที่ 1 สร้างครบ 4 รอบของยาใหม่" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE medication_id=$MED2;")" "4"
expect "รอบที่ 2 ไม่สร้างเพิ่ม" "$R2" "0"
expect "จำนวนแถวไม่เปลี่ยนหลังรอบที่ 2" "$C2" "$C1"
expect "ยาที่หยุดแล้วไม่ถูกสร้างรอบ" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE medication_id=$MED AND status='pending';")" "0"

section "9) fix 7C: 1 dose ต่อ (มื้อ, วัน) — ย้ายรอบเมื่อเปลี่ยนเวลามื้อ ไม่สร้างแถวใหม่"
# ใช้เวลาแบบสัมพัทธ์กับ "ตอนนี้" (เฉพาะวันนี้ ข้ามถ้าเกินเที่ยงคืน) ; มื้อที่ใช้ทดสอบ = เย็น ของยา TEST-day3a-one
if [ "$(date +%H)" -ge 2 ] && [ "$(date +%H)" -le 21 ]; then
  HM() { date -d "$1" +%H:%M 2>/dev/null || date -v"$1" +%H:%M; }
  F1="$(HM '+60 min')"; F2="$(HM '+90 min')"; PAST="$(HM '-30 min')"
  req PUT /api/settings/slot-times "$TOKEN_A" '{"morning":"00:01","noon":"00:02","evening":"23:50","bedtime":"23:59"}'
  req POST /api/medications "$TOKEN_A" '{"name":"TEST-day3a-one","dose_per_time":1,"unit":"tablet","meal_relation":"any","as_needed":false,"slots":["evening"],"total_qty":20}'
  M1="$(jget 'o.id')"
  cnt() { sql "SELECT COUNT(*) FROM dose_logs WHERE medication_id=$M1 AND slot='evening' AND DATE(scheduled_at)=CURDATE();"; }
  expect "เริ่มต้นมี 1 รอบ" "$(cnt)" "1"
  DID="$(sql "SELECT id FROM dose_logs WHERE medication_id=$M1 AND slot='evening';")"
  sql "UPDATE dose_logs SET reminded_at=NOW() - INTERVAL 5 MINUTE, followup_at=NOW() WHERE id=$DID;"
  put_times() { req PUT /api/settings/slot-times "$TOKEN_A" "{\"morning\":\"00:01\",\"noon\":\"00:02\",\"evening\":\"$1\",\"bedtime\":\"23:59\"}"; }
  put_times "$F1"
  expect "9a) เตือนแล้ว + เวลาใหม่ยังไม่ถึง → ย้ายแถวเดิม (id เดิม)" "$(sql "SELECT id FROM dose_logs WHERE medication_id=$M1 AND slot='evening' AND TIME(scheduled_at)='$F1:00';")" "$DID"
  expect "  ยังมี 1 รอบ" "$(cnt)" "1"
  expect "  ล้าง reminded_at/followup_at (เตือนใหม่ที่เวลาใหม่)" "$(sql "SELECT reminded_at IS NULL AND followup_at IS NULL FROM dose_logs WHERE id=$DID;")" "1"
  sql "UPDATE dose_logs SET reminded_at=NOW() WHERE id=$DID;"
  put_times "$F1"
  expect "9b) บันทึกเวลาเดิมซ้ำ → ไม่ล้าง reminded_at (ไม่เตือนซ้ำ)" "$(sql "SELECT reminded_at IS NOT NULL FROM dose_logs WHERE id=$DID;")" "1"
  put_times "$F2"; put_times "$F1"
  expect "9c) เปลี่ยนเวลา 2 ครั้งติดกัน ยังมี 1 รอบ" "$(cnt)" "1"
  sql "UPDATE dose_logs SET reminded_at=NOW() - INTERVAL 1 HOUR WHERE id=$DID;"
  put_times "$PAST"
  expect "9d) เวลาใหม่ผ่านไปแล้ว → ย้ายแต่คง reminded_at" "$(sql "SELECT TIME(scheduled_at)='$PAST:00' AND reminded_at IS NOT NULL FROM dose_logs WHERE id=$DID;")" "1"
  # escalation: ใส่แถว dose_escalations แล้วย้าย → แถวยังอยู่ ผูกกับ dose เดิม (UNIQUE กันแจ้งซ้ำ)
  CGID="$(sql "INSERT INTO caregivers (user_id, name, escalate_after_min) VALUES ((SELECT user_id FROM medications WHERE id=$M1), 'TEST-day3a-cg', 60); SELECT LAST_INSERT_ID();")"
  sql "INSERT INTO dose_escalations (dose_id, caregiver_id, user_id) SELECT $DID, $CGID, user_id FROM medications WHERE id=$M1;"
  put_times "$F2"
  expect "9e) แจ้งญาติไปแล้วแล้วย้ายเวลา → dose_escalations ยังผูก dose เดิม 1 แถว" "$(sql "SELECT COUNT(*) FROM dose_escalations WHERE dose_id=$DID AND caregiver_id=$CGID;")" "1"
  # taken แล้ว: ย้ายเวลาไม่แตะ และ cron ไม่สร้างแถวเพิ่ม
  sql "UPDATE dose_logs SET status='taken', taken_at=NOW(), source='app' WHERE id=$DID;"
  OLDT="$(sql "SELECT scheduled_at FROM dose_logs WHERE id=$DID;")"
  put_times "$F1"
  expect "9f) taken แล้วไม่ถูกย้าย" "$(sql "SELECT scheduled_at FROM dose_logs WHERE id=$DID;")" "$OLDT"
  expect "  ไม่มีแถวเพิ่ม" "$(cnt)" "1"
  run_cron >/dev/null; run_cron >/dev/null
  expect "9g) cron สร้าง dose ไม่สร้างซ้ำในมื้อที่ taken แล้ว" "$(cnt)" "1"
  req PUT /api/medications/$M1 "$TOKEN_A" '{"name":"TEST-day3a-one","dose_per_time":1,"unit":"tablet","meal_relation":"any","as_needed":false,"slots":["evening"],"total_qty":20}'
  expect "  PUT ยา ก็ไม่สร้างซ้ำ" "$(cnt)" "1"
  # ด่านสุดท้ายใน DB: INSERT แถวที่ 2 ในมื้อเดียวกันต้องถูกปฏิเสธ
  DUPERR="$(docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' 2>&1 <<<"INSERT INTO dose_logs (medication_id, user_id, slot, scheduled_at) SELECT $M1, user_id, 'evening', CONCAT(CURDATE(), ' 05:00:00') FROM medications WHERE id=$M1;")"
  case "$DUPERR" in *"Duplicate entry"*uq_dose_med_slot_day*) ok "9h) INSERT ซ้ำ (ยา, มื้อ, วัน) ตรงๆ ใน SQL → Duplicate key uq_dose_med_slot_day" ;; *) bad "9h) INSERT ซ้ำต้องได้ duplicate key (ได้: $DUPERR)" ;; esac
  expect "  จำนวนรอบยังเป็น 1" "$(cnt)" "1"
  expect "9i) scheduled_date ตรงกับ DATE(scheduled_at) ทุกแถว และไม่เป็น NULL" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE scheduled_date IS NULL OR scheduled_date <> DATE(scheduled_at);")" "0"
  sql "DELETE FROM caregivers WHERE id=$CGID;"
else
  echo "  - ข้ามหัวข้อ 9 (ทำงานเฉพาะช่วง 02:00–21:59 เพราะใช้เวลาสัมพัทธ์ของวันนี้)"
fi

echo
echo "สรุป: ผ่าน $PASS · ไม่ผ่าน $FAIL"
[ "$FAIL" -eq 0 ]
