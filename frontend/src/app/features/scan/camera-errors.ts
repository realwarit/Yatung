/**
 * แปลงข้อความ error ของ @capacitor/camera (อังกฤษ) เป็นข้อความไทยที่บอกว่าต้องทำอะไรต่อ
 * (Android: ปลั๊กอินเปิดแอปกล้อง/ตัวเลือกรูปของเครื่อง ไม่ต้องขอสิทธิ์ CAMERA เอง จึงไม่มีกล่องขอสิทธิ์ให้อธิบายก่อน —
 *  ข้อความ "ถูกปฏิเสธ" ใช้เฉพาะกรณีสิทธิ์ถูกปิดในระบบ)
 * ข้อความจริงของปลั๊กอินเท่านั้น ไม่เอาข้อมูลรูปมาต่อ (ห้าม log/แสดง base64)
 */
export type CameraErrorKind = 'cancelled' | 'denied' | 'no-app' | 'failed';

export function classifyCameraError(raw: unknown): CameraErrorKind {
  const msg = raw instanceof Error ? raw.message : String(raw ?? '');
  if (/cancel/i.test(msg)) return 'cancelled';
  if (/denied/i.test(msg)) return 'denied';
  if (/unable to resolve (camera|photo) activity/i.test(msg)) return 'no-app';
  return 'failed';
}

/** null = ผู้ใช้ยกเลิกเอง ไม่ต้องแสดงอะไร */
export function cameraErrorMessage(raw: unknown): string | null {
  switch (classifyCameraError(raw)) {
    case 'cancelled':
      return null;
    case 'denied':
      return 'ยังเปิดกล้องไม่ได้ เพราะสิทธิ์ใช้กล้องถูกปิดอยู่ค่ะ เปิดได้ที่ ตั้งค่า → แอป → ยาตรง → สิทธิ์ → กล้อง หรือเลือกรูปจากคลังภาพแทนก็ได้นะคะ';
    case 'no-app':
      return 'ไม่พบแอปกล้องในเครื่อง ลองเลือกรูปจากคลังภาพแทนนะคะ';
    default:
      return 'เปิดกล้องหรือรูปไม่ได้ ลองใหม่อีกครั้งนะคะ';
  }
}
