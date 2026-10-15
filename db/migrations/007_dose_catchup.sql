-- Migration 007 (H): ensureToday / catch-up สร้างรอบยาย้อนหลังเมื่อพลาด cron 00:05 (เครื่องหลับ/ล่ม) โดยไม่แจ้งเตือนย้อนหลัง
--   dose_logs.catchup = 1 → แถวที่ถูกสร้างหลังเวลานัดผ่านไปแล้ว : reminder / เตือนซ้ำ / แจ้งญาติ ข้ามทั้งหมด (ผู้ป่วยยังกดกินแล้วได้ตามปกติ)
--   daily_generation   → marker "วันนี้สร้างรอบแล้วหรือยัง" (cron 00:05 และ ensureToday เขียน ; ensureToday ข้ามเมื่อมี marker
--                         เพื่อไม่ไปสร้างรอบที่ถูกข้ามโดยตั้งใจ เช่น เพิ่มยาตอนบ่ายแล้วมื้อเช้าผ่านไปแล้ว)
--   คอลัมน์ catchup อยู่หลัง escalated_at ตรงกับ db/init/01_schema.sql
-- รันซ้ำได้: bash scripts/migrate.sh
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS yt_dose_catchup;
DELIMITER //
CREATE PROCEDURE yt_dose_catchup()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dose_logs' AND COLUMN_NAME = 'catchup') THEN
    ALTER TABLE dose_logs ADD COLUMN catchup TINYINT(1) NOT NULL DEFAULT 0 AFTER escalated_at;
  END IF;
END//
DELIMITER ;

CALL yt_dose_catchup();
DROP PROCEDURE yt_dose_catchup;

CREATE TABLE IF NOT EXISTS daily_generation (
  gen_date     DATE         NOT NULL,
  generated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source       VARCHAR(16)  NOT NULL,          -- cron | ensure
  inserted     INT UNSIGNED NOT NULL DEFAULT 0,
  catchup      INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (gen_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
