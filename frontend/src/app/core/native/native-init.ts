import { Injector } from '@angular/core';

/**
 * ตั้งค่าที่ใช้เฉพาะแอป Android — โหลดแบบ lazy จาก App (เว็บ/PWA ไม่ดึงไฟล์นี้)
 *  - แถบสถานะ: ไอคอนขาว (พื้นเขียววาดโดย CSS `.is-native::before`) · แถบนำทางล่าง: ไอคอนเข้ม (พื้นขาววาดโดย `.is-native::after`)
 *  - ปุ่ม back
 * Android 15+ บังคับ edge-to-edge : สีแถบตั้งผ่านปลั๊กอินไม่ได้ จึงให้หน้าเว็บวาดพื้นเอง (ดู styles/_native.scss)
 */
export async function initNative(injector: Injector): Promise<void> {
  const { SystemBars, SystemBarsStyle, SystemBarType } = await import('@capacitor/core');
  await Promise.all([
    SystemBars.setStyle({ style: SystemBarsStyle.Dark, bar: SystemBarType.StatusBar }),
    SystemBars.setStyle({ style: SystemBarsStyle.Light, bar: SystemBarType.NavigationBar }),
  ]).catch(() => { /* ตั้งสีไอคอนไม่ได้ก็ใช้งานต่อได้ */ });

  const { BackHandlerService } = await import('./back-handler.service');
  injector.get(BackHandlerService).start();
}
