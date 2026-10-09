-- Migration 001 (วันที่ 6A): คอลัมน์สำหรับเชื่อมบัญชี LINE ด้วยรหัส 6 หลักที่หมดอายุได้
-- รันซ้ำได้ (เช็ก information_schema ก่อนเพิ่ม เพราะ MySQL 8.4 ไม่มี ADD COLUMN IF NOT EXISTS)
--   bash scripts/migrate.sh
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS yt_add_column;
DELIMITER //
CREATE PROCEDURE yt_add_column(IN t VARCHAR(64), IN c VARCHAR(64), IN def VARCHAR(200))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t AND COLUMN_NAME = c) THEN
    SET @ddl = CONCAT('ALTER TABLE `', t, '` ADD COLUMN `', c, '` ', def);
    PREPARE st FROM @ddl; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END//
DELIMITER ;

CALL yt_add_column('users',      'line_link_code_expires_at', 'DATETIME NULL AFTER line_link_code');
CALL yt_add_column('users',      'line_display_name',         'VARCHAR(100) NULL AFTER line_user_id');
CALL yt_add_column('caregivers', 'link_code_expires_at',      'DATETIME NULL AFTER link_code');
CALL yt_add_column('caregivers', 'line_display_name',         'VARCHAR(100) NULL AFTER line_user_id');

DROP PROCEDURE yt_add_column;
