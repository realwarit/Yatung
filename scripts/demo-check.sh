#!/usr/bin/env bash
# เช็กความพร้อมก่อนนำเสนอ — สรุป ✓/✗ ทีละข้อ (exit 1 ถ้ามีข้อใดไม่ผ่าน)
#   bash scripts/demo-check.sh
# ตรวจ: container db/nodered/frontend รันอยู่ · เว็บ :8080 · proxy /api · Node-RED มี credentials MySQL · warm-up Gemini ใน log ·
#       login บัญชีเดโม · สแกนข้อความสั้น 1 ครั้ง "จริง" (เรียก Gemini 1 request; AI_MOCK=true จะข้าม Gemini และแจ้งเตือน) → ลบ draft ทิ้ง
# รหัสผ่านเดโม: ตัวแปร DEMO_PASSWORD หรือบรรทัด DEMO_PASSWORD= ใน .env (ไม่มี = demo1234)
set -u
cd "$(dirname "$0")/.."
WEB="${WEB:-http://localhost:8080}"
API="${API:-http://localhost:1880}"
EMAIL="${DEMO_EMAIL:-demo@yatung.app}"
PASS="${DEMO_PASSWORD:-$(grep -E '^DEMO_PASSWORD=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r')}"
PASS="${PASS:-demo1234}"
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
warn() { echo "  ! $1"; }
jget() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);const v=eval(process.argv[1]);console.log(v===undefined?"":typeof v==="object"?JSON.stringify(v):v)}catch(e){console.log("")}})' "$1"; }
code() { curl -s -o /dev/null -m 10 -w '%{http_code}' "$@"; }

echo "== 1) container"
for svc in db nodered frontend; do
  state="$(docker compose ps --format '{{.State}}' "$svc" 2>/dev/null | head -1)"
  [ "$state" = "running" ] && ok "$svc: running" || bad "$svc: ${state:-ไม่พบ} (docker compose up -d --build)"
done
health="$(docker compose ps --format '{{.Health}}' db 2>/dev/null | head -1)"
[ -z "$health" ] || [ "$health" = "healthy" ] && ok "db: ${health:-ไม่มี healthcheck}" || bad "db: $health"

echo "== 2) เว็บและ API"
[ "$(code "$WEB/")" = "200" ] && ok "เว็บ $WEB ตอบ 200" || bad "เว็บ $WEB ไม่ตอบ 200"
[ "$(code "$WEB/api/me")" = "401" ] && ok "nginx proxy /api → Node-RED (ไม่มี token = 401)" || bad "$WEB/api/me ควรได้ 401"
[ "$(code "$API/api/me")" = "401" ] && ok "Node-RED $API ตอบ" || bad "Node-RED $API ไม่ตอบ"

echo "== 3) Node-RED log"
logs="$(docker compose logs nodered 2>&1)"
echo "$logs" | grep -q "Access denied for user" && bad "MySQL: Access denied (รัน node node-red/init-credentials.js แล้ว restart)" || ok "MySQL credentials ไม่มี Access denied"
wl="$(echo "$logs" | grep -o 'gemini_warmup model=[^ ]* status=[^ ]* ms=[0-9]*' | tail -1)"
if [ -z "$wl" ]; then warn "ไม่พบ gemini_warmup ใน log (AI_MOCK=true หรือไม่มี LLM_API_KEY?)"
elif echo "$wl" | grep -q 'status=200'; then ok "Gemini warm-up: $wl"
else bad "Gemini warm-up ผิดปกติ: $wl (ตรวจ LLM_API_KEY / เครือข่าย)"; fi
mock="$(docker compose exec -T nodered printenv AI_MOCK 2>/dev/null | tr -d '\r')"
[ "$mock" = "true" ] && warn "AI_MOCK=true — สแกนจะตอบผลตัวอย่าง ไม่ได้เรียก Gemini จริง"

echo "== 4) login บัญชีเดโม ($EMAIL)"
resp="$(curl -s -m 15 -X POST "$API/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")"
TOKEN="$(printf '%s' "$resp" | jget 'o.token')"
[ -n "$TOKEN" ] && ok "login สำเร็จ" || bad "login ไม่สำเร็จ: $(printf '%s' "$resp" | head -c 150)"

echo "== 5) สแกนข้อความสั้น 1 ครั้งจริง"
if [ -z "$TOKEN" ]; then
  bad "ข้าม (ไม่มี token)"
else
  t0=$(date +%s)
  out="$(curl -s -m 60 -X POST "$API/api/scan" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -w $'\n%{http_code}' -d '{"text":"Metformin 500 mg ครั้งละ 1 เม็ด วันละ 2 ครั้ง หลังอาหาร เช้า-เย็น"}')"
  st="${out##*$'\n'}"; body="${out%$'\n'*}"; secs=$(( $(date +%s) - t0 ))
  pid="$(printf '%s' "$body" | jget 'o.prescription_id')"
  name="$(printf '%s' "$body" | jget 'o.result.medications[0].name')"
  if [ "$st" = "200" ] && [ -n "$name" ]; then
    used="$(docker compose logs nodered 2>/dev/null | grep "scan done id=$pid " | tail -1 | grep -o 'model=[^ ]*' | cut -d= -f2)"
    ok "สแกนได้ \"$name\" ใน ${secs} วินาที (รุ่นที่ใช้จริง: ${used:-ไม่ทราบ})"
    main_model="$(docker compose exec -T nodered printenv LLM_MODEL 2>/dev/null | tr -d '\r')"
    [ -n "$used" ] && [ -n "$main_model" ] && [ "$used" != "$main_model" ] && [ "$used" != "mock" ] && warn "ใช้รุ่นสำรอง ($used) แทนรุ่นหลัก ($main_model) — รุ่นหลักล้มเหลวหรือเบรกเกอร์เปิดอยู่"
    [ "$secs" -le 15 ] || warn "ช้า (${secs} วินาที) — อาจสลับไปรุ่นสำรอง ดู log: docker compose logs nodered | grep gemini_http"
  else
    bad "สแกนไม่สำเร็จ HTTP $st: $(printf '%s' "$body" | head -c 150)"
  fi
  [ -n "$pid" ] && curl -s -m 10 -o /dev/null -X POST "$API/api/prescriptions/$pid/discard" -H "Authorization: Bearer $TOKEN" && echo "  · ลบ draft #$pid ที่สร้างตอนเช็กแล้ว"
fi

echo "== 6) circuit breaker ของรุ่นหลัก (เก็บใน memory ของ Node-RED; ดูจากเหตุการณ์ล่าสุดใน log)"
ev="$(docker compose logs nodered 2>&1 | grep -o 'gemini_breaker \(open\|close\).*' | tail -1 | tr -d '\r')"
case "$ev" in
  "") ok "ปิด (ไม่เคยเปิดตั้งแต่ Node-RED เริ่ม)" ;;
  "gemini_breaker close"*) ok "ปิด — $ev" ;;
  *) until="$(echo "$ev" | grep -o 'until=[^ ]*' | cut -d= -f2)"
     if [ -n "$until" ] && [ "$(node -e 'console.log(Date.now()<Date.parse(process.argv[1])?1:0)' "$until")" = "1" ]; then
       warn "เปิดอยู่จนถึง $until — สแกนจะใช้รุ่นสำรองตรงๆ ($ev)"
     else
       ok "เปิดมาก่อนแล้วครบเวลา (คำขอถัดไปจะลองรุ่นหลักใหม่ 1 ครั้ง) — $ev"
     fi ;;
esac

echo
if [ "$FAIL" = 0 ]; then echo "สรุป: ✓ พร้อมนำเสนอ"; else echo "สรุป: ✗ ไม่ผ่าน $FAIL ข้อ — แก้ก่อนนำเสนอ"; exit 1; fi
