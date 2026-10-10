-- Migration 003 (วันที่ 7B): เตือนยาใกล้หมด
--   เกณฑ์ใกล้หมดของยาประจำ = medications.refill_alert_days (ต่อยา) — ค่าเริ่มต้นของยาใหม่เปลี่ยนจาก 3 เป็น 7 วัน
--   ไม่แตะค่าของยาที่มีอยู่แล้ว (ALTER … SET DEFAULT ไม่แก้แถวเดิม) ; ใช้ refill_alerted_at เดิมเป็นตัวกันแจ้งซ้ำ (ไม่เพิ่มคอลัมน์)
-- รันซ้ำได้: bash scripts/migrate.sh
SET NAMES utf8mb4;

ALTER TABLE medications ALTER COLUMN refill_alert_days SET DEFAULT 7;
