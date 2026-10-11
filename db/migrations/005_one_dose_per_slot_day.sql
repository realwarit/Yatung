-- Migration 005 (fix 7C): ยา 1 ตัวมีได้ไม่เกิน 1 dose ต่อ (มื้อ, วัน)
--   dose_logs.scheduled_date = DATE(scheduled_at) (generated, STORED) + UNIQUE uq_dose_med_slot_day (medication_id, slot, scheduled_date)
--   เดิมมีแค่ UNIQUE(medication_id, scheduled_at) → เปลี่ยนเวลามื้อหลังเตือนแล้ว ทำให้เกิด 2 รอบในมื้อเดียวของวันเดียว
-- ถ้ามีข้อมูลซ้ำอยู่แล้ว จะ "ไม่" สร้าง UNIQUE (แสดง SKIP) แต่ยังเพิ่มคอลัมน์ให้ → รัน node scripts/fix-duplicate-doses.mjs (dry-run แล้ว --apply) แล้วรัน migrate.sh ซ้ำ
-- รันซ้ำได้: bash scripts/migrate.sh
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS yt_one_dose_per_slot_day;
DELIMITER //
CREATE PROCEDURE yt_one_dose_per_slot_day()
BEGIN
  DECLARE dup INT DEFAULT 0;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dose_logs' AND COLUMN_NAME = 'scheduled_date') THEN
    ALTER TABLE dose_logs ADD COLUMN scheduled_date DATE AS (DATE(scheduled_at)) STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dose_logs' AND INDEX_NAME = 'uq_dose_med_slot_day') THEN
    SELECT COUNT(*) INTO dup FROM (
      SELECT 1 FROM dose_logs GROUP BY medication_id, slot, DATE(scheduled_at) HAVING COUNT(*) > 1) x;
    IF dup > 0 THEN
      SELECT CONCAT('SKIP: พบรอบซ้ำ ', dup, ' กลุ่ม (ยา+มื้อ+วัน) จึงยังไม่สร้าง UNIQUE uq_dose_med_slot_day — รัน node scripts/fix-duplicate-doses.mjs แล้ว bash scripts/migrate.sh ซ้ำ') AS warning;
    ELSE
      ALTER TABLE dose_logs ADD UNIQUE KEY uq_dose_med_slot_day (medication_id, slot, scheduled_date);
    END IF;
  END IF;
END//
DELIMITER ;

CALL yt_one_dose_per_slot_day();
DROP PROCEDURE yt_one_dose_per_slot_day;
