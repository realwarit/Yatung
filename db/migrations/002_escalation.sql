-- Migration 002 (วันที่ 7A): แจ้งญาติเมื่อลืมกินยา
--   dose_escalations (UNIQUE dose+ผู้ดูแล = จองก่อนส่ง) · dose_logs.source + 'caregiver' · dose_logs.followup_at (เตือนซ้ำผู้ป่วย)
--   notification_logs.kind + 'low_stock' (ใช้ใน 7B)
-- รันซ้ำได้: bash scripts/migrate.sh
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS yt_add_column;
DROP PROCEDURE IF EXISTS yt_ensure_enum;
DELIMITER //
CREATE PROCEDURE yt_add_column(IN t VARCHAR(64), IN c VARCHAR(64), IN def VARCHAR(200))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t AND COLUMN_NAME = c) THEN
    SET @ddl = CONCAT('ALTER TABLE `', t, '` ADD COLUMN `', c, '` ', def);
    PREPARE st FROM @ddl; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END//
-- แก้นิยาม ENUM เฉพาะเมื่อ COLUMN_TYPE ยังไม่มีค่า needle
CREATE PROCEDURE yt_ensure_enum(IN t VARCHAR(64), IN c VARCHAR(64), IN needle VARCHAR(64), IN def VARCHAR(300))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t AND COLUMN_NAME = c
                   AND COLUMN_TYPE LIKE CONCAT('%''', needle, '''%')) THEN
    SET @ddl = CONCAT('ALTER TABLE `', t, '` MODIFY COLUMN `', c, '` ', def);
    PREPARE st FROM @ddl; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END//
DELIMITER ;

CALL yt_ensure_enum('dose_logs', 'source', 'caregiver', 'ENUM(''app'',''line'',''push'',''caregiver'') NULL');
CALL yt_add_column('dose_logs', 'followup_at', 'DATETIME NULL AFTER reminded_at');
CALL yt_ensure_enum('notification_logs', 'kind', 'low_stock', 'ENUM(''reminder'',''escalation'',''refill'',''low_stock'',''link'',''other'') NOT NULL');

CREATE TABLE IF NOT EXISTS dose_escalations (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dose_id              BIGINT UNSIGNED NOT NULL,
  caregiver_id         INT UNSIGNED    NOT NULL,
  user_id              INT UNSIGNED    NOT NULL,
  sent_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status               ENUM('sent','failed') NOT NULL DEFAULT 'sent',
  acknowledged_at      DATETIME NULL,
  confirmed_at         DATETIME NULL,
  resolved_notified_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_escalation_dose_caregiver (dose_id, caregiver_id),
  KEY idx_escalation_caregiver_time (caregiver_id, sent_at),
  KEY idx_escalation_user (user_id),
  CONSTRAINT fk_escalation_dose FOREIGN KEY (dose_id) REFERENCES dose_logs(id) ON DELETE CASCADE,
  CONSTRAINT fk_escalation_caregiver FOREIGN KEY (caregiver_id) REFERENCES caregivers(id) ON DELETE CASCADE,
  CONSTRAINT fk_escalation_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE yt_add_column;
DROP PROCEDURE yt_ensure_enum;
