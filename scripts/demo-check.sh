#!/usr/bin/env bash
# เช็กความพร้อมก่อนนำเสนอ — สรุป ✓/✗ ทีละข้อ (exit 1 ถ้ามีข้อใดไม่ผ่าน)
#   bash scripts/demo-check.sh
# ตรวจ: container db/nodered/frontend รันอยู่ · LINE (webhook/tunnel ngrok/โควตา/DEMO_MODE) · · เว็บ :8080 · proxy /api · Node-RED มี credentials MySQL · warm-up Gemini ใน log ·
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

echo "== 0) ไฟล์ต้องห้ามใน git (ความลับ)"
secout="$(node scripts/check-secrets.mjs --tracked 2>&1)"; secrc=$?
if [ "$secrc" -eq 0 ]; then ok "ไม่มีไฟล์ต้องห้ามถูก track (.env, flows_cred.json, .sessions.json, *.backup, .config.*.json)"
else echo "$secout" | grep "✗" | while read -r l; do echo "  $l"; done; FAIL=$((FAIL+1)); echo "  ✗ → git rm --cached <ไฟล์> แล้วเพิ่มใน .gitignore"; fi
git config core.hooksPath 2>/dev/null | grep -q githooks && ok "hook กันความลับเปิดอยู่ (core.hooksPath=.githooks)" || warn "hook กันความลับยังไม่เปิด — รัน: bash scripts/setup-hooks.sh"

echo "== 1) container"
for svc in db nodered frontend; do
  state="$(docker compose ps --format '{{.State}}' "$svc" 2>/dev/null | head -1)"
  [ "$state" = "running" ] && ok "$svc: running" || bad "$svc: ${state:-ไม่พบ} (docker compose up -d --build)"
done
health="$(docker compose ps --format '{{.Health}}' db 2>/dev/null | head -1)"
[ -z "$health" ] || [ "$health" = "healthy" ] && ok "db: ${health:-ไม่มี healthcheck}" || bad "db: $health"

# image frontend ต้องไม่เก่ากว่าไฟล์ที่ถูกแก้ล่าสุดใน frontend/ (หน้าเว็บใน container ไม่อัปเดตจนกว่าจะ build ใหม่)
# เทียบเวลาแก้ไฟล์จริง (ไม่ใช่เวลา commit — commit ทีหลัง build ไม่ได้แปลว่าโค้ดเปลี่ยน)
fe_name="$(docker compose config --images 2>/dev/null | grep -i frontend | head -1)"
fe_built="$(docker image inspect "$fe_name" --format '{{.Created}}' 2>/dev/null)"
fe_new="$(find frontend/src frontend/public frontend/nginx.conf frontend/package.json frontend/angular.json frontend/ngsw-config.json frontend/Dockerfile -type f -printf '%T@ %p
' 2>/dev/null | sort -nr | head -1)"
if [ -n "$fe_built" ] && [ -n "$fe_new" ]; then
  fe_t="${fe_new%% *}"; fe_f="${fe_new#* }"
  if [ "$(node -e 'console.log(Date.parse(process.argv[1]) / 1000 < Number(process.argv[2]) ? 1 : 0)' "$fe_built" "$fe_t")" = "1" ]; then
    warn "image frontend (build $fe_built) เก่ากว่าไฟล์ที่แก้ล่าสุด ($fe_f) — รัน: docker compose up -d --build frontend"
  else ok "image frontend ใหม่กว่าไฟล์ล่าสุดใน frontend/ ($fe_f)"; fi
else warn "เช็กอายุ image frontend ไม่ได้ (ไม่พบ image/ไฟล์)"; fi
fe_run="$(docker inspect "$(docker compose ps -q frontend 2>/dev/null | head -1)" --format '{{.Image}}' 2>/dev/null)"
fe_tag="$(docker image inspect "$fe_name" --format '{{.Id}}' 2>/dev/null)"
[ -n "$fe_run" ] && [ -n "$fe_tag" ] && [ "$fe_run" != "$fe_tag" ] && warn "container frontend ที่รันอยู่ใช้ image คนละตัวกับ image ล่าสุด — รัน: docker compose up -d --force-recreate frontend"
[ -n "$(git status --porcelain -- frontend 2>/dev/null | grep -v '^??' | head -1)" ] && warn "มีไฟล์ใน frontend/ ที่แก้แล้วแต่ยังไม่ commit"

echo "== 2) เว็บและ API"
[ "$(code "$WEB/")" = "200" ] && ok "เว็บ $WEB ตอบ 200" || bad "เว็บ $WEB ไม่ตอบ 200"
[ "$(code "$WEB/api/me")" = "401" ] && ok "nginx proxy /api → Node-RED (ไม่มี token = 401)" || bad "$WEB/api/me ควรได้ 401"
[ "$(code "$API/api/me")" = "401" ] && ok "Node-RED $API ตอบ" || bad "Node-RED $API ไม่ตอบ"
[ "$(code "$WEB/api/stats/adherence")" = "401" ] && ok "GET /api/stats/adherence ไม่มี JWT = 401 (tab 5-Dashboard)" || bad "$WEB/api/stats/adherence ควรได้ 401 (tab 5-Dashboard โหลดแล้วหรือยัง?)"
[ "$(code "$WEB/manifest.webmanifest")" = "200" ] && ok "manifest.webmanifest ตอบ 200" || bad "manifest.webmanifest ไม่ตอบ 200"
if [ "$(code "$WEB/ngsw.json")" = "200" ]; then
  ok "ngsw.json ตอบ 200"
  curl -s -m 10 "$WEB/ngsw.json" | grep -q '/api' && bad "ngsw.json มี /api — ห้ามแคช API ใน service worker (ข้อมูลข้ามผู้ใช้)" || ok "ngsw.json ไม่มี /api (ไม่แคชข้อมูลสุขภาพใน service worker)"
else bad "ngsw.json ไม่ตอบ 200"; fi

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

echo "== 7) LINE: webhook · tunnel · โควตา · DEMO_MODE"
envf() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '
' | sed -e "s/^['\"]//" -e "s/['\"]$//"; }
LINE_TOKEN="$(envf LINE_CHANNEL_ACCESS_TOKEN)"
LINE_BASE="$(envf LINE_API_BASE)"; LINE_BASE="${LINE_BASE:-https://api.line.me}"
NG_DOMAIN="$(envf NGROK_DOMAIN)"
[ -n "$(docker compose exec -T nodered printenv LINE_CHANNEL_SECRET 2>/dev/null | tr -d '
')" ] && ok "LINE_CHANNEL_SECRET ตั้งแล้ว" || bad "LINE_CHANNEL_SECRET ว่าง (ใส่ใน .env แล้ว docker compose up -d --force-recreate nodered)"
[ -n "$LINE_TOKEN" ] && ok "LINE_CHANNEL_ACCESS_TOKEN ตั้งแล้ว" || bad "LINE_CHANNEL_ACCESS_TOKEN ว่าง"
oa="$(docker compose exec -T nodered printenv LINE_OA_BASIC_ID 2>/dev/null | tr -d '
')"
[ -n "$oa" ] && ok "LINE_OA_BASIC_ID = $oa" || bad "LINE_OA_BASIC_ID ว่าง (ลิงก์ \"เปิด LINE แล้วกดส่ง\" จะไม่มี)"
# webhook ใน nginx: signature ผิดต้องได้ 401 (พิสูจน์ว่า route ถึง Node-RED และตรวจ signature)
[ "$(curl -s -o /dev/null -m 10 -w '%{http_code}' -X POST "$WEB/line/webhook" -H 'x-line-signature: x' -H 'Content-Type: application/json' -d '{"events":[]}')" = "401" ] && ok "POST $WEB/line/webhook (signature ผิด) = 401" || bad "POST /line/webhook ควรได้ 401"
pbu="$(docker compose exec -T nodered printenv PUBLIC_BASE_URL 2>/dev/null | tr -d '\r')"
if printf '%s' "$pbu" | grep -qE '^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(/.*)?$' && ! printf '%s' "$pbu" | grep -q 'example'; then ok "PUBLIC_BASE_URL ใน container = $pbu"
else bad "PUBLIC_BASE_URL ใน container ไม่มีโดเมน ('${pbu:-ว่าง}') — ใน .env ต้องประกาศ NGROK_DOMAIN ก่อนบรรทัด PUBLIC_BASE_URL=https://\${NGROK_DOMAIN} แล้ว docker compose up -d --force-recreate nodered"; fi
tstate="$(docker compose ps --all --format '{{.State}}' tunnel 2>/dev/null | head -1)"
if [ "$tstate" = "running" ]; then
  # tunnel ต้องต่อ network เดียวกับ frontend (หลัง docker compose down/up network ถูกสร้างใหม่ แต่ tunnel เก่าอาจค้างกับ network เดิม → "network … not found" / ngrok ต่อ frontend ไม่ได้)
  fe_id="$(docker compose ps -q frontend 2>/dev/null | head -1)"; tn_id="$(docker compose ps --all -q tunnel 2>/dev/null | head -1)"
  fe_net="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$v.NetworkID}} {{end}}' "$fe_id" 2>/dev/null)"
  tn_net="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$v.NetworkID}} {{end}}' "$tn_id" 2>/dev/null)"
  if [ -n "$fe_net" ] && [ -n "$tn_net" ] && [ "$fe_net" = "$tn_net" ]; then ok "tunnel อยู่ network เดียวกับ frontend"
  else bad "tunnel ไม่ได้อยู่ network เดียวกับ frontend (network เก่าค้างหลัง down/up) — แก้: docker compose --profile tunnel up -d --force-recreate tunnel"; fi
  pub="$(curl -s -m 5 http://127.0.0.1:4040/api/tunnels 2>/dev/null | jget 'o.tunnels[0].public_url')"
  if [ -n "$pub" ]; then
    ok "tunnel (ngrok) รันอยู่: $pub"
    [ -n "$NG_DOMAIN" ] && [ "$pub" != "https://$NG_DOMAIN" ] && warn "public_url ไม่ตรง NGROK_DOMAIN ($NG_DOMAIN)"
    [ "$(code "$pub/api/me" -H 'ngrok-skip-browser-warning: 1')" = "401" ] && ok "ผ่าน tunnel: /api/me = 401" || bad "ผ่าน tunnel: /api/me ไม่ใช่ 401"
    [ "$(code -X POST "$pub/line/webhook" -H 'x-line-signature: x' -d '{}')" = "401" ] && ok "ผ่าน tunnel: /line/webhook (signature ผิด) = 401" || bad "ผ่าน tunnel: /line/webhook ไม่ใช่ 401"
    if curl -s -m 10 "$pub/flows" -H 'ngrok-skip-browser-warning: 1' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{JSON.parse(s);process.exit(0)}catch(e){process.exit(1)}})'; then bad "ผ่าน tunnel: /flows ได้ JSON — editor/admin API หลุดออกไป!"; else ok "ผ่าน tunnel: /flows ไม่ใช่ Node-RED"; fi
  else warn "tunnel รันอยู่แต่อ่าน inspector (127.0.0.1:4040) ไม่ได้ — ดู docker compose logs tunnel (NGROK_AUTHTOKEN/NGROK_DOMAIN ถูกไหม)"; fi
else
  bad "tunnel (ngrok) ไม่ได้รัน (สถานะ: ${tstate:-ไม่มี container}) — LINE ส่ง webhook เข้ามาไม่ได้ ; รัน: docker compose --profile tunnel up -d (ดู docker compose logs tunnel)"
fi
# รูปน้องยาตรงใน Flex: ต้องโหลดด้วย User-Agent ที่ไม่ใช่เบราว์เซอร์ได้ 200 image/png (ngrok ฟรีแสดงหน้าเตือนให้เฉพาะเบราว์เซอร์)
asset="$(docker compose exec -T nodered printenv LINE_ASSET_BASE 2>/dev/null | tr -d '')"; asset="${asset:-${pbu%/}/line}"; asset="${asset%/}"
legacy="$(docker compose exec -T nodered printenv LINE_MASCOT_URL 2>/dev/null | tr -d '')"
if printf '%s' "$asset" | grep -q '^https://'; then
  for f in mascot-bell.png mascot-cheer.png mascot-hello.png; do
    u="$asset/$f"
    mh="$(curl -s -m 15 -o /dev/null -D - -A 'LineBotWebhook/2.0' "$u" 2>/dev/null | tr -d '')"
    mcode="$(printf '%s' "$mh" | head -1 | awk '{print $2}')"; mtype="$(printf '%s' "$mh" | grep -i '^content-type:' | head -1 | awk '{print tolower($2)}')"
    [ "$mcode" = "200" ] && [ "${mtype%%;*}" = "image/png" ] && ok "รูปน้องยาตรง $u = 200 image/png (UA ไม่ใช่เบราว์เซอร์)" || bad "รูปน้องยาตรง $u ได้ HTTP ${mcode:-?} ${mtype:-?} (ต้อง 200 image/png) — ถ้าเป็นหน้า HTML ของ ngrok ให้ย้ายรูปไปโฮสต์อื่นแล้วตั้ง LINE_ASSET_BASE ; ถ้า 404 รัน docker compose up -d --build frontend"
  done
else warn "ข้ามเช็กรูปน้องยาตรง (LINE_ASSET_BASE '$asset' ไม่ใช่ https)"; fi
[ -n "$legacy" ] && warn "LINE_MASCOT_URL ($legacy) ยังตั้งอยู่ — ใช้เป็นรูปท่ากระดิ่งแทน mascot-bell.png (ลบออกจาก .env ถ้าไม่ต้องการ)"
if [ -n "$LINE_TOKEN" ] && [ "$LINE_BASE" = "https://api.line.me" ]; then
  wep="$(curl -s -m 10 https://api.line.me/v2/bot/channel/webhook/endpoint -H "Authorization: Bearer $LINE_TOKEN")"
  wurl="$(printf '%s' "$wep" | jget 'o.endpoint')"; wact="$(printf '%s' "$wep" | jget 'o.active')"
  if [ -z "$wurl" ]; then warn "ยังไม่ได้ตั้ง Webhook URL ใน LINE Developers Console"
  elif [ -n "$NG_DOMAIN" ] && [ "$wurl" != "https://$NG_DOMAIN/line/webhook" ]; then warn "Webhook URL ใน LINE ($wurl) ไม่ตรงกับ https://$NG_DOMAIN/line/webhook"
  else ok "Webhook URL ใน LINE: $wurl"; fi
  [ "$wact" = "true" ] && ok "Use webhook = เปิด" || warn "Use webhook ยังไม่เปิด (active=$wact)"
  cap="$(envf LINE_PUSH_MONTHLY_CAP)"; cap="${cap:-200}"; rsv="$(envf LINE_PUSH_RESERVE)"; rsv="${rsv:-30}"
  qj="$(curl -s -m 10 https://api.line.me/v2/bot/message/quota -H "Authorization: Bearer $LINE_TOKEN")"
  cj="$(curl -s -m 10 https://api.line.me/v2/bot/message/quota/consumption -H "Authorization: Bearer $LINE_TOKEN")"
  qtype="$(printf '%s' "$qj" | jget 'o.type')"; qreal="$(printf '%s' "$qj" | jget 'o.value')"; used="$(printf '%s' "$cj" | jget 'o.totalUsage')"
  if [ -z "$qtype" ]; then warn "อ่านโควตาจาก LINE ไม่ได้ (token ถูกไหม?)"; else
    src="LINE"
    if [ -z "$used" ]; then used="$(docker compose exec -T db sh -c 'mysql -N -B -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM notification_logs WHERE channel=\"line_push\" AND success=1 AND sent_at >= DATE_FORMAT(NOW(), \"%Y-%m-01\")"' 2>/dev/null | tr -d '
')"; src="notification_logs"; fi
    node -e '
      const [cap, rsv, type, real, used, src] = process.argv.slice(1);
      const eff = type === "limited" ? Math.min(+cap, +real) : +cap, u = +used || 0;
      console.log("  ✓ โควตา push: จริงจาก LINE = " + (type === "limited" ? real : "ไม่จำกัด") + " · เพดานที่ตั้ง = " + cap + " → ใช้เพดาน " + eff);
      console.log("    ใช้ไปแล้ว " + u + " (นับจาก " + src + ") · เหลือสำหรับเตือนปกติ " + Math.max(eff - +rsv - u, 0) + " (กันไว้ " + rsv + ") · เหลือสำหรับแจ้งญาติ " + Math.max(eff - u, 0));
    ' "$cap" "$rsv" "$qtype" "$qreal" "$used" "$src"
  fi
else
  warn "ข้ามการเช็ก webhook/โควตากับ LINE จริง (ไม่มี token หรือ LINE_API_BASE ไม่ใช่ api.line.me)"
fi
ed="$(code "$API/flows")"
case "$ed" in 401) ok "editor/admin API ของ Node-RED ล็อกด้วยรหัสผ่าน (ตรง :1880 ได้ 401)" ;; 404) ok "editor/admin API ปิดอยู่ (fail closed: ไม่มี NODE_RED_ADMIN_HASH ที่ถูกต้อง) — http-in ยังใช้งานได้" ;; 200) bad "editor/admin API เปิดโดยไม่ต้อง login (ตรง :1880 ได้ 200)!" ;; *) warn "เช็ก editor ไม่ได้ (HTTP $ed)" ;; esac
docker compose logs nodered 2>&1 | grep -q 'ค่าตัวอย่าง (รหัส demo1234)' && warn "NODE_RED_ADMIN_HASH ยังเป็นค่าตัวอย่าง demo1234 — ห้ามเปิด tunnel"
dm="$(docker compose exec -T nodered printenv DEMO_MODE 2>/dev/null | tr -d '
')"
[ "$dm" = "true" ] && warn "DEMO_MODE=true — ปุ่ม \"ทดลองส่งเตือนตอนนี้\" / \"ทดลองแจ้งญาติตอนนี้\" เปิดอยู่ (ปิดเมื่อใช้งานจริง)" || ok "DEMO_MODE=${dm:-false}"
# แจ้งญาติ (7A): ญาติที่เชื่อม LINE แล้ว · จำนวนการแจ้งเดือนนี้ · เตือนซ้ำผู้ป่วย
cgn="$(docker compose exec -T db sh -c 'mysql -N -B -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM caregivers WHERE is_active=1 AND line_user_id IS NOT NULL; SELECT COUNT(*) FROM dose_escalations WHERE sent_at >= DATE_FORMAT(NOW(), \"%Y-%m-01\")" 2>/dev/null' | tr '
' ' ')"
if [ -n "$cgn" ]; then ok "แจ้งญาติ: ผู้ดูแลที่เชื่อม LINE แล้ว ${cgn%% *} คน · แจ้งไปแล้วเดือนนี้ $(printf '%s' "$cgn" | awk '{print $2}') รายการ"; else warn "อ่านข้อมูลแจ้งญาติจากฐานข้อมูลไม่ได้ (รัน bash scripts/migrate.sh แล้วหรือยัง?)"; fi
fu="$(docker compose exec -T nodered printenv REMINDER_FOLLOWUP_MIN 2>/dev/null | tr -d '')"
[ -n "$fu" ] && [ "$fu" != "0" ] && ok "เตือนซ้ำผู้ป่วย: เปิด (เลยเวลามา $fu นาที)" || ok "เตือนซ้ำผู้ป่วย: ปิด (REMINDER_FOLLOWUP_MIN=0)"


echo "== 8) Web Push (แจ้งเตือนบนเครื่อง)"
# คีย์ VAPID: ตรวจว่าตั้งครบและเป็นคู่กัน โดยไม่แสดงค่าใดๆ (สร้างด้วย node scripts/gen-vapid.mjs แล้ว docker compose up -d --force-recreate nodered)
vres="$(docker compose exec -T nodered node -e '
const c=require("crypto"), e=process.env, miss=["VAPID_PUBLIC_KEY","VAPID_PRIVATE_KEY","VAPID_SUBJECT"].filter(k=>!String(e[k]||"").trim());
if (miss.length) { console.log("MISSING " + miss.join(",")); process.exit(0); }
try {
  const priv=Buffer.from(e.VAPID_PRIVATE_KEY.trim(),"base64url"), pub=Buffer.from(e.VAPID_PUBLIC_KEY.trim(),"base64url");
  if (priv.length!==32) { console.log("PRIV_LEN"); process.exit(0); }
  if (pub.length!==65) { console.log("PUB_LEN"); process.exit(0); }
  if (pub[0]!==4) { console.log("PUB_PREFIX"); process.exit(0); }
  const k=c.createECDH("prime256v1"); k.setPrivateKey(priv);
  if (!k.getPublicKey().equals(pub)) { console.log("MISMATCH"); process.exit(0); }
} catch (x) { console.log("MISMATCH"); process.exit(0); }
const s=e.VAPID_SUBJECT.trim();
console.log(/^(mailto:[^@\s]+@[^@\s]+|https:\/\/\S+)$/.test(s) ? (/^mailto:.*(example|localhost)/i.test(s) ? "OK_WEAKSUBJECT" : "OK") : "BADSUBJECT");
' 2>/dev/null | tr -d '')"
case "$vres" in
  OK) ok "VAPID: private 32 ไบต์ · public 65 ไบต์ขึ้นต้น 0x04 · เป็นคู่กัน · SUBJECT ตั้งแล้ว (ไม่แสดงค่า)" ;;
  OK_WEAKSUBJECT) ok "VAPID ตั้งครบ และเป็นคู่กัน (ไม่แสดงค่า)"; warn "VAPID_SUBJECT เป็น mailto ของโดเมนสมมติ — Android/Chrome ไม่สน แต่ถ้า iPhone ไม่ได้รับแจ้งเตือน (log: status=403 BadJwtToken) ให้เปลี่ยนเป็น https://<NGROK_DOMAIN> แล้ว docker compose up -d --force-recreate nodered" ;;
  MISSING*) bad "VAPID ไม่ครบใน container (${vres#MISSING }) — รัน: node scripts/gen-vapid.mjs ; ตั้ง VAPID_SUBJECT ใน .env ; docker compose up -d --force-recreate nodered" ;;
  PRIV_LEN) bad "VAPID_PRIVATE_KEY ถอดแล้วไม่ใช่ 32 ไบต์ (ถูกตัด 0 นำหน้า?)  — ลบทั้งสองบรรทัด VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY ใน .env แล้วรัน node scripts/gen-vapid.mjs (แล้ว recreate nodered)" ;;
  PUB_LEN) bad "VAPID_PUBLIC_KEY ถอดแล้วไม่ใช่ 65 ไบต์  — ลบทั้งสองบรรทัด VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY ใน .env แล้วรัน node scripts/gen-vapid.mjs (แล้ว recreate nodered)" ;;
  PUB_PREFIX) bad "VAPID_PUBLIC_KEY ไม่ได้ขึ้นต้นด้วย 0x04 (ไม่ใช่ uncompressed point) — ลบทั้งสองบรรทัด VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY ใน .env แล้วรัน node scripts/gen-vapid.mjs (แล้ว recreate nodered)" ;;
  MISMATCH) bad "VAPID_PUBLIC_KEY กับ VAPID_PRIVATE_KEY ไม่ใช่คู่กัน (หรือรูปแบบผิด) — อย่าแก้ทีละตัว ลบทั้งคู่ใน .env แล้วรัน node scripts/gen-vapid.mjs" ;;
  BADSUBJECT) bad "VAPID_SUBJECT ต้องเป็น mailto:อีเมล หรือ https://โดเมน" ;;
  *) warn "ตรวจ VAPID ไม่ได้ (nodered ไม่ตอบ)" ;;
esac
# ตัวแปรเฉพาะทดสอบ (ยอมรับ cert เซ็นเอง / โฮสต์ push ปลอม) ต้องว่างตอนใช้งานจริง — ไม่แสดงค่า
for k in PUSH_ALLOW_INSECURE_TLS PUSH_ENDPOINT_ALLOW; do
  in_env="$(grep -E "^$k=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//' | tr -d '"' | tr -d "'" | tr -d ' ')"
  in_ctr="$(docker compose exec -T nodered printenv "$k" 2>/dev/null | tr -d '')"
  if [ -n "$in_env" ] || [ -n "$in_ctr" ]; then bad "$k มีค่า ($( [ -n "$in_env" ] && echo '.env' )$( [ -n "$in_env" ] && [ -n "$in_ctr" ] && echo ' + ' )$( [ -n "$in_ctr" ] && echo 'container')) — ตัวแปรนี้ใช้เฉพาะรันชุดทดสอบ ลบออกจาก .env แล้ว docker compose up -d --force-recreate nodered"
  else ok "$k ว่าง (ปลอดภัย)"; fi
done
pk_code="$(code "$WEB/api/push/public-key")"
if [ "$vres" = "OK" ] || [ "$vres" = "OK_WEAKSUBJECT" ]; then
  [ "$pk_code" = "200" ] && ok "GET /api/push/public-key = 200 (ผ่าน nginx)" || bad "GET /api/push/public-key ได้ $pk_code (ควร 200)"
else
  [ "$pk_code" = "503" ] && ok "GET /api/push/public-key = 503 PUSH_NOT_CONFIGURED (ยังไม่ตั้ง VAPID — หน้าตั้งค่าจะแจ้งผู้ใช้ให้เอง)" || warn "GET /api/push/public-key ได้ $pk_code"
fi
pn="$(docker compose exec -T db sh -c 'mysql -N -B -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -e "SELECT COUNT(*), COUNT(DISTINCT user_id), IFNULL(SUM(fail_count>0),0) FROM push_subscriptions; SELECT COUNT(*) FROM users WHERE notify_both=1"' 2>/dev/null | tr '
	' '  ')"
if [ -n "$pn" ]; then
  set -- $pn
  ok "เครื่องที่เปิดแจ้งเตือน: $1 เครื่อง ($2 ผู้ใช้) · ส่งล้มเหลวค้างอยู่ $3 เครื่อง · เปิด \"ส่งทั้ง LINE และแจ้งเตือนบนเครื่อง\" $4 คน"
  [ "${3:-0}" != "0" ] && warn "มีเครื่องที่ fail_count > 0 — ดู: docker compose logs nodered | grep web_push_error"
else warn "อ่านจำนวน push_subscriptions ไม่ได้ (ยังไม่ได้รัน bash scripts/migrate.sh?)"; fi
# service worker + manifest ต้องได้ไฟล์จริงผ่านทุกทาง (ngrok ฟรีอาจแทรกหน้าเตือน HTML ให้คำขอที่ดูเหมือนเบราว์เซอร์ → ลงทะเบียน SW ไม่ได้)
swcheck() { # swcheck LABEL BASE_URL [extra curl args…]  — ตรวจว่าได้ไฟล์จริง (ไม่ใช่ HTML) และ no-cache
  local label="$1" base="$2"; shift 2
  local f h ct cc body
  for f in ngsw-worker.js manifest.webmanifest ngsw.json; do
    h="$(curl -s -m 10 -D - -o /tmp/yt-sw-body "$@" -A 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' -H 'Accept: */*' "$base/$f" | tr -d '')"
    ct="$(printf '%s' "$h" | grep -i '^content-type:' | tail -1 | cut -d: -f2- | tr 'A-Z' 'a-z')"
    cc="$(printf '%s' "$h" | grep -i '^cache-control:' | tail -1 | cut -d: -f2- | tr 'A-Z' 'a-z')"
    body="$(head -c 300 /tmp/yt-sw-body 2>/dev/null)"
    if printf '%s' "$h" | head -1 | grep -q ' 200' && ! printf '%s%s' "$ct" "$body" | grep -qiE 'text/html|<!doctype|<html'; then
      case "$cc" in *no-cache*) ok "$label /$f = 200 ($(printf '%s' "$ct" | cut -d';' -f1 | tr -d ' ')) · no-cache" ;; *) bad "$label /$f ไม่มี Cache-Control: no-cache (ได้ '${cc:-ไม่มี}') — เบราว์เซอร์อาจใช้ service worker เก่า" ;; esac
    else bad "$label /$f ไม่ได้ไฟล์จริง (ได้ $(printf '%s' "$h" | head -1) / ${ct:-ไม่มี content-type}) — ถ้าเป็นหน้า HTML: build frontend ใหม่ (docker compose up -d --build frontend)"; fi
  done
  rm -f /tmp/yt-sw-body
}
swcheck "เว็บ" "$WEB"
if [ -n "${pub:-}" ]; then
  # ngrok ฟรีแทรกหน้าเตือน (HTML) ให้คำขอที่ดูเหมือนเบราว์เซอร์จนกว่าจะกด Visit Site (ตั้ง cookie) → ตรวจ 2 แบบ
  #  1) เหมือนเบราว์เซอร์ที่กด Visit Site แล้ว (ส่ง header ข้ามหน้าเตือน) — ต้องได้ไฟล์จริง ไม่งั้นลงทะเบียน service worker ไม่ได้
  swcheck "tunnel (หลังกด Visit Site)" "$pub" -H 'ngrok-skip-browser-warning: 1'
  #  2) เบราว์เซอร์ที่ยังไม่เคยกด — คาดว่าได้หน้าเตือน (แจ้งเฉยๆ ไม่ผิด)
  first="$(curl -s -m 10 -o /dev/null -w '%{content_type}' -A 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' -H 'Accept: text/html' "$pub/")"
  case "$first" in text/html*) warn "ngrok ฟรี: เปิดครั้งแรกด้วยเบราว์เซอร์จะเจอหน้า \"Visit Site\" — กดครั้งเดียวต่ออุปกรณ์ ; iPhone ที่เปิดจากไอคอนหน้าจอโฮม cookie แยกจาก Safari ต้องกดอีกครั้งในแอป (ดู docs/web-push-test.md)" ;; esac
else warn "ข้ามเช็ก service worker ผ่าน tunnel (tunnel ไม่ได้รัน)"; fi

echo
if [ "$FAIL" = 0 ]; then echo "สรุป: ✓ พร้อมนำเสนอ"; else echo "สรุป: ✗ ไม่ผ่าน $FAIL ข้อ — แก้ก่อนนำเสนอ"; exit 1; fi
