#!/usr/bin/env bash
# ทดสอบ CORS ของแอป Android ที่ nginx (วันที่ 9 ช่วง B ทาง A)
#   bash scripts/test-cors-native.sh            # ทดสอบผ่าน http://localhost:8080
#   bash scripts/test-cors-native.sh --ngrok    # ทดสอบผ่านโดเมน ngrok ด้วย (อ่าน NGROK_DOMAIN จาก .env ไม่พิมพ์ออก)
# ต้องรัน frontend ด้วย image ที่มี nginx.conf ใหม่ก่อน (docker compose up -d frontend — ถามคาเด็ทก่อนเสมอ)
# ไม่แก้ข้อมูล: OPTIONS + GET /api/config + POST /line/webhook ที่ลายเซ็นผิด (ได้ 401)
cd "$(dirname "$0")/.." || exit 1

pass=0; fail=0
ok()  { echo "  ✔ $1"; pass=$((pass+1)); }
bad() { echo "  ✘ $1"; fail=$((fail+1)); }

UA='Mozilla/5.0 (Linux; Android 14; SM-S711B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
RH='authorization,content-type,ngrok-skip-browser-warning'

# req <ชื่อไฟล์ผลลัพธ์> <curl args...>  → เก็บ header ใน $H, body ใน $B, สถานะใน $CODE
req() {
  H=$(mktemp); B=$(mktemp)
  CODE=$(curl -s --retry 3 --retry-all-errors --retry-delay 2 -m 25 -o "$B" -D "$H" -w '%{http_code}' -A "$UA" "$@" 2>/dev/null)
}
hdr() { grep -i "^$1:" "$H" | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }

run_suite() {
  local base="$1" label="$2"
  echo "== $label"

  # 1) preflight PATCH จาก origin ของแอป
  req -X OPTIONS "$base/api/medications/1/stop" -H 'Origin: https://localhost' \
      -H 'Access-Control-Request-Method: PATCH' -H "Access-Control-Request-Headers: $RH"
  [ "$CODE" = 204 ] && ok "preflight PATCH → 204" || bad "preflight PATCH ได้ $CODE (ต้อง 204)"
  [ "$(hdr access-control-allow-origin)" = "https://localhost" ] && ok "ACAO = https://localhost (ไม่ใช่ *)" || bad "ACAO = '$(hdr access-control-allow-origin)'"
  hdr access-control-allow-methods | grep -q 'PATCH' && ok "Allow-Methods มี PATCH" || bad "Allow-Methods ไม่มี PATCH: '$(hdr access-control-allow-methods)'"
  hdr access-control-allow-headers | grep -qi 'ngrok-skip-browser-warning' && hdr access-control-allow-headers | grep -qi 'authorization' && ok "Allow-Headers ครบ" || bad "Allow-Headers ไม่ครบ: '$(hdr access-control-allow-headers)'"
  [ "$(hdr access-control-max-age)" = 600 ] && ok "Max-Age = 600" || bad "Max-Age = '$(hdr access-control-max-age)'"
  head -c 300 "$B" | grep -qi '<html' && bad "preflight ได้ HTML" || ok "preflight ไม่ใช่ HTML"
  rm -f "$H" "$B"

  # 2) preflight จาก origin อื่น → ไม่มี ACAO
  req -X OPTIONS "$base/api/medications/1/stop" -H 'Origin: http://evil.example' \
      -H 'Access-Control-Request-Method: PATCH' -H "Access-Control-Request-Headers: $RH"
  [ -z "$(hdr access-control-allow-origin)" ] && ok "origin อื่น: ไม่มี ACAO (CODE=$CODE)" || bad "origin อื่นได้ ACAO '$(hdr access-control-allow-origin)'"
  rm -f "$H" "$B"

  # 3) GET จริงจาก origin ของแอป → ACAO ตรง origin เดียว (ไม่ซ้ำกับ * ของ Node-RED)
  req "$base/api/config" -H 'Origin: https://localhost' -H 'ngrok-skip-browser-warning: 1'
  [ "$CODE" = 200 ] && ok "GET /api/config → 200" || bad "GET /api/config ได้ $CODE"
  [ "$(grep -ic '^access-control-allow-origin:' "$H")" = 1 ] && ok "ACAO มีค่าเดียว" || bad "ACAO ซ้ำ/หาย: $(grep -ic '^access-control-allow-origin:' "$H") บรรทัด"
  [ "$(hdr access-control-allow-origin)" = "https://localhost" ] && ok "GET: ACAO = https://localhost" || bad "GET: ACAO = '$(hdr access-control-allow-origin)'"
  hdr content-type | grep -qi json && ok "GET เป็น JSON" || bad "GET ไม่ใช่ JSON: '$(hdr content-type)'"
  rm -f "$H" "$B"

  # 4) GET ไม่มี Origin (เว็บ same-origin/curl) → 200 JSON ไม่มี ACAO
  req "$base/api/config" -H 'ngrok-skip-browser-warning: 1'
  [ "$CODE" = 200 ] && [ -z "$(hdr access-control-allow-origin)" ] && ok "ไม่มี Origin: 200 และไม่มี ACAO" || bad "ไม่มี Origin: CODE=$CODE ACAO='$(hdr access-control-allow-origin)'"
  rm -f "$H" "$B"

  # 5) เว็บ same-origin ส่ง Origin ของตัวเอง → ไม่ได้ ACAO แต่ยังใช้งานได้
  req "$base/api/config" -H "Origin: $base" -H 'ngrok-skip-browser-warning: 1'
  [ "$CODE" = 200 ] && [ -z "$(hdr access-control-allow-origin)" ] && ok "Origin ของเว็บเอง: 200 ไม่มี ACAO" || bad "Origin ของเว็บเอง: CODE=$CODE ACAO='$(hdr access-control-allow-origin)'"
  rm -f "$H" "$B"

  # 6) /line/webhook ไม่เปลี่ยน : ลายเซ็นผิด = 401 และไม่มี header CORS
  req -X POST "$base/line/webhook" -H 'Content-Type: application/json' -H 'x-line-signature: invalid' -H 'Origin: https://localhost' -d '{"events":[]}'
  [ "$CODE" = 401 ] && ok "/line/webhook ลายเซ็นผิด → 401" || bad "/line/webhook ได้ $CODE (ต้อง 401)"
  # nginx ซ่อน header CORS ของ Node-RED ใน location นี้ (ลายเซ็น LINE เป็นตัวตรวจสิทธิ์ ไม่ใช่ CORS)
  acao=$(hdr access-control-allow-origin)
  [ -z "$acao" ] && ok "/line/webhook: ไม่มี ACAO" || bad "/line/webhook มี ACAO: '$acao'"
  rm -f "$H" "$B"
}

run_suite "http://localhost:8080" "ผ่าน nginx localhost:8080"

if [ "$1" = "--ngrok" ]; then
  d=$(grep -E '^NGROK_DOMAIN=' .env | cut -d= -f2- | tr -d '\r')
  if [ -z "$d" ]; then echo "ไม่พบ NGROK_DOMAIN ใน .env"; fail=$((fail+1)); else run_suite "https://$d" "ผ่านโดเมน ngrok"; fi
fi

echo
echo "ผ่าน $pass · ไม่ผ่าน $fail"
[ "$fail" = 0 ]
