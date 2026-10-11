-- Migration 004 (วันที่ 7C): Web Push
--   push_subscriptions + last_success_at, fail_count (ส่งสำเร็จล่าสุด / ล้มเหลวติดกันกี่ครั้ง ; 404/410 ลบทิ้ง)
--   users.notify_both = 1 → เชื่อม LINE แล้วยังส่ง Web Push ด้วย (ค่าเริ่มต้น 0 = เชื่อม LINE แล้วส่ง LINE ทางเดียว)
-- (notification_logs.channel มี 'web_push' อยู่แล้ว ; dose_logs.source มี 'push' แล้ว — ไม่ต้องแก้ ENUM)
-- รันซ้ำได้: bash scripts/migrate.sh
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

CALL yt_add_column('push_subscriptions', 'last_success_at', 'DATETIME NULL');
CALL yt_add_column('push_subscriptions', 'fail_count', 'INT UNSIGNED NOT NULL DEFAULT 0');
CALL yt_add_column('users', 'notify_both', 'TINYINT(1) NOT NULL DEFAULT 0');

DROP PROCEDURE yt_add_column;
