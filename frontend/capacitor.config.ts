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
  plugins: {
    SystemBars: {
      // Android 15+ บังคับ edge-to-edge : หน้าเว็บวาดพื้นแถบเอง (styles/_native.scss) ด้วย env(safe-area-inset-*)
      // 'cover' ตรงกับ meta viewport ที่ main.ts ใส่ให้ build native → ไม่กระตุกตอนเริ่ม
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
