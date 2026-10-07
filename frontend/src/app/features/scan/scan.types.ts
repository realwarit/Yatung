export type Mode = 'photo' | 'text';
export type Phase = 'idle' | 'compressing' | 'reading' | 'error';

/** ขั้นตอนที่โชว์ระหว่างรอ Gemini อ่านรูป + ตีความ (ลำดับตรงกับ pipeline ฝั่ง backend) */
export const READING_STEPS = [
  'อ่านตัวหนังสือบนซอง',
  'แยกชื่อยาและมื้อที่ต้องกิน',
  'ตรวจความถูกต้อง',
] as const;
