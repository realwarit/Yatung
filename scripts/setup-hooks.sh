#!/usr/bin/env bash
# เปิด hook กันความลับ: ตั้ง core.hooksPath เป็น .githooks (ทำครั้งเดียวต่อ clone)
set -eu
cd "$(dirname "$0")/.."
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/pre-push 2>/dev/null || true
echo "เปิด hook แล้ว: pre-commit (ตรวจที่ stage) + pre-push (ตรวจ commit ที่ยังไม่อยู่บน remote)"
