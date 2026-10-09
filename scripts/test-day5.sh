#!/usr/bin/env bash
# ทดสอบ Day 5: GET /api/prescriptions/:id (status/has_image/existing_matches), GET /api/prescriptions/:id/image,
#              POST /api/prescriptions/:id/confirm, POST /api/prescriptions/:id/discard
# ใช้ AI_MOCK=true (ไม่เรียก Gemini ไม่เปลืองโควตา) ; user ทดสอบสุ่มใหม่ทุกครั้งแล้วลบทิ้งตอนจบ (รวมไฟล์รูป)
#   DEMO_PASSWORD=... bash scripts/test-day5.sh        (DEMO_PASSWORD ไม่ได้ใช้ login — มีไว้ให้เหมือนสคริปต์อื่น ไม่บังคับ)
# ตอนจบ recreate nodered ให้ใช้ค่าตาม .env

set -u
BASE="${BASE:-http://localhost:1880}"
cd "$(dirname "$0")/.."
IMG=docs/sample-images
UP=node-red/data/uploads

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
  env "$@" docker compose up -d --force-recreate nodered >/dev/null 2>&1
  for _ in $(seq 40); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/me")" = "401" ] && return 0
    sleep 1.5
  done
  echo "nodered ไม่พร้อม"; return 1
}

TEST_EMAILS=()
new_user() { # ตั้ง TOKEN_NEW และ UID_NEW (ห้ามเรียกใน $(...))
  local e="test-day5-$RANDOM$RANDOM@example.test" pw
  pw="$(node -e 'console.log(require("crypto").randomBytes(9).toString("hex"))')"
  req POST /api/auth/register "" "{\"email\":\"$e\",\"password\":\"$pw\",\"display_name\":\"ผู้ทดสอบ day5\"}"
  TEST_EMAILS+=("$e")
  TOKEN_NEW="$(jget 'o.token')"
  UID_NEW="$(sql "SELECT id FROM users WHERE email='$e';")"
}
cleanup() {
  local e id
  for e in "${TEST_EMAILS[@]}"; do
    id="$(sql "SELECT id FROM users WHERE email='$e';")"
    [ -n "$id" ] && rm -rf "$UP/$id"
    sql "DELETE FROM users WHERE email='$e';"
  done
  docker compose up -d --force-recreate nodered >/dev/null 2>&1
  echo; echo "== ข้อมูลผู้ใช้จริง"
  real_snapshot_check || echo "  ! ชุดนี้ใช้ LINE จริงและ cron จริงยังทำงาน — ถ้าต่างเฉพาะ reminded_at ของ dose ที่ถึงเวลา = cron เตือนจริงตามปกติ ไม่ใช่ความผิดของเทส"
}
source scripts/lib/real-snapshot.sh   # snapshot ผู้ใช้จริงก่อน-หลัง (ดู scripts/lib/real-snapshot.sh)
real_snapshot_take
trap cleanup EXIT

# mkdraft USER_ID [image] → ตั้ง DRAFT_ID : แทรกแถว prescriptions (draft) จากผลตัวอย่าง mock ; image = คัดลอกรูปทดสอบไปไว้ใน uploads ด้วย
mkdraft() {
  local uid="$1" rel="NULL" itype="text"
  if [ "${2:-}" = "image" ]; then
    mkdir -p "$UP/$uid"; local f="$RANDOM$RANDOM.jpg"
    cp "$IMG/1-metformin-normal.jpg" "$UP/$uid/$f"; rel="'uploads/$uid/$f'"; itype="image"
  fi
  local stmt
  stmt="$(node -e '
    const j = require("fs").readFileSync("node-red/data/prompts/mock-response.json", "utf8");
    const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\x27/g, "\x27\x27");
    const o = JSON.parse(j);
    console.log(`INSERT INTO prescriptions (user_id, input_type, image_path, ocr_text, llm_json, llm_model, status) VALUES (${process.argv[1]}, \x27${process.argv[2]}\x27, ${process.argv[3]}, \x27${esc(o.ocr_text)}\x27, \x27${esc(j)}\x27, \x27mock\x27, \x27draft\x27); SELECT LAST_INSERT_ID();`);
  ' "$uid" "$itype" "$rel")"
  DRAFT_ID="$(sql "$stmt")"
}
img_file() { sql "SELECT image_path FROM prescriptions WHERE id=$1;"; }
med_json() { # med_json NAME [total]  → body ฟอร์มยา (ครบ 4 มื้อ)
  printf '{"name":"%s","strength":"500 mg","dose_per_time":1,"unit":"tablet","meal_relation":"after","as_needed":false,"slots":["morning","noon","evening","bedtime"],"total_qty":%s}' "$1" "${2:-30}"
}
item_create() { printf '{"action":"create","medication":%s}' "$(med_json "$1" "${2:-30}")"; }

# ====================================================================================
section "เตรียม: restart nodered ด้วย AI_MOCK=true + สมัคร user A, B"
restart_nodered AI_MOCK=true || exit 1
new_user; TA="$TOKEN_NEW"; UA="$UID_NEW"; [ -n "$TA" ] && ok "user A (id $UA)" || { bad "สมัคร A ไม่สำเร็จ $BODY"; exit 1; }
new_user; TB="$TOKEN_NEW"; UB="$UID_NEW"; [ -n "$TB" ] && ok "user B (id $UB)" || { bad "สมัคร B ไม่สำเร็จ"; exit 1; }

section "ไม่มี token → 401 ทุก endpoint"
mkdraft "$UA" image; D0="$DRAFT_ID"
for ep in "GET /api/prescriptions/$D0" "GET /api/prescriptions/$D0/image" "POST /api/prescriptions/$D0/confirm" "POST /api/prescriptions/$D0/discard"; do
  req ${ep%% *} "${ep#* }" ""; expect "$ep" "$STATUS" "401"
done

section "GET /api/prescriptions/:id — status, has_image, existing_matches"
req GET "/api/prescriptions/$D0" "$TA"
expect "200" "$STATUS" "200"
expect "status = draft" "$(jget 'o.status')" "draft"
expect "has_image = true" "$(jget 'o.has_image')" "true"
expect "ไม่มียาซ้ำ → existing_matches ว่าง" "$(jget 'o.existing_matches.length')" "0"
expect "มี review_flags เป็น array" "$(jget 'Array.isArray(o.review_flags)')" "true"
req GET "/api/prescriptions/$D0" "$TB"; expect "ของคนอื่น → 404" "$STATUS" "404"
req GET "/api/prescriptions/abc" "$TA"; expect "id ไม่ใช่ตัวเลข → 404" "$STATUS" "404"
# ยาที่มีอยู่: ชื่อต่างตัวพิมพ์/มีช่องว่างคั่น ต้องจับคู่ได้ ; ยาที่หยุดแล้วไม่จับคู่
req POST /api/medications "$TA" "$(med_json 'METFOR MIN' 10)"; expect "สร้างยาเดิม (METFOR MIN)" "$STATUS" "201"
MEXIST="$(jget 'o.id')"
req GET "/api/prescriptions/$D0" "$TA"
expect "ชื่อ 'METFOR MIN' = 'Metformin' (ไม่สนตัวพิมพ์/ช่องว่าง) → จับคู่ 1 รายการ" "$(jget 'o.existing_matches.length')" "1"
expect "  index = 0" "$(jget 'o.existing_matches[0].index')" "0"
expect "  medication_id ตรง" "$(jget 'o.existing_matches[0].medication_id')" "$MEXIST"
expect "  remaining_qty = 10" "$(jget 'o.existing_matches[0].remaining_qty')" "10"
req PATCH "/api/medications/$MEXIST/stop" "$TA"
req GET "/api/prescriptions/$D0" "$TA"
expect "ยาที่หยุดแล้วไม่จับคู่" "$(jget 'o.existing_matches.length')" "0"
req PATCH "/api/medications/$MEXIST/resume" "$TA"

section "GET /api/prescriptions/:id/image"
code="$(curl -s -o /tmp/day5-img.bin -D /tmp/day5-img.hdr -w '%{http_code}' -H "Authorization: Bearer $TA" "$BASE/api/prescriptions/$D0/image")"
expect "เจ้าของ → 200" "$code" "200"
expect "Content-Type = image/jpeg" "$(grep -i '^content-type:' /tmp/day5-img.hdr | tr -d '\r' | sed 's/^[^:]*: *//')" "image/jpeg"
expect "Cache-Control = private, no-store" "$(grep -i '^cache-control:' /tmp/day5-img.hdr | tr -d '\r' | sed 's/^[^:]*: *//')" "private, no-store"
expect "ไฟล์ตรงกับต้นฉบับ (ขนาด byte)" "$(wc -c < /tmp/day5-img.bin | tr -d ' ')" "$(wc -c < $IMG/1-metformin-normal.jpg | tr -d ' ')"
expect "ของคนอื่น → 404" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TB" "$BASE/api/prescriptions/$D0/image")" "404"
mkdraft "$UA"; DTXT="$DRAFT_ID"
req GET "/api/prescriptions/$DTXT/image" "$TA"; expect "ไม่มีรูป (โหมดพิมพ์เอง) → 404" "$STATUS" "404"
expect "  has_image = false" "$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/prescriptions/$DTXT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).has_image))')" "false"
req GET "/api/prescriptions/99999999/image" "$TA"; expect "ไม่มีแถว → 404" "$STATUS" "404"

section "confirm: ตรวจสิทธิ์ + ตรวจ item (ไม่มีอะไรถูกบันทึกเมื่อผิด)"
MEDS_BEFORE="$(sql "SELECT COUNT(*) FROM medications WHERE user_id=$UA;")"
req POST "/api/prescriptions/$D0/confirm" "$TB" "{\"items\":[$(item_create X)]}"; expect "ของคนอื่น → 404" "$STATUS" "404"
req POST "/api/prescriptions/$D0/confirm" "$TA" '{"items":[]}'; expect "items ว่าง → 400" "$STATUS" "400"
req POST "/api/prescriptions/$D0/confirm" "$TA" '{}'; expect "ไม่มี items → 400" "$STATUS" "400"
req POST "/api/prescriptions/$D0/confirm" "$TA" "{\"items\":[$(item_create OK1),{\"action\":\"create\",\"medication\":$(med_json '' 5)}]}"
expect "item ที่ 2 ชื่อว่าง → 400" "$STATUS" "400"
expect "  item_index = 1" "$(jget 'o.item_index')" "1"
expect "  details ขึ้นต้น 'รายการที่ 2: '" "$(jget 'o.details.startsWith("รายการที่ 2: ")')" "true"
expect "  error = VALIDATION" "$(jget 'o.error')" "VALIDATION"
req POST "/api/prescriptions/$D0/confirm" "$TA" '{"items":[{"action":"delete"}]}'; expect "action ไม่รู้จัก → 400" "$STATUS" "400"
req POST "/api/prescriptions/$D0/confirm" "$TA" "{\"items\":[{\"action\":\"create\",\"medication\":{\"name\":\"Z\",\"dose_per_time\":1,\"unit\":\"tablet\",\"meal_relation\":\"unknown\",\"slots\":[\"morning\"]}}]}"
expect "meal_relation = unknown → 400 (ต้องเลือกก่อนบันทึก)" "$STATUS" "400"
req POST "/api/prescriptions/$D0/confirm" "$TA" '{"items":[{"action":"refill","medication_id":1,"qty":-5}]}'; expect "refill qty ติดลบ → 400" "$STATUS" "400"
req POST "/api/medications" "$TB" "$(med_json 'ยาของ B' 30)"; MB="$(jget 'o.id')"
req POST "/api/prescriptions/$D0/confirm" "$TA" "{\"items\":[$(item_create OK2),{\"action\":\"refill\",\"medication_id\":$MB,\"qty\":10}]}"
expect "refill ยาของคนอื่น → 404" "$STATUS" "404"
expect "  item_index = 1" "$(jget 'o.item_index')" "1"
expect "ยาของ B ไม่ถูกแตะ (remaining 30)" "$(sql "SELECT remaining_qty FROM medications WHERE id=$MB;")" "30.00"
expect "ไม่มียาใหม่ของ A เกิดขึ้น (item แรกถูก rollback)" "$(sql "SELECT COUNT(*) FROM medications WHERE user_id=$UA;")" "$MEDS_BEFORE"
expect "prescription ยังเป็น draft" "$(sql "SELECT status FROM prescriptions WHERE id=$D0;")" "draft"
expect "รูปยังอยู่ (ยังไม่ confirm)" "$([ -f "node-red/data/$(img_file $D0)" ] && echo yes || echo no)" "yes"

section "confirm: transaction ล้มกลางทาง → ไม่มีข้อมูลค้าง"
req POST /api/medications "$TA" "$(med_json 'ยาเต็มโควตา' 99999)"; MFULL="$(jget 'o.id')"
MEDS_BEFORE="$(sql "SELECT COUNT(*) FROM medications WHERE user_id=$UA;")"
LOGS_BEFORE="$(sql "SELECT COUNT(*) FROM dose_logs WHERE user_id=$UA;")"
req POST "/api/prescriptions/$D0/confirm" "$TA" "{\"items\":[$(item_create 'ต้องถูกย้อนกลับ'),{\"action\":\"refill\",\"medication_id\":$MFULL,\"qty\":99999}]}"
expect "refill เกินที่ระบบรองรับ (ล้มใน transaction) → 400" "$STATUS" "400"
expect "  item_index = 1" "$(jget 'o.item_index')" "1"
expect "ยา 'ต้องถูกย้อนกลับ' ไม่เหลือ" "$(sql "SELECT COUNT(*) FROM medications WHERE user_id=$UA AND name='ต้องถูกย้อนกลับ';")" "0"
expect "จำนวนยาของ A ไม่เปลี่ยน" "$(sql "SELECT COUNT(*) FROM medications WHERE user_id=$UA;")" "$MEDS_BEFORE"
expect "dose_logs ไม่เพิ่ม" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE user_id=$UA;")" "$LOGS_BEFORE"
expect "status ยังเป็น draft" "$(sql "SELECT status FROM prescriptions WHERE id=$D0;")" "draft"
expect "รูปยังอยู่" "$([ -f "node-red/data/$(img_file $D0)" ] && echo yes || echo no)" "yes"
expect "ยาเต็มโควตาไม่ถูกแก้" "$(sql "SELECT remaining_qty FROM medications WHERE id=$MFULL;")" "99999.00"

section "confirm สำเร็จ: create + refill ในครั้งเดียว"
IMGPATH="node-red/data/$(img_file $D0)"
req GET "/api/medications/$MEXIST" "$TA"; REM_BEFORE="$(jget 'o.remaining_qty')"
req POST "/api/prescriptions/$D0/confirm" "$TA" "{\"items\":[$(item_create 'ยาใหม่จากซอง' 60),{\"action\":\"refill\",\"medication_id\":$MEXIST,\"qty\":30}]}"
expect "200" "$STATUS" "200"
expect "created 1 รายการ" "$(jget 'o.created.length')" "1"
expect "refilled 1 รายการ" "$(jget 'o.refilled.length')" "1"
NEWID="$(jget 'o.created[0].medication_id')"
expect "created[0].name" "$(jget 'o.created[0].name')" "ยาใหม่จากซอง"
expect "created[0].skipped_slots_today เป็น array" "$(jget 'Array.isArray(o.created[0].skipped_slots_today)')" "true"
SKIPPED="$(jget 'o.created[0].skipped_slots_today.length')"
expect "refilled[0].remaining_qty = เดิม + 30" "$(jget 'o.refilled[0].remaining_qty')" "$(node -e "console.log($REM_BEFORE+30)")"
expect "ยาใหม่เก็บ prescription_id = ผลสแกนนี้" "$(sql "SELECT prescription_id FROM medications WHERE id=$NEWID;")" "$D0"
expect "ยาใหม่ remaining_qty = total_qty (60)" "$(sql "SELECT remaining_qty FROM medications WHERE id=$NEWID;")" "60.00"
expect "dose_logs ของวันนี้ = 4 มื้อ − มื้อที่เวลาผ่านแล้ว ($SKIPPED)" "$(sql "SELECT COUNT(*) FROM dose_logs WHERE medication_id=$NEWID;")" "$((4 - SKIPPED))"
expect "status = confirmed" "$(sql "SELECT status FROM prescriptions WHERE id=$D0;")" "confirmed"
expect "confirmed_at ถูกตั้ง" "$(sql "SELECT confirmed_at IS NOT NULL FROM prescriptions WHERE id=$D0;")" "1"
expect "ไฟล์รูปถูกลบ" "$([ -f "$IMGPATH" ] && echo yes || echo no)" "no"
expect "image_path = NULL" "$(sql "SELECT image_path IS NULL FROM prescriptions WHERE id=$D0;")" "1"
req GET "/api/prescriptions/$D0/image" "$TA"; expect "ดูรูปหลัง confirm → 404" "$STATUS" "404"
req GET "/api/prescriptions/$D0" "$TA"
expect "GET หลัง confirm: status = confirmed" "$(jget 'o.status')" "confirmed"
expect "  has_image = false" "$(jget 'o.has_image')" "false"
expect "  existing_matches ว่าง (ไม่ใช่ draft)" "$(jget 'o.existing_matches.length')" "0"

section "confirm ซ้ำ / discard หลัง confirm → 409"
req POST "/api/prescriptions/$D0/confirm" "$TA" "{\"items\":[$(item_create 'ซ้ำ')]}"
expect "confirm ซ้ำ → 409" "$STATUS" "409"
expect "  error = ALREADY_DONE" "$(jget 'o.error')" "ALREADY_DONE"
expect "  status ใน body = confirmed" "$(jget 'o.status')" "confirmed"
expect "ไม่มียา 'ซ้ำ' เกิดขึ้น" "$(sql "SELECT COUNT(*) FROM medications WHERE user_id=$UA AND name='ซ้ำ';")" "0"
req POST "/api/prescriptions/$D0/discard" "$TA"; expect "discard หลัง confirm → 409" "$STATUS" "409"

section "confirm พร้อมกัน 2 คำขอ (สองแท็บ) → สำเร็จ 1 อีกอัน 409"
mkdraft "$UA"; DC="$DRAFT_ID"
BODYC="{\"items\":[$(item_create 'พร้อมกัน')]}"
( printf '%s' "$BODYC" | curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/api/prescriptions/$DC/confirm" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' --data-binary @- > /tmp/day5-c1 ) &
( printf '%s' "$BODYC" | curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/api/prescriptions/$DC/confirm" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' --data-binary @- > /tmp/day5-c2 ) &
wait
expect "รหัสตอบ (เรียงแล้ว)" "$(cat /tmp/day5-c1 /tmp/day5-c2 | tr -d '\r' | sort | tr '\n' ' ')" "200 409 "
expect "ยา 'พร้อมกัน' มีแถวเดียว" "$(sql "SELECT COUNT(*) FROM medications WHERE user_id=$UA AND name='พร้อมกัน';")" "1"

section "discard"
mkdraft "$UA" image; DD="$DRAFT_ID"; DDFILE="node-red/data/$(img_file $DD)"
expect "ก่อน discard มีไฟล์รูป" "$([ -f "$DDFILE" ] && echo yes || echo no)" "yes"
req POST "/api/prescriptions/$DD/discard" "$TB"; expect "ของคนอื่น → 404" "$STATUS" "404"
expect "  ยังเป็น draft และรูปยังอยู่" "$(sql "SELECT status FROM prescriptions WHERE id=$DD;")$([ -f "$DDFILE" ] && echo +file)" "draft+file"
MEDS_BEFORE="$(sql "SELECT COUNT(*) FROM medications WHERE user_id=$UA;")"
req POST "/api/prescriptions/$DD/discard" "$TA"; expect "เจ้าของ → 200" "$STATUS" "200"
expect "  status = discarded" "$(jget 'o.status')" "discarded"
expect "  status ใน DB" "$(sql "SELECT status FROM prescriptions WHERE id=$DD;")" "discarded"
expect "  ไฟล์รูปถูกลบ" "$([ -f "$DDFILE" ] && echo yes || echo no)" "no"
expect "  image_path = NULL" "$(sql "SELECT image_path IS NULL FROM prescriptions WHERE id=$DD;")" "1"
expect "  ไม่มียาถูกสร้าง" "$(sql "SELECT COUNT(*) FROM medications WHERE user_id=$UA;")" "$MEDS_BEFORE"
req POST "/api/prescriptions/$DD/discard" "$TA"; expect "discard ซ้ำ → 409" "$STATUS" "409"
req POST "/api/prescriptions/$DD/confirm" "$TA" "{\"items\":[$(item_create 'หลังทิ้ง')]}"; expect "confirm หลัง discard → 409" "$STATUS" "409"
expect "  status ใน body = discarded" "$(jget 'o.status')" "discarded"
req GET "/api/prescriptions/$DD" "$TA"; expect "GET หลัง discard: status = discarded" "$(jget 'o.status')" "discarded"

section "ผ่าน POST /api/scan จริง (mock) → review → confirm"
req POST /api/scan "$TA" '{"text":"Metformin 500 mg วันละ 2 ครั้ง หลังอาหาร เช้า-เย็น"}'
expect "scan text → 200" "$STATUS" "200"
DS="$(jget 'o.prescription_id')"
req GET "/api/prescriptions/$DS" "$TA"
expect "GET: status = draft" "$(jget 'o.status')" "draft"
expect "  has_image = false (โหมดพิมพ์เอง)" "$(jget 'o.has_image')" "false"
expect "  input_type = text" "$(jget 'o.input_type')" "text"
node -e 'const b=require("fs").readFileSync(process.argv[1]);require("fs").writeFileSync(process.argv[2],JSON.stringify({image:b.toString("base64")}))' "$IMG/1-metformin-normal.jpg" /tmp/day5-scan.json
out="$(curl -s -X POST "$BASE/api/scan" -w $'\n%{http_code}' -H 'Content-Type: application/json' -H "Authorization: Bearer $TA" --data-binary @/tmp/day5-scan.json)"
STATUS="${out##*$'\n'}"; BODY="${out%$'\n'*}"
expect "scan รูป → 200" "$STATUS" "200"
DI="$(jget 'o.prescription_id')"
req GET "/api/prescriptions/$DI" "$TA"; expect "  has_image = true" "$(jget 'o.has_image')" "true"
expect "  GET image → 200" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TA" "$BASE/api/prescriptions/$DI/image")" "200"
req POST "/api/prescriptions/$DI/confirm" "$TA" "{\"items\":[$(item_create 'จากสแกนจริง')]}"; expect "confirm → 200" "$STATUS" "200"
expect "  รูปจริงที่ scan ไว้ถูกลบ" "$(sql "SELECT image_path IS NULL FROM prescriptions WHERE id=$DI;")" "1"
expect "  ไม่เหลือไฟล์ในโฟลเดอร์ของ A (ยกเว้นของ draft อื่น)" "$(ls "$UP/$UA" 2>/dev/null | wc -l | tr -d ' ')" "$(sql "SELECT COUNT(*) FROM prescriptions WHERE user_id=$UA AND image_path IS NOT NULL;")"

echo
echo "สรุป: ผ่าน $PASS · ไม่ผ่าน $FAIL"
[ "$FAIL" -eq 0 ]
