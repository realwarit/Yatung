import { cameraErrorMessage, classifyCameraError } from './camera-errors';

describe('camera-errors', () => {
  it('ยกเลิกเอง = ไม่มีข้อความ', () => {
    expect(classifyCameraError(new Error('User cancelled photos app'))).toBe('cancelled');
    expect(cameraErrorMessage(new Error('User cancelled photos app'))).toBeNull();
  });

  it('สิทธิ์ถูกปฏิเสธ = ข้อความไทยบอกทางเปิดสิทธิ์', () => {
    const m = cameraErrorMessage(new Error('User denied access to camera'));
    expect(m).toContain('ตั้งค่า → แอป → ยาตรง');
    expect(m).toContain('คลังภาพ');
  });

  it('ไม่มีแอปกล้อง', () => {
    expect(classifyCameraError(new Error('Unable to resolve camera activity'))).toBe('no-app');
    expect(cameraErrorMessage('Unable to resolve photo activity')).toContain('ไม่พบแอปกล้อง');
  });

  it('ข้อผิดพลาดอื่น = ข้อความทั่วไป ไม่รั่วข้อความอังกฤษ/ข้อมูลรูป', () => {
    const m = cameraErrorMessage(new Error('Unable to process image data:image/jpeg;base64,AAAA'));
    expect(m).toBe('เปิดกล้องหรือรูปไม่ได้ ลองใหม่อีกครั้งนะคะ');
    expect(m).not.toContain('base64');
  });
});
