#!/usr/bin/env bash
# รัน migration ทุกไฟล์ใน db/migrations/*.sql ตามลำดับชื่อ (ทุกไฟล์รันซ้ำได้) โดยไม่ต้อง down -v
#   bash scripts/migrate.sh
set -eu
cd "$(dirname "$0")/.."
for f in db/migrations/*.sql; do
  echo "migrate: $f"
  docker compose exec -T db sh -c 'mysql --default-character-set=utf8mb4 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' < "$f" 2>&1 | grep -v "Using a password" || true
done
echo "migrate: เสร็จ"
