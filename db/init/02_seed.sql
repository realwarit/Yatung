-- =====================================================================
-- YaTung — ข้อมูลเดโม
-- login: demo@yatung.app / demo1234
-- วันที่ทั้งหมดอิงจาก CURDATE() ตอน seed → กราฟ 7 วันมีข้อมูลเสมอ
-- (seed ใหม่: docker compose down -v && docker compose up -d)
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '+07:00';

INSERT INTO users (id, email, password_hash, display_name, line_link_code)
VALUES (1, 'demo@yatung.app',
        '$2a$10$JlkiZMzaRrvZFFKXT3ZhT.B4k9YWBUEIdj8L5xje3rXu2Ir6jVZzC',
        'คุณยายสมศรี', '482913');
-- trigger สร้าง user_slot_times ให้อัตโนมัติ

INSERT INTO caregivers (user_id, name, relation, link_code, escalate_after_min)
VALUES (1, 'สมชาย', 'ลูกชาย', '730154', 60);

INSERT INTO medications
  (id, user_id, name, strength, dose_per_time, unit, meal_relation, as_needed,
   indication, warnings, total_qty, remaining_qty, start_date)
VALUES
  (1, 1, 'Amlodipine', '5 mg', 1, 'tablet', 'after', 0,
   'ลดความดันโลหิต', JSON_ARRAY('อาจทำให้ข้อเท้าบวม'), 30, 22,
   DATE_SUB(CURDATE(), INTERVAL 8 DAY)),
  (2, 1, 'Metformin', '500 mg', 1, 'tablet', 'after', 0,
   'ควบคุมระดับน้ำตาลในเลือด', JSON_ARRAY('กินพร้อมหรือหลังอาหารทันที'), 60, 5,
   DATE_SUB(CURDATE(), INTERVAL 8 DAY)),
  (3, 1, 'Simvastatin', '20 mg', 1, 'tablet', 'any', 0,
   'ลดไขมันในเลือด', JSON_ARRAY(), 30, 21,
   DATE_SUB(CURDATE(), INTERVAL 8 DAY)),
  (4, 1, 'Paracetamol', '500 mg', 1, 'tablet', 'after', 1,
   'บรรเทาปวด ลดไข้', JSON_ARRAY('ไม่เกิน 8 เม็ดต่อวัน'), 20, 14,
   DATE_SUB(CURDATE(), INTERVAL 8 DAY));
-- Metformin เหลือ 5 เม็ด กินวันละ 2 → เหลือ 2 วัน → โชว์ "ยาใกล้หมด" ได้ทันที

INSERT INTO medication_slots (medication_id, slot) VALUES
  (1, 'morning'),
  (2, 'morning'), (2, 'evening'),
  (3, 'bedtime');
-- Paracetamol เป็นยาเมื่อมีอาการ → ไม่มี slot

-- ---------------------------------------------------------------------
-- dose_logs ย้อนหลัง 7 วัน (ไม่รวมวันนี้) — กระจาย taken/missed แบบคงที่ (deterministic)
-- ---------------------------------------------------------------------
INSERT INTO dose_logs (medication_id, user_id, slot, scheduled_at, status, taken_at, source, reminded_at, escalated_at)
WITH RECURSIVE days AS (
  SELECT 1 AS n
  UNION ALL
  SELECT n + 1 FROM days WHERE n < 7
)
SELECT
  ms.medication_id,
  1,
  ms.slot,
  TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL d.n DAY), st.slot_time)               AS scheduled_at,
  IF(MOD(d.n * 7 + ms.medication_id * 3 + FIELD(ms.slot,'morning','noon','evening','bedtime'), 6) = 0,
     'missed', 'taken')                                                         AS status,
  IF(MOD(d.n * 7 + ms.medication_id * 3 + FIELD(ms.slot,'morning','noon','evening','bedtime'), 6) = 0,
     NULL,
     TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL d.n DAY), st.slot_time)
       + INTERVAL MOD(d.n * 11 + ms.medication_id * 5, 40) MINUTE)              AS taken_at,
  IF(MOD(d.n * 7 + ms.medication_id * 3 + FIELD(ms.slot,'morning','noon','evening','bedtime'), 6) = 0,
     NULL, IF(MOD(d.n, 2) = 0, 'line', 'app'))                                  AS source,
  TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL d.n DAY), st.slot_time)               AS reminded_at,
  IF(MOD(d.n * 7 + ms.medication_id * 3 + FIELD(ms.slot,'morning','noon','evening','bedtime'), 6) = 0,
     TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL d.n DAY), st.slot_time) + INTERVAL 60 MINUTE,
     NULL)                                                                      AS escalated_at
FROM days d
JOIN medication_slots ms
JOIN user_slot_times st ON st.user_id = 1 AND st.slot = ms.slot;

-- ---------------------------------------------------------------------
-- dose_logs ของวันนี้ (pending) — ปกติ cron 00:05 เป็นคนสร้าง
-- ---------------------------------------------------------------------
INSERT INTO dose_logs (medication_id, user_id, slot, scheduled_at, status)
SELECT ms.medication_id, 1, ms.slot, TIMESTAMP(CURDATE(), st.slot_time), 'pending'
FROM medication_slots ms
JOIN user_slot_times st ON st.user_id = 1 AND st.slot = ms.slot;
