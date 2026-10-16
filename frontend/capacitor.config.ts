import type { CapacitorConfig } from '@capacitor/cli';

/**
 * แอป Android ของยาตรง (วันที่ 9) — ไม่มีโดเมนของเซิร์ฟเวอร์ในไฟล์นี้ (รีโปเป็น public)
 * ฐาน URL ของ API ถูกฝังตอน build จาก `.env` (`npm run cap:env` → environment.native.ts ที่ git-ignored)
 * ห้ามใช้ `server.url` : apk ต้องมีหน้าเว็บอยู่ในตัว เปิดได้แม้ tunnel ล่ม
 */
const config: CapacitorConfig = {
  appId: 'com.yatung.app',
  appName: 'ยาตรง',
  webDir: 'dist/frontend/browser',
  server: {
    androidScheme: 'https',   // origin ในแอป = https://localhost (ต้องตรงกับ CORS ที่ Node-RED)
  },
  // พื้นหลังของ WebView ระหว่างรอหน้าแอปเรนเดอร์ = มิ้นต์เดียวกับ splash (--yt-bg-mint) กันจอขาวแวบหลัง splash หายไป
  backgroundColor: '#e8f7f3',
  plugins: {
    // Splash ตอนเปิด = Android 12 Splash Screen API ของระบบ (ธีม AppTheme.NoActionBarLaunch ใน styles.xml) จังหวะเดียว:
    //  - launchShowDuration 500 : ค้าง splash ไว้ 500 ms เท่านั้น (ค่าเริ่มต้น) ; ไม่ใช้ 0 เพราะ 0 = ปลั๊กอินไม่คุมการหาย แล้วหน้าเว็บยังไม่เรนเดอร์
    //  - launchAutoHide true + launchFadeOutDuration 200 : หายเองแบบเฟด 200 ms ลงบนพื้นมิ้นต์ของ WebView (backgroundColor ด้านบน)
    //  - showSpinner false : ไม่มีวงกลมหมุนซ้อน (ไม่ใส่ชื่อแอป/ข้อความใน splash)
    //  ไม่ตั้ง useDialog/layoutName/androidScaleType : ภาพเต็มจอ (drawable/splash) เป็นทางสำรองเมื่อธีมผิดเท่านั้น
    SplashScreen: {
      launchShowDuration: 500,
      launchAutoHide: true,
      launchFadeOutDuration: 200,
      showSpinner: false,
    },
    SystemBars: {
      // Android 15+ บังคับ edge-to-edge : หน้าเว็บวาดพื้นแถบเอง (styles/_native.scss) ด้วย env(safe-area-inset-*)
      // 'cover' ตรงกับ meta viewport ที่ main.ts ใส่ให้ build native → ไม่กระตุกตอนเริ่ม
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
