import { nativeNotifyCopy } from './push-native-copy';

describe('nativeNotifyCopy', () => {
  it('เชื่อม LINE แล้ว: ข้อความยืนยัน + ปุ่มดูการเชื่อม', () => {
    expect(nativeNotifyCopy(true)).toEqual({ text: 'เชื่อม LINE แล้ว น้องจะเตือนทาง LINE นะคะ', button: 'ดูการเชื่อม LINE' });
  });
  it('ยังไม่เชื่อม: คงข้อความเดิม', () => {
    const c = nativeNotifyCopy(false);
    expect(c.text).toContain('เชื่อม LINE ไว้ น้องจะเตือนให้ค่ะ');
    expect(c.button).toBe('ไปหน้าเชื่อม LINE');
  });
  it('ยังโหลดสถานะไม่ได้ (null): ใช้ข้อความเดิม ไม่อ้างว่าเชื่อมแล้ว', () => {
    expect(nativeNotifyCopy(null)).toEqual(nativeNotifyCopy(false));
  });
});
