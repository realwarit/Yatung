-- =====================================================================
-- YaTung (ยาตรง) — Database schema
-- MySQL 8.4 · utf8mb4 · เวลาทั้งหมดเป็นเวลาไทย (+07:00) ตาม docker-compose
-- ไฟล์นี้รันอัตโนมัติครั้งแรกที่ volume db_data ยังว่าง
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '+07:00';

-- ---------------------------------------------------------------------
-- users : ผู้ป่วย / ผู้ใช้หลัก (ไม่มีระบบ role หลายระดับตามสโคป)
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  email           VARCHAR(191)  NOT NULL,
  password_hash   VARCHAR(100)  NOT NULL,
  display_name    VARCHAR(100)  NOT NULL,
  line_user_id    VARCHAR(64)   NULL,          -- ได้มาหลังผู้ใช้ส่งรหัสเชื่อมบัญชีใน LINE
  line_display_name VARCHAR(100) NULL,         -- ชื่อ LINE (จาก getProfile) แสดงในหน้า Settings
  line_link_code  CHAR(6)       NULL,          -- รหัส 6 หลักที่แสดงในหน้า Settings
  line_link_code_expires_at DATETIME NULL,     -- รหัสหมดอายุ 10 นาที ใช้ได้ครั้งเดียว
  tts_rate        DECIMAL(3,2)  NOT NULL DEFAULT 0.90,  -- ความเร็วเสียงอ่าน (ผู้สูงอายุชอบช้าลง)
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_line_user (line_user_id),
  UNIQUE KEY uq_users_link_code (line_link_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- user_slot_times : เวลามื้อของแต่ละคน (คนตื่นสายก็ปรับเช้าเป็น 09:00 ได้)
-- ---------------------------------------------------------------------
CREATE TABLE user_slot_times (
  user_id     INT UNSIGNED NOT NULL,
  slot        ENUM('morning','noon','evening','bedtime') NOT NULL,
  slot_time   TIME NOT NULL,
  PRIMARY KEY (user_id, slot),
  CONSTRAINT fk_slot_times_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- caregivers : ญาติ/ผู้ดูแล ที่จะได้รับแจ้งเตือนเมื่อผู้ป่วยไม่กดยืนยัน
-- ---------------------------------------------------------------------
CREATE TABLE caregivers (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id             INT UNSIGNED NOT NULL,
  name                VARCHAR(100) NOT NULL,
  relation            VARCHAR(50)  NULL,              -- ลูก, หลาน, คู่สมรส ...
  line_user_id        VARCHAR(64)  NULL,
  line_display_name   VARCHAR(100) NULL,
  link_code           CHAR(6)      NULL,
  link_code_expires_at DATETIME    NULL,
  escalate_after_min  SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_caregivers_link_code (link_code),
  KEY idx_caregivers_user (user_id),
  CONSTRAINT fk_caregivers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_escalate CHECK (escalate_after_min BETWEEN 10 AND 720)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- prescriptions : 1 ครั้งที่สแกน = 1 แถว (เก็บผลดิบของ OCR และ LLM ไว้ตรวจย้อนหลัง)
-- ---------------------------------------------------------------------
CREATE TABLE prescriptions (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED NOT NULL,
  input_type    ENUM('image','text') NOT NULL DEFAULT 'image',
  image_path    VARCHAR(255) NULL,
  ocr_text      MEDIUMTEXT   NULL,
  llm_json      JSON         NULL,           -- ผลจาก LLM ตาม medicine-parse.schema.json
  llm_model     VARCHAR(100) NULL,
  status        ENUM('draft','confirmed','discarded') NOT NULL DEFAULT 'draft',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at  DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_prescriptions_user (user_id, created_at),
  CONSTRAINT fk_prescriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- medications : ยาที่ผู้ใช้ยืนยันแล้ว
-- ---------------------------------------------------------------------
CREATE TABLE medications (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          INT UNSIGNED NOT NULL,
  prescription_id  INT UNSIGNED NULL,                    -- NULL = กรอกเอง
  name             VARCHAR(150) NOT NULL,
  strength         VARCHAR(50)  NULL,                    -- เช่น "500 mg"
  dose_per_time    DECIMAL(5,2) NOT NULL DEFAULT 1.00,   -- รองรับครึ่งเม็ด (0.5)
  unit             ENUM('tablet','capsule','ml','teaspoon','tablespoon','sachet','drop','puff','other')
                   NOT NULL DEFAULT 'tablet',
  meal_relation    ENUM('before','after','with','any') NOT NULL DEFAULT 'after',
  as_needed        TINYINT(1)   NOT NULL DEFAULT 0,       -- ยา "เมื่อมีอาการ" → ไม่สร้างรอบเตือน
  indication       VARCHAR(200) NULL,                     -- ข้อบ่งใช้ เช่น "ลดความดัน"
  warnings         JSON         NULL,                     -- ["อาจทำให้ง่วง", ...]
  total_qty        DECIMAL(7,2) NULL,
  remaining_qty    DECIMAL(7,2) NULL,
  refill_alert_days TINYINT UNSIGNED NOT NULL DEFAULT 3,
  refill_alerted_at DATETIME    NULL,                     -- กันเตือนยาใกล้หมดซ้ำทุกวัน
  start_date       DATE         NOT NULL,
  end_date         DATE         NULL,
  is_active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_medications_user_active (user_id, is_active),
  CONSTRAINT fk_medications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_medications_prescription FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE SET NULL,
  CONSTRAINT chk_dose_positive CHECK (dose_per_time > 0),
  CONSTRAINT chk_remaining CHECK (remaining_qty IS NULL OR remaining_qty >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- medication_slots : ยาตัวนี้กินมื้อไหนบ้าง
-- ---------------------------------------------------------------------
CREATE TABLE medication_slots (
  medication_id  INT UNSIGNED NOT NULL,
  slot           ENUM('morning','noon','evening','bedtime') NOT NULL,
  PRIMARY KEY (medication_id, slot),
  CONSTRAINT fk_med_slots_med FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- dose_logs : หัวใจของระบบ — 1 แถว = ยา 1 ตัว ใน 1 รอบเวลา
-- สถานะ: pending → taken   หรือ   pending → missed (หลัง escalate)
-- UNIQUE(medication_id, scheduled_at) ทำให้ cron สร้างซ้ำได้โดยไม่เกิดแถวซ้ำ (idempotent)
-- ---------------------------------------------------------------------
CREATE TABLE dose_logs (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  medication_id  INT UNSIGNED NOT NULL,
  user_id        INT UNSIGNED NOT NULL,                 -- denormalize ไว้ให้ query dashboard เร็ว
  slot           ENUM('morning','noon','evening','bedtime') NOT NULL,
  scheduled_at   DATETIME NOT NULL,
  status         ENUM('pending','taken','missed') NOT NULL DEFAULT 'pending',
  taken_at       DATETIME NULL,
  source         ENUM('app','line','push','caregiver') NULL, -- ยืนยันผ่านช่องทางไหน (caregiver = ญาติกดยืนยันใน LINE)
  reminded_at    DATETIME NULL,
  followup_at    DATETIME NULL,                         -- เตือนซ้ำผู้ป่วย (REMINDER_FOLLOWUP_MIN) จองก่อนส่ง
  escalated_at   DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dose_med_time (medication_id, scheduled_at),
  KEY idx_dose_due (status, scheduled_at),               -- cron หา dose ที่ถึงเวลา
  KEY idx_dose_user_time (user_id, scheduled_at),        -- หน้า today + dashboard
  CONSTRAINT fk_dose_med  FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE,
  CONSTRAINT fk_dose_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_taken_consistency CHECK (
    (status = 'taken' AND taken_at IS NOT NULL) OR (status <> 'taken')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- dose_escalations : ประวัติการแจ้งญาติ 1 แถว = (dose, ผู้ดูแล) ; UNIQUE ใช้ "จองก่อนส่ง" กันแจ้งซ้ำ
-- ---------------------------------------------------------------------
CREATE TABLE dose_escalations (
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

-- ---------------------------------------------------------------------
-- push_subscriptions : Web Push ของ PWA (1 user มีได้หลายเครื่อง)
-- ---------------------------------------------------------------------
CREATE TABLE push_subscriptions (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  endpoint    VARCHAR(500) NOT NULL,
  p256dh      VARCHAR(200) NOT NULL,
  auth        VARCHAR(100) NOT NULL,
  user_agent  VARCHAR(255) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_push_endpoint (endpoint(255)),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- notification_logs : บันทึกทุกข้อความที่ส่งออก (ใช้ debug + โชว์ตอนนำเสนอ + นับโควตา LINE)
-- ---------------------------------------------------------------------
CREATE TABLE notification_logs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED NOT NULL,
  dose_log_id   BIGINT UNSIGNED NULL,
  channel       ENUM('line_push','line_reply','web_push','native') NOT NULL,
  kind          ENUM('reminder','escalation','refill','low_stock','link','other') NOT NULL,
  recipient     ENUM('patient','caregiver') NOT NULL DEFAULT 'patient',
  success       TINYINT(1) NOT NULL DEFAULT 1,
  error_message VARCHAR(500) NULL,
  sent_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_user_time (user_id, sent_at),
  KEY idx_notif_channel_time (channel, sent_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_dose FOREIGN KEY (dose_log_id) REFERENCES dose_logs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- Trigger: สร้างเวลามื้อเริ่มต้นให้ผู้ใช้ใหม่ทุกคนอัตโนมัติ
-- =====================================================================
DELIMITER //
CREATE TRIGGER trg_users_default_slots
AFTER INSERT ON users
FOR EACH ROW
BEGIN
  INSERT INTO user_slot_times (user_id, slot, slot_time) VALUES
    (NEW.id, 'morning', '08:00:00'),
    (NEW.id, 'noon',    '12:00:00'),
    (NEW.id, 'evening', '18:00:00'),
    (NEW.id, 'bedtime', '21:00:00');
END//
DELIMITER ;

-- =====================================================================
-- Views สำหรับ Dashboard (Node-RED query view ตรงๆ ไม่ต้องเขียน SQL ยาวใน flow)
-- =====================================================================

-- Adherence รายวัน: taken ÷ (taken + missed) — ไม่นับ pending เพราะยังไม่ถึงกำหนด
CREATE VIEW v_daily_adherence AS
SELECT
  user_id,
  DATE(scheduled_at)                                   AS day,
  SUM(status = 'taken')                                AS taken,
  SUM(status = 'missed')                               AS missed,
  SUM(status = 'pending')                              AS pending,
  ROUND(100 * SUM(status = 'taken')
        / NULLIF(SUM(status IN ('taken','missed')), 0), 1) AS adherence_pct
FROM dose_logs
GROUP BY user_id, DATE(scheduled_at);

-- ยาเหลือกี่วัน: remaining ÷ (ขนาดต่อครั้ง × จำนวนมื้อต่อวัน)
CREATE VIEW v_medication_supply AS
SELECT
  m.id                       AS medication_id,
  m.user_id,
  m.name,
  m.remaining_qty,
  m.refill_alert_days,
  m.refill_alerted_at,
  COUNT(s.slot)              AS doses_per_day,
  CASE
    WHEN m.remaining_qty IS NULL OR COUNT(s.slot) = 0 THEN NULL
    ELSE FLOOR(m.remaining_qty / (m.dose_per_time * COUNT(s.slot)))
  END                        AS days_left
FROM medications m
LEFT JOIN medication_slots s ON s.medication_id = m.id
WHERE m.is_active = 1 AND m.as_needed = 0
GROUP BY m.id, m.user_id, m.name, m.remaining_qty, m.dose_per_time,
         m.refill_alert_days, m.refill_alerted_at;
