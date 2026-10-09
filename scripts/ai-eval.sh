#!/usr/bin/env bash
# ชุดทดสอบ AI (eval) — รันเองด้วยคำสั่งเดียวเมื่อแก้ prompt / schema / lib ฝั่ง AI (ไม่อยู่ในชุดทดสอบปกติ เพราะเรียก Gemini จริง)
#   bash scripts/ai-eval.sh                                   # ทุกซองใน docs/ai-eval/expected.json (11 ซอง = 11 request, ~3 นาที)
#   bash scripts/ai-eval.sh yatung-test-envelope-2.png ...    # เฉพาะบางซอง
# ใช้รุ่น Lite (LLM_MODEL จาก .env ต้องมีคำว่า lite), GEMINI_NO_RETRY=true (1 ซอง = 1 request ไม่ retry/ไม่สลับรุ่น), หยุดทันทีเมื่อเจอ 429
# สร้าง nodered ใหม่ด้วย env ชั่วคราว (ไม่แก้ .env) เพื่อให้ prompt/lib ล่าสุดถูกโหลด ; ตอนจบคืนค่าตาม .env ; ผลที่ docs/ai-eval/runs/
set -u
cd "$(dirname "$0")/.."
envval() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//' | tr -d '\r'; }
MODEL="$(envval LLM_MODEL)"
case "$MODEL" in
  *lite*) ;;
  *) echo "LLM_MODEL ใน .env ต้องเป็นรุ่น Lite (ตอนนี้ '$MODEL')"; exit 2 ;;
esac
BASE=http://localhost:1880

source scripts/lib/real-snapshot.sh   # snapshot ผู้ใช้จริงก่อน-หลัง (ดู scripts/lib/real-snapshot.sh)
real_snapshot_take
restore() {
  docker compose up -d --force-recreate nodered >/dev/null 2>&1
  echo "== ข้อมูลผู้ใช้จริง"; real_snapshot_check || echo "  ! ถ้าต่างเฉพาะ reminded_at = cron เตือนจริงทำงานตามปกติระหว่างรัน"
}
trap restore EXIT

echo "== เตรียม nodered: LLM_MODEL=$MODEL AI_MOCK=false GEMINI_NO_RETRY=true"
LLM_MODEL="$MODEL" AI_MOCK=false GEMINI_NO_RETRY=true docker compose up -d --force-recreate nodered >/dev/null 2>&1
READY=0
for _ in $(seq 40); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/me")" = "401" ]; then READY=1; break; fi
  sleep 1.5
done
[ "$READY" = 1 ] || { echo "nodered ไม่พร้อม"; exit 2; }

EVAL_MODEL="$MODEL" node scripts/ai-eval.mjs "$@"
CODE=$?

# ตรวจจาก log ว่ายิง Gemini กี่ครั้ง ด้วยรุ่นไหน สถานะอะไร (ต้องรุ่นเดียว ไม่มี retry)
echo "== gemini_http ใน log:"
docker compose logs nodered 2>/dev/null | grep -o 'gemini_http model=[^ ]* call=[^ ]* status=[^ ]*' | sed 's/ call=[^ ]*//' | sort | uniq -c
exit $CODE
