-- Migration 006 (8B): medications.tts_name — ชื่อที่ให้อ่านออกเสียง (ไม่บังคับ) เช่น "ยาความดัน"
--   NULL = ให้อ่านจาก name ; ไม่แสดงใน LINE/Web Push ; คอลัมน์อยู่หลัง name ตรงกับ db/init/01_schema.sql
-- รันซ้ำได้: bash scripts/migrate.sh
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS yt_tts_name;
DELIMITER //
CREATE PROCEDURE yt_tts_name()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'medications' AND COLUMN_NAME = 'tts_name') THEN
    ALTER TABLE medications ADD COLUMN tts_name VARCHAR(100) NULL AFTER name;
  END IF;
END//
DELIMITER ;

CALL yt_tts_name();
DROP PROCEDURE yt_tts_name;
