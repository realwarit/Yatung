#!/usr/bin/env bash
# ถ้าไม่ได้ตั้ง DEMO_PASSWORD ใน environment ให้อ่านจาก .env เอง (ไม่แสดงค่า) — ไม่มีทั้งสองที่ = ออกพร้อมข้อความบอกให้ตั้ง
if [ -z "${DEMO_PASSWORD:-}" ] && [ -f .env ]; then
  DEMO_PASSWORD="$(grep -E '^DEMO_PASSWORD=' .env | head -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//' | tr -d '\r')"
  case "$DEMO_PASSWORD" in \"*\") DEMO_PASSWORD="${DEMO_PASSWORD#\"}"; DEMO_PASSWORD="${DEMO_PASSWORD%\"}";; \'*\') DEMO_PASSWORD="${DEMO_PASSWORD#\'}"; DEMO_PASSWORD="${DEMO_PASSWORD%\'}";; esac
  export DEMO_PASSWORD
fi
: "${DEMO_PASSWORD:?ไม่พบ DEMO_PASSWORD ใน environment และใน .env — ตั้งก่อนรัน เช่น DEMO_PASSWORD=... bash $0}"
