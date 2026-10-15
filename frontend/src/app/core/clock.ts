/** ความถี่ที่นาฬิกาของหน้าจอเดิน (ms) */
export const CLOCK_STEP_MS = 30_000;

/**
 * เวลาที่ต้องรอ (ms) จน "ขอบ" ถัดไปของนาฬิกา (ทุก step ตามเวลาจริง เช่น :00 และ :30) + ส่วนเกินเล็กน้อยกันตัวจับเวลาของเบราว์เซอร์ยิงเร็วกว่ากำหนด
 * อยู่ตรงขอบพอดี = รอครบ 1 step (ไม่คืน 0)
 */
export function msToNextTick(nowMs: number, stepMs = CLOCK_STEP_MS, slackMs = 25): number {
  return stepMs - (nowMs % stepMs) + slackMs;
}

/**
 * นาฬิกาที่เดินตามเวลาจริงของเครื่อง (ชิดขอบ :00/:30) แทน setInterval ที่เริ่มนับตอนโหลดหน้า —
 * หน้าที่ปัดขึ้นเป็นนาที ("อีก n นาที") จึงไม่ค้างค่าเก่าเกินไม่กี่วินาที ; ทำงานเหมือนกันทั้งตอนออนไลน์/ออฟไลน์ (อ่านจาก Date.now() เท่านั้น ไม่ใช้เวลาของข้อมูลที่โหลด/snapshot)
 * คืนฟังก์ชันหยุด (เรียกตอนออกจากหน้า)
 */
export function startClock(onTick: (nowMs: number) => void, stepMs = CLOCK_STEP_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const arm = () => {
    timer = setTimeout(() => {
      if (stopped) return;
      onTick(Date.now());
      arm();
    }, msToNextTick(Date.now(), stepMs));
  };
  arm();
  return () => { stopped = true; if (timer !== undefined) clearTimeout(timer); };
}
