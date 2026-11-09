#!/usr/bin/env bash
# ตรวจ tunnel (Tailscale Funnel) "จากภายนอก" ด้วย curl เปล่าๆ — ไม่ใส่ header พิเศษ ไม่ส่งข้อความจริง ไม่เขียนข้อมูล (อ่านอย่างเดียว)
#   bash scripts/test-tunnel.sh                # ใช้ https://$TS_PUBLIC_HOST จาก .env
#   bash scripts/test-tunnel.sh https://…      # หรือระบุ URL เอง
#   BUNDLE_MAX_SEC=10 bash scripts/test-tunnel.sh   # เกณฑ์เวลาโหลดไฟล์ใหญ่สุด (ค่าเริ่มต้น 10 วินาที)
# ชื่อ *.ts.net เต็มถือเป็นความลับ → แสดงแบบปิดชื่อ tailnet เสมอ
set -u
cd "$(dirname "$0")/.."
URL="${1:-}"
if [ -z "$URL" ]; then
  h="$(grep -E '^TS_PUBLIC_HOST=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | sed -e "s/^['\"]//" -e "s/['\"]$//")"
  [ -n "$h" ] && URL="https://$h"
fi
URL="${URL%/}"
MAX="${BUNDLE_MAX_SEC:-10}"
PASS=0; FAIL=0
ok()  { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
mask() { printf '%s' "$1" | sed -E 's#^(https?://[^./]+)\..*\.ts\.net#\1.•••.ts.net#'; }
if ! printf '%s' "$URL" | grep -qE '^(https://[A-Za-z0-9.-]+|http://(localhost|127.0.0.1)(:[0-9]+)?)$' || printf '%s' "$URL" | grep -q 'your-tailnet'; then
  echo "ไม่มี URL ที่ใช้ได้ — ตั้ง TS_PUBLIC_HOST ใน .env (ดู docs/day12-cutover.md) หรือส่ง URL เป็นอาร์กิวเมนต์"; exit 2
fi
echo "ทดสอบ tunnel: $(mask "$URL")   (curl เปล่า ไม่มี header พิเศษ)"
UA='Mozilla/5.0 (Linux; Android 14; SM-S711B) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'
tmp="$(mktemp)"; trap 'rm -f "$tmp" "$tmp.h"' EXIT
get() { curl -s -m 20 -A "$UA" -D "$tmp.h" -o "$tmp" -w '%{http_code}' "$@"; }          # คืนสถานะ ; header ที่ $tmp.h ; body ที่ $tmp
hdr() { grep -i "^$1:" "$tmp.h" | tail -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//' | tr 'A-Z' 'a-z'; }
isjson() { node -e 'try{JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(0)}catch(e){process.exit(1)}' "$1"; }

echo "== 1) หน้าแรกและไฟล์ของแอป"
c="$(get "$URL/")"; ct="$(hdr content-type)"
if [ "$c" = "200" ] && printf '%s' "$ct" | grep -q 'text/html' && grep -q '<app-root' "$tmp" && ! grep -qi 'ngrok\|visit site\|interstitial' "$tmp"; then ok "GET / = 200 HTML ของแอป (<app-root>) ไม่ใช่หน้าเตือน"; else bad "GET / ไม่ใช่หน้าแอป (สถานะ $c, $ct)"; fi
c="$(get "$URL/manifest.webmanifest")"; ct="$(hdr content-type)"; cc="$(hdr cache-control)"
[ "$c" = "200" ] && printf '%s' "$ct" | grep -q 'application/manifest+json' && isjson "$tmp" && ok "manifest.webmanifest = 200 application/manifest+json (JSON ถูกต้อง)" || bad "manifest.webmanifest ผิด (สถานะ $c, $ct)"
printf '%s' "$cc" | grep -q 'no-cache' && ok "manifest: Cache-Control no-cache" || bad "manifest ไม่มี no-cache (ได้ '${cc:-ไม่มี}')"
c="$(get "$URL/ngsw.json")"; ct="$(hdr content-type)"; cc="$(hdr cache-control)"
[ "$c" = "200" ] && printf '%s' "$ct" | grep -q 'json' && isjson "$tmp" && ok "ngsw.json = 200 JSON" || bad "ngsw.json ผิด (สถานะ $c, $ct)"
printf '%s' "$cc" | grep -q 'no-cache' && ok "ngsw.json: Cache-Control no-cache" || bad "ngsw.json ไม่มี no-cache"
grep -q '"/api' "$tmp" && bad "ngsw.json มี /api — ห้ามแคช API ใน service worker" || ok "ngsw.json ไม่มี /api"
c="$(get "$URL/ngsw-worker.js")"; ct="$(hdr content-type)"; cc="$(hdr cache-control)"
[ "$c" = "200" ] && printf '%s' "$ct" | grep -qE 'javascript' && ! head -c 200 "$tmp" | grep -qi '<html\|<!doctype' && ok "ngsw-worker.js = 200 JavaScript" || bad "ngsw-worker.js ผิด (สถานะ $c, $ct)"
printf '%s' "$cc" | grep -q 'no-cache' && ok "ngsw-worker.js: Cache-Control no-cache" || bad "ngsw-worker.js ไม่มี no-cache"
c="$(get "$URL/line/mascot-bell.png")"; ct="$(hdr content-type)"
[ "$c" = "200" ] && [ "${ct%%;*}" = "image/png" ] && ok "/line/mascot-bell.png = 200 image/png (LINE ดึงรูปได้)" || bad "/line/mascot-bell.png ผิด (สถานะ $c, $ct)"

echo "== 2) API (สาธารณะ/ต้อง JWT) — ไม่ส่ง header ใดๆ นอกจากปกติ"
c="$(get "$URL/api/config")"
if [ "$c" = "200" ] && isjson "$tmp"; then
  keys="$(node -e 'console.log(Object.keys(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))).sort().join(","))' "$tmp")"
  [ "$keys" = "demoMode" ] && ok "GET /api/config = 200 JSON มีแค่ demoMode" || bad "GET /api/config มี field อื่น ($keys)"
else bad "GET /api/config ไม่ใช่ 200 JSON (สถานะ $c) — ถ้าเป็น HTML อาจเป็นหน้าเตือน/DNS ยังไม่พร้อม"; fi
a="$(curl -s -m 20 "$URL/api/config")"; b="$(curl -s -m 20 -H 'ngrok-skip-browser-warning: 1' "$URL/api/config")"
[ -n "$a" ] && [ "$a" = "$b" ] && ok "/api/config เหมือนกันทั้งมีและไม่มี header ngrok-skip-browser-warning (header เดิมไม่มีผลกับ Funnel)" || bad "/api/config ต่างกันเมื่อมี/ไม่มี header ngrok"
c="$(get "$URL/api/me")"; [ "$c" = "401" ] && isjson "$tmp" && ok "GET /api/me ไม่มี JWT = 401 JSON" || bad "GET /api/me ควรได้ 401 JSON (ได้ $c)"
c="$(get "$URL/api/stats/adherence")"; [ "$c" = "401" ] && ok "GET /api/stats/adherence ไม่มี JWT = 401" || bad "GET /api/stats/adherence ควรได้ 401 (ได้ $c)"
c="$(get -X POST "$URL/line/webhook" -H 'x-line-signature: x' -H 'Content-Type: application/json' -d '{"events":[]}')"; [ "$c" = "401" ] && ok "POST /line/webhook (signature ผิด) = 401" || bad "POST /line/webhook ควรได้ 401 (ได้ $c)"
c="$(get -X POST "$URL/line/webhook" -H 'Content-Type: application/json' -d '{"events":[]}')"; [ "$c" = "401" ] && ok "POST /line/webhook (ไม่มี signature) = 401" || bad "POST /line/webhook ไม่มี signature ควรได้ 401 (ได้ $c)"

echo "== 3) editor/admin API ของ Node-RED ต้องเข้าไม่ได้ (เช็กเนื้อหา ไม่ใช่แค่สถานะ — SPA fallback ตอบ 200 เป็น HTML ของแอปได้)"
for p in /flows /flows/ /red /red/ /settings /nodes /auth/login /auth/token /admin /context /library/flows; do
  c="$(get "$URL$p")"
  if isjson "$tmp" && ! grep -q '<app-root' "$tmp"; then bad "$p ได้ JSON ($c) — อาจเป็น Node-RED admin API หลุดออกมา!"
  elif grep -qiE '<title>\s*Node-RED|node-red-editor|RED\.main|"httpNodeRoot"' "$tmp"; then bad "$p เป็นหน้า/ข้อมูลของ Node-RED editor!"
  elif [ "$c" = "200" ] && grep -q '<app-root' "$tmp"; then ok "$p = 200 แต่เป็น HTML ของแอป (SPA fallback) ไม่ใช่ Node-RED"
  else ok "$p = $c ไม่ใช่ Node-RED"; fi
done
c="$(get -X POST "$URL/flows" -H 'Content-Type: application/json' -d '[]')"; case "$c" in 2*) isjson "$tmp" && bad "POST /flows ได้ JSON ($c) — เขียน flow ได้จากภายนอก!" || ok "POST /flows = $c (ไม่ใช่ API ของ Node-RED)" ;; *) ok "POST /flows = $c" ;; esac

echo "== 4) เวลาโหลดไฟล์ใหญ่สุดของ bundle (เกณฑ์ ≤ ${MAX} วินาที/ไฟล์ ; ค่ากลางจาก 3 ครั้ง)"
get "$URL/ngsw.json" >/dev/null
files="$(node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const s=new Set();for(const g of j.assetGroups||[])for(const u of g.urls||[])if(/\.(js|css|woff2?)$/.test(u))s.add(u);console.log([...s].join("\n"))' "$tmp" 2>/dev/null)"
if [ -z "$files" ]; then bad "อ่านรายการไฟล์จาก ngsw.json ไม่ได้"; else
  big=""; bigsz=0
  while read -r f; do [ -z "$f" ] && continue
    sz="$(curl -s -m 20 -I -A "$UA" "$URL$f" | grep -i '^content-length:' | tr -d '\r' | awk '{print $2}')"; sz="${sz:-0}"
    [ "$sz" -gt "$bigsz" ] && { bigsz="$sz"; big="$f"; }
  done <<<"$files"
  if [ -z "$big" ]; then bad "หาไฟล์ใหญ่สุดไม่ได้"; else
    ts=(); for i in 1 2 3; do ts+=("$(curl -s -m 60 -o /dev/null -A "$UA" -H 'Cache-Control: no-cache' -w '%{time_total}' "$URL$big")"); done
    med="$(printf '%s\n' "${ts[@]}" | sort -n | sed -n 2p)"
    kb=$((bigsz/1024)); echo "    ไฟล์ใหญ่สุด: $big (${kb} kB) เวลา: ${ts[*]} วินาที → ค่ากลาง ${med}"
    node -e 'process.exit(Number(process.argv[1])<=Number(process.argv[2])?0:1)' "$med" "$MAX" && ok "โหลดไฟล์ใหญ่สุดเสร็จใน ${med} วินาที (≤ ${MAX})" || bad "โหลดไฟล์ใหญ่สุดช้า ${med} วินาที (> ${MAX})"
  fi
fi

echo
echo "ผลรวม: ผ่าน $PASS · ไม่ผ่าน $FAIL"
[ "$FAIL" -eq 0 ]
