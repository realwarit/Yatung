/** ข้อความใน sheet "แจ้งเตือนบนเครื่องนี้" ของแอป Android — เปลี่ยนตามสถานะเชื่อม LINE (null = ยังโหลดไม่เสร็จ/โหลดไม่ได้ ใช้ข้อความ "ยังไม่เชื่อม") */
export function nativeNotifyCopy(lineLinked: boolean | null): { text: string; button: string } {
  return lineLinked === true
    ? { text: 'เชื่อม LINE แล้ว น้องจะเตือนทาง LINE นะคะ', button: 'ดูการเชื่อม LINE' }
    : { text: 'แอปนี้ส่งเตือนกินยาทาง LINE นะคะ\nเชื่อม LINE ไว้ น้องจะเตือนให้ค่ะ', button: 'ไปหน้าเชื่อม LINE' };
}
