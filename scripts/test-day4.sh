#!/usr/bin/env bash
# ทดสอบ Day 4: POST /api/scan (Gemini multimodal) + GET /api/prescriptions/:id
#   DEMO_PASSWORD=... bash scripts/test-day4.sh mock    # เคสที่ไม่เปลืองโควตา: AI_MOCK=true (validation, rate limit, ownership, error mapping) + Gemini ปลอม (retry/fallback/timeout 40 วินาที)
#     counters per model (_lite_calls, _main_calls); stop immediately on 429; a failed case is recorded as a problem and skipped (never retried)
#   DEMO_PASSWORD=... bash scripts/test-day4.sh all     # mock แล้วต่อด้วย real
# ข้อกำหนดโควตา (free tier gemini-3.8-flash: 5/นาที, 20/วัน):
#   - real: Lite for every case, then images 1-2 with the main model to compare speed/accuracy
#   - นับทุก HTTP request ที่ยิงไป Gemini (รวม retry/fallback) จาก log "gemini_http" ลง scripts/.day4-results/_calls
#     counters per model (_lite_calls, _main_calls); stop immediately on 429; a failed case is recorded as a problem and skipped (never retried)
# สคริปต์ restart nodered ด้วย env ชั่วคราว (AI_MOCK / LLM_MODEL) ไม่แก้ .env ; ตอนจบคืนค่าตาม .env
# ไม่มี credential ฝังในไฟล์ ; user ทดสอบสุ่มใหม่ทุกครั้งแล้วลบทิ้ง

set -u
BASE="${BASE:-http://localhost:1880}"          # ตรงเข้า Node-RED (nginx 8080 ต้อง build frontend ใหม่ถึงจะรับ body 12m)
DEMO_EMAIL="${DEMO_EMAIL:-demo@yatung.app}"
: "${DEMO_PASSWORD:?ตั้ง DEMO_PASSWORD ก่อนรัน}"
MODE="${1:-all}"
cd "$(dirname "$0")/.."
RES=scripts/.day4-results
IMG=docs/sample-images
mkdir -p "$RES"

envval() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//' | tr -d '\r'; }
MAIN_MODEL="$(envval LLM_MODEL)"; LITE_MODEL="$(envval LLM_MODEL_FALLBACK)"
[ -z "$LITE_MODEL" ] && LITE_MODEL="gemini-3.5-flash-lite"

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
req_file() { # req_file PATH TOKEN FILE  (POST body จากไฟล์ — รูป base64 ใหญ่เกินกว่าจะส่งทางอาร์กิวเมนต์)
  local out
  out="$(curl -s -X POST "$BASE$1" -w $'\n%{http_code}' -H 'Content-Type: application/json' -H "Authorization: Bearer $2" --data-binary @"$3")"
  STATUS="${out##*$'\n'}"; BODY="${out%$'\n'*}"
}
ok() { PASS=$((PASS+1)); echo "  ✔ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✘ $1"; }
expect() { if [ "$2" = "$3" ]; then ok "$1 (= $3)"; else bad "$1 (ได้ '$2' ควรเป็น '$3')"; fi; }
section() { echo; echo "== $1"; }
b64json() { node -e 'const fs=require("fs");const b=fs.readFileSync(process.argv[1]);fs.writeFileSync(process.argv[2],JSON.stringify({image:b.toString("base64")}))' "$1" "$2"; }

restart_nodered() { # restart_nodered VAR=val ... (สร้าง container ใหม่ → flow context/rate limit ล้าง)
  env "$@" docker compose up -d --force-recreate nodered >/dev/null 2>&1
  for _ in $(seq 40); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/me")" = "401" ] && return 0
    sleep 1.5
  done
  echo "nodered ไม่พร้อม"; return 1
}

login() { req POST /api/auth/login "" "{\"email\":\"$DEMO_EMAIL\",\"password\":\"$DEMO_PASSWORD\"}"; jget 'o.token'; }
new_user() { # สร้าง user ทดสอบ → ตั้ง TOKEN_NEW และ LAST_EMAIL (ห้ามเรียกใน $(...) เพราะตัวแปรจะหายใน subshell)
  LAST_EMAIL="test-day4-$RANDOM$RANDOM@example.test"
  local pw; pw="$(node -e 'console.log(require("crypto").randomBytes(9).toString("hex"))')"
  req POST /api/auth/register "" "{\"email\":\"$LAST_EMAIL\",\"password\":\"$pw\",\"display_name\":\"ผู้ทดสอบ day4\"}"
  TEST_EMAILS+=("$LAST_EMAIL")
  TOKEN_NEW="$(jget 'o.token')"
}

TEST_EMAILS=(); TEST_PRESC=()
cleanup() {
  local e ids
  [ -n "${FAKE_PID:-}" ] && kill "$FAKE_PID" 2>/dev/null
  docker compose logs nodered > "$RES/_last.log" 2>&1   # เก็บ log ไว้ดู error ก่อนสร้าง container ใหม่ (ไม่มี key/รูป/ocr_text)
  for e in "${TEST_EMAILS[@]}"; do
    ids="$(sql "SELECT id FROM users WHERE email='$e';")"
    [ -n "$ids" ] && rm -rf "node-red/data/uploads/$ids"
    sql "DELETE FROM users WHERE email='$e';"
  done
  local p
  for p in "${TEST_PRESC[@]}"; do
    sql "SELECT image_path FROM prescriptions WHERE id=$p AND image_path IS NOT NULL;" | while read -r f; do [ -n "$f" ] && rm -f "node-red/data/$f"; done
    sql "DELETE FROM prescriptions WHERE id=$p;"
  done
  # คืน nodered ให้ใช้ค่าตาม .env (AI_MOCK ตามที่ตั้งใน .env หรือ false)
  docker compose up -d --force-recreate nodered >/dev/null 2>&1
  echo; echo "== ข้อมูลผู้ใช้จริง"
  real_snapshot_check || echo "  ! ชุดนี้ใช้ LINE จริงและ cron จริงยังทำงาน — ถ้าต่างเฉพาะ reminded_at ของ dose ที่ถึงเวลา = cron เตือนจริงตามปกติ ไม่ใช่ความผิดของเทส"
}
source scripts/lib/real-snapshot.sh   # snapshot ผู้ใช้จริงก่อน-หลัง (ดู scripts/lib/real-snapshot.sh)
real_snapshot_take
trap cleanup EXIT

# ====================================================================================
run_mock() {
  section "เตรียม: restart nodered ด้วย AI_MOCK=true"
  restart_nodered AI_MOCK=true || exit 1
  TOKEN_A="$(login)"; [ -n "$TOKEN_A" ] && ok "login demo" || { bad "login demo ไม่สำเร็จ"; exit 1; }
  new_user; TOKEN_B="$TOKEN_NEW"; [ -n "$TOKEN_B" ] && ok "สมัคร user B" || { bad "สมัคร user B ไม่สำเร็จ $BODY"; exit 1; }
  local SMALLJPG="$RES/_img1.json"; b64json "$IMG/1-metformin-normal.jpg" "$SMALLJPG"

  section "input ผิด → 400 (ไม่เรียก Gemini) / ไม่มี token → 401"
  req POST /api/scan "" '{"text":"Metformin 500 mg วันละ 2 ครั้ง"}'; expect "ไม่มี token" "$STATUS" "401"
  req POST /api/scan "$TOKEN_A" '{}'; expect "ไม่มีทั้ง image/text" "$STATUS" "400"; expect "  error code" "$(jget 'o.error')" "VALIDATION"
  req POST /api/scan "$TOKEN_A" '{"image":"aGVsbG8gd29ybGQgbm90IGFuIGltYWdl","text":"Metformin 500 mg"}'; expect "ส่งทั้ง image และ text" "$STATUS" "400"
  req POST /api/scan "$TOKEN_A" '{"image":"aGVsbG8gd29ybGQgbm90IGFuIGltYWdl"}'; expect "ไฟล์ไม่ใช่รูป (magic bytes)" "$STATUS" "400"
  req POST /api/scan "$TOKEN_A" '{"image":"data:image/png;base64,@@@"}'; expect "base64 พัง" "$STATUS" "400"
  req POST /api/scan "$TOKEN_A" '{"text":"abc"}'; expect "ข้อความสั้นเกิน (<5)" "$STATUS" "400"
  req POST /api/scan "$TOKEN_A" "{\"text\":\"$(node -e 'console.log("ก".repeat(1001))')\"}"; expect "ข้อความยาวเกิน (>1000)" "$STATUS" "400"
  node -e 'const b=Buffer.alloc(8*1024*1024+10,1);b[0]=0xff;b[1]=0xd8;b[2]=0xff;require("fs").writeFileSync(process.argv[1],JSON.stringify({image:b.toString("base64")}))' "$RES/_big.json"
  req_file /api/scan "$TOKEN_A" "$RES/_big.json"; expect "รูปเกิน 8 MB" "$STATUS" "400"; rm -f "$RES/_big.json"
  expect "โหมด mock ไม่เรียก Gemini เลย (log ไม่มี gemini_http)" "$(docker compose logs nodered 2>/dev/null | grep -c gemini_http)" "0"

  section "AI_MOCK=true → ผลตัวอย่าง + บันทึก draft"
  req POST /api/scan "$TOKEN_A" '{"text":"Metformin 500 mg วันละ 2 ครั้ง หลังอาหาร เช้า-เย็น"}'
  expect "text → 200" "$STATUS" "200"
  local ID1; ID1="$(jget 'o.prescription_id')"; TEST_PRESC+=("$ID1")
  expect "ชื่อยา" "$(jget 'o.result.medications[0].name')" "Metformin"
  expect "มีทั้ง ocr_text และ review_flags" "$(jget '(typeof o.ocr_text)+"|"+Array.isArray(o.review_flags)')" "string|true"
  expect "DB: status/model/input_type" "$(sql "SELECT CONCAT(status,'/',llm_model,'/',input_type) FROM prescriptions WHERE id=$ID1;")" "draft/mock/text"
  expect "DB: ocr_text ไม่มีชื่อผู้ป่วย/HN" "$(sql "SELECT (ocr_text LIKE '%สมศรี%' OR ocr_text LIKE '%123456%') FROM prescriptions WHERE id=$ID1;")" "0"
  req_file /api/scan "$TOKEN_A" "$SMALLJPG"
  expect "image → 200" "$STATUS" "200"
  local ID2; ID2="$(jget 'o.prescription_id')"; TEST_PRESC+=("$ID2")
  local P; P="$(sql "SELECT image_path FROM prescriptions WHERE id=$ID2;")"
  echo "    image_path = $P"
  [[ "$P" =~ ^uploads/[0-9]+/[0-9]+\.jpg$ ]] && ok "image_path รูปแบบ uploads/<userId>/<ts>.jpg" || bad "image_path ผิดรูปแบบ"
  [ -f "node-red/data/$P" ] && ok "ไฟล์รูปถูกบันทึกจริง" || bad "ไม่พบไฟล์รูป"
  expect "DB: input_type=image" "$(sql "SELECT input_type FROM prescriptions WHERE id=$ID2;")" "image"

  section "GET /api/prescriptions/:id — เจ้าของเท่านั้น"
  req GET "/api/prescriptions/$ID1" "$TOKEN_A"; expect "เจ้าของ → 200" "$STATUS" "200"
  expect "  prescription_id ตรงกัน" "$(jget 'o.prescription_id')" "$ID1"
  expect "  มี result/ocr_text/review_flags" "$(jget '(!!o.result)+"|"+(typeof o.ocr_text)+"|"+Array.isArray(o.review_flags)')" "true|string|true"
  req GET "/api/prescriptions/$ID1" "$TOKEN_B"; expect "ของคนอื่น → 404" "$STATUS" "404"
  req GET "/api/prescriptions/99999999" "$TOKEN_A"; expect "ไม่มี id นี้ → 404" "$STATUS" "404"
  req GET "/api/prescriptions/abc" "$TOKEN_A"; expect "id ไม่ใช่ตัวเลข → 404" "$STATUS" "404"
  req GET "/api/prescriptions/$ID1" ""; expect "ไม่มี token → 401" "$STATUS" "401"

  section "การแปลง error (mock ด้วย [[mock:…]] ในข้อความ)"
  local TC; new_user; TC="$TOKEN_NEW"
  req POST /api/scan "$TC" '{"text":"ยาทดสอบ [[mock:no_result]]"}'; expect "Gemini บล็อก/ไม่มีเนื้อหา → 422" "$STATUS" "422"; expect "  code" "$(jget 'o.error')" "AI_NO_RESULT"
  req POST /api/scan "$TC" '{"text":"ยาทดสอบ [[mock:invalid_json]]"}'; expect "ตอบไม่ใช่ JSON → 422" "$STATUS" "422"; expect "  code" "$(jget 'o.error')" "AI_INVALID_JSON"
  req POST /api/scan "$TC" '{"text":"ยาทดสอบ [[mock:schema]]"}'; expect "JSON ไม่ตรง schema → 422" "$STATUS" "422"; expect "  code" "$(jget 'o.error')" "AI_SCHEMA_MISMATCH"
  req POST /api/scan "$TC" '{"text":"ยาทดสอบ [[mock:unavailable]]"}'; expect "AI ไม่ว่าง → 503" "$STATUS" "503"; expect "  code" "$(jget 'o.error')" "AI_UNAVAILABLE"
  expect "ไม่มี prescriptions ถูกบันทึกจากเคส error" "$(sql "SELECT COUNT(*) FROM prescriptions p JOIN users u ON u.id=p.user_id WHERE u.email='$LAST_EMAIL';")" "0"

  section "rate limit 4 ครั้ง/นาที/ผู้ใช้ (mock)"
  local TD; new_user; TD="$TOKEN_NEW"; local i codes=""
  for i in 1 2 3 4 5; do req POST /api/scan "$TD" '{"text":"Metformin 500 mg วันละ 2 ครั้ง"}'; codes="$codes $STATUS"; done
  expect "ครั้งที่ 1–4 ผ่าน, ครั้งที่ 5 โดน 429" "$(echo $codes)" "200 200 200 200 429"
  expect "  code" "$(jget 'o.error')" "RATE_LIMIT"
  req POST /api/scan "$TOKEN_A" '{"text":"Metformin 500 mg วันละ 2 ครั้ง"}'
  expect "ผู้ใช้อื่น (demo) ยังสแกนได้ — นับแยกรายผู้ใช้" "$STATUS" "200"; TEST_PRESC+=("$(jget 'o.prescription_id')")

  section "unit: จำกัดรายวัน 15 ครั้ง / ปิดข้อมูลส่วนตัว / schema ที่ส่ง Gemini"
  node -e '
    const s=require("./node-red/data/lib/scan-service"), v=require("./node-red/data/lib/validate-llm-output");
    const fs=require("fs"); let bad=0; const t=(n,c)=>{console.log((c?"  ✔ ":"  ✘ ")+n); if(!c) bad++;};
    const hits={}; let now=1e12, okc=0, last;
    for(let i=0;i<16;i++){ now+=61000; last=s.rateLimit(hits,7,now); if(last.ok) okc++; }
    t("15 ครั้งแรก (เว้น >1 นาที) ผ่าน ครั้งที่ 16 โดนจำกัดรายวัน", okc===15 && last.ok===false && /พรุ่งนี้/.test(last.body.details));
    now+=24*3600*1000+1; t("ผ่านไป 24 ชม. ใช้ได้อีก", s.rateLimit(hits,7,now).ok);
    t("เลขบัตร 13 หลัก (มีขีด)", v.redactPii("เลขบัตร 1-1037-00123-45-6")==="เลขบัตร [เลขบัตร]");
    t("HN (ป้าย+ตัวเลข)", v.redactPii("HN: 123456 วันที่ 7/10/2569")==="[HN] วันที่ 7/10/2569" && v.redactPii("AN.998877")==="[HN]");
    t("เลขบัตร 13 หลักติดกัน", v.redactPii("1103700123456")==="[เลขบัตร]");
    t("เบอร์มือถือ", v.redactPii("โทร 081-234-5678")==="โทร [เบอร์โทร]");
    t("เบอร์บ้าน", v.redactPii("02 123 4567")==="[เบอร์โทร]");
    t("ไม่แตะจำนวน/ความแรงของยา", v.redactPii("Metformin 500 mg จำนวน 60 เม็ด #30 x100")==="Metformin 500 mg จำนวน 60 เม็ด #30 x100");
    const g=JSON.stringify(s.toGeminiSchema(JSON.parse(fs.readFileSync("node-red/data/prompts/medicine-parse.schema.json","utf8"))));
    t("schema ที่ส่ง Gemini (responseJsonSchema) ไม่มี maxItems/$defs/$ref (สาเหตุ 400) แต่ยังมี enum", !/maxItems|\$defs|\$ref/.test(g) && /"enum"/.test(g));
    t("ocr_text อยู่ property แรก", Object.keys(JSON.parse(g).properties)[0]==="ocr_text");
    t("body: ไม่มี temperature/responseSchema, มี maxOutputTokens 4096 + thinkingLevel ตามรุ่น (Lite=minimal, หลัก=low)", (()=>{const b=s.buildGeminiBody({kind:"text",text:"x"},{medicineSystem:"s",medicineUserText:"{{USER_TEXT}}",medicineGeminiSchema:{}},"gemini-3.5-flash-lite");const c=b.generationConfig;return !("temperature" in c)&&c.maxOutputTokens===4096&&!("responseSchema" in c)&&c.responseJsonSchema&&c.responseMimeType==="application/json"&&c.thinkingConfig.thinkingLevel==="minimal"&&s.thinkingLevelFor("gemini-3.8-flash")==="low"&&s.bodyForModel(b,"gemini-3.8-flash").generationConfig.thinkingConfig.thinkingLevel==="low"&&b.generationConfig.thinkingConfig.thinkingLevel==="minimal"})());
    const ns=(ai,st,er,left)=>s.nextStep(ai,st,er,left);
    let x=ns({model:"a",fallbackModel:"b",retried:false},429,false);
    t("finishReason MAX_TOKENS → no_result (ไม่ใช้ JSON ที่ถูกตัด)", (()=>{const r=s.extractText({candidates:[{content:{parts:[{text:"{\"a\""}]},finishReason:"MAX_TOKENS"}]});return r.ok===false&&r.status===422&&r.body.error==="AI_NO_RESULT"})());
    t("429 → รุ่นสำรองทันที", x.action==="retry"&&x.model==="b"&&x.delayMs===0);
    t("429 ไม่มีรุ่นสำรอง/ใช้รุ่นสำรองอยู่ → ล้มเหลว (ห้ามซ้ำรุ่นเดิม)", ns({model:"b",fallbackModel:"b",retried:false},429,false).action==="fail");
    x=ns({model:"a",fallbackModel:"b",retried:false},503,false);
    t("503 + มีรุ่นสำรองต่างรุ่น → สลับรุ่นสำรองทันที (ไม่หน่วง) ใช้เวลาที่เหลือ 40 วินาที", x.action==="retry"&&x.model==="b"&&x.delayMs===0&&x.timeoutMs===40000);
    x=ns({model:"a",fallbackModel:"a",retried:false},503,false);
    t("503 ไม่มีรุ่นสำรองต่างรุ่น → รุ่นเดิม เว้น 2 วินาที (38 วินาทีที่เหลือ)", x.action==="retry"&&x.model==="a"&&x.delayMs===2000&&x.timeoutMs===38000);
    x=ns({model:"a",fallbackModel:"b",retried:false},undefined,true);
    t("timeout/เครือข่าย + มีรุ่นสำรอง → สลับรุ่นสำรองทันที", x.action==="retry"&&x.model==="b"&&x.delayMs===0);
    t("timeout ไม่มีรุ่นสำรองต่างรุ่น → รุ่นเดิม เว้น 2 วินาที", ns({model:"a",retried:false},undefined,true).delayMs===2000);
    t("400/403 ไม่ retry", ns({model:"a",fallbackModel:"b",retried:false},400,false).action==="fail" && ns({model:"a",retried:false},403,false).action==="fail");
    t("noRetry (ทดสอบ) ไม่ลองใหม่เลย", ns({model:"a",fallbackModel:"b",retried:false,noRetry:true},503,false).action==="fail");
    t("ลองซ้ำไปแล้ว 1 ครั้ง ไม่ลองอีก", ns({model:"a",fallbackModel:"b",retried:true},503,false).action==="fail");
    t("เวลาเหลือหลังหน่วงไม่ถึง 8 วินาที → ไม่ลองใหม่ (no_time)", ns({model:"a",retried:false},503,false,9999).reason==="no_time");
    x=ns({model:"a",retried:false},503,false,10000);
    t("เหลือพอดี 8 วินาทีหลังหน่วง → ลองใหม่ timeout 8000", x.action==="retry"&&x.timeoutMs===8000);
    t("429 fallback ไม่หน่วง: เหลือ 8 วินาทีก็ลองได้", ns({model:"a",fallbackModel:"b",retried:false},429,false,8000).action==="retry");
    process.exit(bad?1:0)' && PASS=$((PASS+23)) || { FAIL=$((FAIL+1)); }
}


# ====================================================================================
# flow จริง (retry / fallback / timeout รวม 40 วินาที) กับ Gemini ปลอม — ไม่เรียก Gemini จริง ไม่เปลืองโควตา
FAKE_PID=""
fake_case() { # fake_case ชื่อ MODEL FALLBACK สถานะที่ควรได้ วินาทีต่ำสุด วินาทีสูงสุด จำนวน_request รุ่นใน_DB
  local name="$1" m="$2" fb="$3" want="$4" lo="$5" hi="$6" wcalls="$7" wmodel="$8"
  restart_nodered AI_MOCK=false LLM_API_KEY=fake-key-for-test LLM_MODEL="$m" LLM_MODEL_FALLBACK="$fb" GEMINI_BASE_URL="http://host.docker.internal:8799/v1beta/models/" || { bad "$name: nodered ไม่พร้อม"; return; }
  local tok; tok="$(login)"
  local t0; t0=$(date +%s)
  req POST /api/scan "$tok" '{"text":"Metformin 500 mg วันละ 2 ครั้ง หลังอาหาร เช้า-เย็น"}'
  local secs=$(( $(date +%s) - t0 ))
  local calls; calls="$(docker compose logs nodered 2>/dev/null | grep -c gemini_http)"
  echo "    $name: HTTP $STATUS · ${secs}s · gemini_http=$calls"
  expect "$name: สถานะ" "$STATUS" "$want"
  [ "$secs" -ge "$lo" ] && [ "$secs" -le "$hi" ] && ok "$name: ใช้เวลา ${secs}s (อยู่ในช่วง $lo–$hi)" || bad "$name: ใช้เวลา ${secs}s นอกช่วง $lo–$hi"
  expect "$name: จำนวน request ไปที่ Gemini" "$calls" "$wcalls"
  if [ "$want" = "200" ]; then
    local id; id="$(jget 'o.prescription_id')"; TEST_PRESC+=("$id")
    expect "$name: llm_model ที่บันทึก" "$(sql "SELECT llm_model FROM prescriptions WHERE id=$id;")" "$wmodel"
  fi
  expect "$name: log ไม่มี API key" "$(docker compose logs nodered 2>/dev/null | grep -c fake-key-for-test)" "0"
}
run_fake() {
  section "ทดสอบ retry/fallback/timeout กับ Gemini ปลอม"
  node scripts/fake-gemini.js 8799 >"$RES/_fake.log" 2>&1 &
  FAKE_PID=$!
  sleep 1
  fake_case "ปกติ (ยืนยัน body ผ่านการตรวจแบบ Gemini จริง)" ok ok 200 0 8 1 ok
  fake_case "429 → รุ่นสำรองทันที" rl ok 200 0 8 2 ok
  fake_case "429 รุ่นหลัก → รุ่นสำรอง Lite (ปรับ thinkingLevel ตามรุ่น)" flash-rl flash-lite-ok 200 0 8 2 flash-lite-ok
  fake_case "503 → สลับรุ่นสำรองทันที" down ok 200 0 8 2 ok
  fake_case "503 ไม่มีรุ่นสำรองต่างรุ่น → ลองรุ่นเดิมหลังเว้น 2 วินาที" flaky flaky 200 2 10 2 flaky
  fake_case "503 ทั้งสองรุ่น → 503 (ยิง 2 ครั้ง ไม่วน)" down down2 503 0 8 2 -
  fake_case "Gemini ช้า → สลับรุ่นสำรองหลัง timeout 10 วินาที" slow ok 200 10 14 2 ok
  fake_case "400 → ไม่ retry" bad ok 503 0 8 1 -
  fake_case "คำตอบถูกตัด (MAX_TOKENS) → 422 ไม่ retry" maxtok ok 422 0 8 1 -
  fake_case "Gemini ช้า (ค้างตลอดทั้งสองครั้ง) → ตอบ 503 ภายใน 40 วินาที" slow slow 503 38 42 2 -
  run_breaker
  kill "$FAKE_PID" 2>/dev/null; FAKE_PID=""
}

# circuit breaker: เวลาเปิดย่อเหลือ 20 วินาทีในโหมดทดสอบ (ค่าจริง 10 นาที) — nodered ถูกสร้างใหม่ทุกเคส จึงเริ่มจากเบรกเกอร์ปิดเสมอ
BRK_OPEN_MS=20000
brk_start() { # brk_start MODEL FALLBACK → ตั้ง BTOK
  restart_nodered AI_MOCK=false LLM_API_KEY=fake-key-for-test LLM_MODEL="$1" LLM_MODEL_FALLBACK="$2" GEMINI_BASE_URL="http://host.docker.internal:8799/v1beta/models/" GEMINI_BREAKER_OPEN_MS=$BRK_OPEN_MS || { bad "nodered ไม่พร้อม"; return 1; }
  BTOK="$(login)"; BCALLS=0
}
brk_scan() { # brk_scan ชื่อ ต่ำสุด สูงสุด request_ที่เพิ่ม รุ่นใน_DB
  local name="$1" lo="$2" hi="$3" want="$4" wmodel="$5" t0 secs calls id
  t0=$(date +%s); req POST /api/scan "$BTOK" '{"text":"Metformin 500 mg วันละ 2 ครั้ง หลังอาหาร เช้า-เย็น"}'; secs=$(( $(date +%s) - t0 ))
  calls="$(docker compose logs nodered 2>/dev/null | grep -c gemini_http)"
  echo "    $name: HTTP $STATUS · ${secs}s · request ใหม่ $((calls - BCALLS))"
  expect "$name: สถานะ" "$STATUS" "200"
  [ "$secs" -ge "$lo" ] && [ "$secs" -le "$hi" ] && ok "$name: ใช้เวลา ${secs}s (อยู่ในช่วง $lo–$hi)" || bad "$name: ใช้เวลา ${secs}s นอกช่วง $lo–$hi"
  expect "$name: จำนวน request ที่ยิงไป Gemini" "$((calls - BCALLS))" "$want"
  BCALLS=$calls
  id="$(jget 'o.prescription_id')"; TEST_PRESC+=("$id")
  expect "$name: llm_model ที่บันทึก" "$(sql "SELECT llm_model FROM prescriptions WHERE id=$id;")" "$wmodel"
}
brk_log() { docker compose logs nodered 2>/dev/null | grep -c "gemini_breaker $1"; }
run_breaker() {
  section "circuit breaker: รุ่นหลักค้าง (timeout 10 วินาที) 2 ครั้ง → ครั้งที่ 3 ไปรุ่นสำรองทันที → ครบเวลาลองรุ่นหลักใหม่ → กลับมาปกติ"
  brk_start slow2 ok || return
  brk_scan "ครั้งที่ 1 (รุ่นหลักค้าง → สลับที่ 10 วินาที)" 10 14 2 ok
  expect "  ยังไม่เปิดเบรกเกอร์ (ล้มเหลว 1 ครั้ง)" "$(brk_log open)" "0"
  brk_scan "ครั้งที่ 2 (ค้างอีก → เปิดเบรกเกอร์)" 10 14 2 ok
  expect "  log เปิดเบรกเกอร์ 1 ครั้ง" "$(brk_log open)" "1"
  brk_scan "ครั้งที่ 3 (เบรกเกอร์เปิด → รุ่นสำรองตรงๆ ไม่แตะรุ่นหลัก)" 0 8 1 ok
  expect "  log skip_primary" "$(brk_log skip_primary)" "1"
  sleep $(( BRK_OPEN_MS / 1000 + 1 ))
  brk_scan "ครั้งที่ 4 (ครบเวลา → ลองรุ่นหลัก 1 ครั้ง สำเร็จ)" 0 8 1 slow2
  expect "  log probe" "$(brk_log probe)" "1"
  expect "  log ปิดเบรกเกอร์" "$(brk_log close)" "1"

  section "circuit breaker: รุ่นหลักล้มเหลว 503 2 ครั้ง (trip2) แล้วฟื้น — ใช้ใน demo-check ได้"
  brk_start trip2 ok || return
  brk_scan "ครั้งที่ 1 (503 → รุ่นสำรอง)" 0 8 2 ok
  brk_scan "ครั้งที่ 2 (503 → เปิดเบรกเกอร์)" 0 8 2 ok
  brk_scan "ครั้งที่ 3 (รุ่นสำรองตรงๆ)" 0 8 1 ok
  sleep $(( BRK_OPEN_MS / 1000 + 1 ))
  brk_scan "ครั้งที่ 4 (probe สำเร็จ)" 0 8 1 trip2
  expect "  log ปิดเบรกเกอร์" "$(brk_log close)" "1"

  section "circuit breaker: probe ล้มเหลว → เปิดต่ออีกรอบ"
  brk_start slow ok || return
  brk_scan "ครั้งที่ 1" 10 14 2 ok
  brk_scan "ครั้งที่ 2 (เปิดเบรกเกอร์)" 10 14 2 ok
  brk_scan "ครั้งที่ 3 (รุ่นสำรองตรงๆ)" 0 8 1 ok
  sleep $(( BRK_OPEN_MS / 1000 + 1 ))
  brk_scan "ครั้งที่ 4 (probe ค้าง → สลับรุ่นสำรองที่ 10 วินาที)" 10 14 2 ok
  expect "  log เปิดเบรกเกอร์รวม 2 ครั้ง (รอบแรก + หลัง probe ล้มเหลว)" "$(brk_log open)" "2"
  expect "  log ไม่มี API key" "$(docker compose logs nodered 2>/dev/null | grep -c fake-key-for-test)" "0"

  section "unit: circuit breaker (node --test)"
  if node --test node-red/test/breaker.test.js >"$RES/_breaker_unit.log" 2>&1; then ok "breaker.test.js ผ่าน"; else bad "breaker.test.js ไม่ผ่าน (ดู $RES/_breaker_unit.log)"; fi
}

# ====================================================================================
# ตัวนับโควตาแยกรุ่น (นับทุก HTTP request ที่ยิงไป Gemini รวม retry/fallback จาก log "gemini_http"): Lite ≤ MAX_LITE, รุ่นหลัก ≤ MAX_MAIN
# (รอบนี้: Lite 15, รุ่นหลัก 3 — ลบ $RES/*.meta *.json *.problem และตั้ง _lite_calls/_main_calls = 0 เพื่อเริ่มรอบใหม่)
MAX_LITE="${MAX_LITE:-15}"; MAX_MAIN="${MAX_MAIN:-3}"
cnt() { cat "$RES/$1" 2>/dev/null || echo 0; }
MAX_FB="${MAX_FB:-2}"
real_calls_used() { echo "Lite $(cnt _lite_calls)/$MAX_LITE · หลัก $(cnt _main_calls)/$MAX_MAIN · fallback $(cnt _fb_calls)/$MAX_FB"; }

# real_step NAME SRC KIND(image|text) LABEL
# ล้มเหลว (ไม่ใช่ 200 เช่น 503 จาก timeout 2 ครั้งติดกัน) → บันทึกเป็น .problem แล้วข้ามไปเคสถัดไป ไม่วนลองซ้ำ ; 429 → หยุดทั้งหมด
real_step() {
  local name="$1" src="$2" kind="$3" label="$4"
  if [ -f "$RES/$name.meta" ] || [ -f "$RES/$name.problem" ]; then echo "  (ข้าม $name — มีผลเดิมแล้ว)"; return 0; fi
  if [ "$TIER" = "fb" ]; then
    [ "$(cnt _fb_calls)" -ge "$MAX_FB" ] && { echo "  quota for fallback model reached ($MAX_FB); stop ($name not called)"; return 2; }
  elif [ "$TIER" = "main" ]; then
    [ "$(cnt _main_calls)" -ge "$MAX_MAIN" ] && { echo "  ✘ ครบโควตารุ่นหลัก $MAX_MAIN ครั้งแล้ว หยุด ($name ยังไม่ได้เรียก)"; return 2; }
  else
    [ "$(cnt _lite_calls)" -ge "$MAX_LITE" ] && { echo "  ✘ ครบโควตารุ่น Lite $MAX_LITE ครั้งแล้ว หยุด ($name ยังไม่ได้เรียก)"; return 2; }
  fi
  [ -f "$RES/_last" ] && sleep 16     # เว้นให้ไม่เกิน 4 ครั้ง/นาที ทั้งของแอปและของ Gemini
  local t0; t0=$(date +%s)
  if [ "$kind" = "image" ]; then b64json "$src" "$RES/_body.json"; else node -e 'require("fs").writeFileSync(process.argv[1],JSON.stringify({text:process.argv[2]}))' "$RES/_body.json" "$src"; fi
  req_file /api/scan "$TOKEN_REAL" "$RES/_body.json"; rm -f "$RES/_body.json"
  local secs=$(( $(date +%s) - t0 )) calls lines cmain
  lines="$(docker compose logs nodered --since "$((secs+3))s" 2>/dev/null | grep 'gemini_http')"
  calls="$(printf '%s\n' "$lines" | grep -c gemini_http)"
  cmain="$(printf '%s\n' "$lines" | grep -c "model=$MAIN_MODEL ")"
  if [ "$TIER" = "fb" ]; then echo $(( $(cnt _fb_calls) + calls )) > "$RES/_fb_calls"
  else echo $(( $(cnt _main_calls) + cmain )) > "$RES/_main_calls"; echo $(( $(cnt _lite_calls) + calls - cmain )) > "$RES/_lite_calls"; fi
  touch "$RES/_last"
  echo "  $name: HTTP $STATUS · gemini_http=$calls · ${secs}s · สะสม $(real_calls_used)"
  printf '%s\n' "$lines" | sed 's/^.*gemini_http/    gemini_http/'
  if printf '%s' "$lines" | grep -q 'status=429'; then echo "  ✘ ได้ 429 (โควตาหมด/ถี่เกิน) หยุดเรียกจริงทันที — รายงานผู้ใช้"; return 2; fi
  if [ "$STATUS" != "200" ]; then
    printf '%s\t%s\t%s\t%s\t%s\n' "$label" "$STATUS" "$secs" "$calls" "$(printf '%s' "$BODY" | cut -c1-200)" > "$RES/$name.problem"
    echo "  ⚠ $name ไม่สำเร็จ ($STATUS, ${secs}s, $calls request) — บันทึกเป็นปัญหาแล้วข้าม ไม่ลองซ้ำ"
    return 0
  fi
  local id; id="$(jget 'o.prescription_id')"; TEST_PRESC+=("$id")
  printf '%s' "$BODY" > "$RES/$name.json"
  local pii; pii="$(sql "SELECT (ocr_text LIKE '%สมศรี%' OR ocr_text LIKE '%123456%' OR ocr_text LIKE '%081-234-5678%' OR ocr_text REGEXP '[0-9]{13}' OR ocr_text REGEXP '0[0-9]{1,2}-?[0-9]{3}-?[0-9]{3,4}' OR llm_json LIKE '%สมศรี%' OR llm_json LIKE '%123456%' OR llm_json LIKE '%081-234-5678%') FROM prescriptions WHERE id=$id;")"
  local model; model="$(sql "SELECT llm_model FROM prescriptions WHERE id=$id;")"
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$label" "$secs" "$calls" "$model" "$pii" "$id" > "$RES/$name.meta"
  return 0
}

run_real() {
  [ -n "$(envval LLM_API_KEY)" ] || { echo "ไม่มี LLM_API_KEY ใน .env"; exit 1; }
  TIER=lite
  section "เรียก Gemini จริง (สะสมแล้ว $(real_calls_used)) — รุ่น Lite $LITE_MODEL"
  restart_nodered AI_MOCK=false LLM_MODEL="$LITE_MODEL" LLM_MODEL_FALLBACK="$LITE_MODEL" || exit 1
  TOKEN_REAL="$(login)"; [ -n "$TOKEN_REAL" ] || { bad "login ไม่สำเร็จ"; exit 1; }
  rm -f "$RES/_last"
  real_step img1-lite "$IMG/1-metformin-normal.jpg" image "รูป 1 ซองปกติ" || exit 2
  real_step img2-lite "$IMG/2-paracetamol-prn.jpg" image "รูป 2 ยาเมื่อมีอาการ" || exit 2
  real_step img3-lite "$IMG/3-prescription-3-items.jpg" image "รูป 3 ใบสั่งยา 3 รายการ" || exit 2
  real_step img4-lite "$IMG/4-metformin-rotated-dark.jpg" image "รูป 4 หมุน 90° + มืด" || exit 2
  real_step img5-lite "$IMG/5-prompt-injection.jpg" image "รูป 5 ข้อความแฝง" || exit 2
  real_step txt1-lite "Metformin 500 mg ครั้งละ 1 เม็ด วันละ 2 ครั้ง หลังอาหาร เช้า-เย็น จำนวน 60 เม็ด" text "ข้อความ: ยาปกติ" || exit 2
  real_step txt2-lite "พรุ่งนี้ไปตลาดซื้อหมู ไข่ และผักบุ้ง แล้วแวะซื้อกาแฟ" text "ข้อความ: ไม่ใช่ซองยา" || exit 2

  TIER=main
  section "main model $MAIN_MODEL - compare speed/accuracy (used so far: $(real_calls_used))"
  restart_nodered AI_MOCK=false LLM_MODEL="$MAIN_MODEL" LLM_MODEL_FALLBACK="$LITE_MODEL" || exit 1
  TOKEN_REAL="$(login)"
  rm -f "$RES/_last"
  for s in ${MAIN_STEPS:-img1-main img2-main}; do
    case "$s" in
      img1-main) real_step img1-main "$IMG/1-metformin-normal.jpg" image "รูป 1 ซองปกติ" || exit 2 ;;
      img2-main) real_step img2-main "$IMG/2-paracetamol-prn.jpg" image "รูป 2 ยาเมื่อมีอาการ" || exit 2 ;;
    esac
  done
  report_real
}

# ยืนยันรุ่นสำรอง (LLM_MODEL_FALLBACK, เช่น gemini-3.1-flash-lite) กับรูป 1 และ 2 : thinkingLevel + schema ใช้ได้ ; GEMINI_NO_RETRY=true คุมให้ยิงรูปละ 1 request
run_fb() {
  [ -n "$(envval LLM_API_KEY)" ] || { echo "no LLM_API_KEY in .env"; exit 1; }
  TIER=fb
  section "fallback model $LITE_MODEL - images 1 and 2 (used so far: $(real_calls_used))"
  restart_nodered AI_MOCK=false GEMINI_NO_RETRY=true LLM_MODEL="$LITE_MODEL" LLM_MODEL_FALLBACK="$LITE_MODEL" || exit 1
  TOKEN_REAL="$(login)"; rm -f "$RES/_last"
  real_step img1-fb "$IMG/1-metformin-normal.jpg" image "รูป 1 ซองปกติ" || exit 2
  real_step img2-fb "$IMG/2-paracetamol-prn.jpg" image "รูป 2 ยาเมื่อมีอาการ" || exit 2
  report_real
}

report_real() {
  section "รายงานผลเรียกจริง"
  node scripts/day4-report.js "$RES" && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
}

case "$MODE" in
  mock) run_mock; run_fake ;;
  fake) run_fake ;;
  real) run_real ;;
  fb) run_fb ;;
  all) run_mock; run_fake; run_real ;;
  *) echo "ใช้: bash scripts/test-day4.sh [mock|real|all]"; exit 1 ;;
esac

echo
echo "สรุป: ผ่าน $PASS · ไม่ผ่าน $FAIL"
[ "$FAIL" -eq 0 ]
