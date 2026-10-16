import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

// แอป Android เท่านั้น : ใส่ class ก่อนเรนเดอร์ (CSS ใน styles/_native.scss) และขอให้ WebView วาดเต็มจอใต้แถบระบบ
// (viewport-fit=cover → Capacitor ส่งค่า safe-area ที่ถูกต้องผ่าน env()) — เว็บ/PWA ไม่เข้าเงื่อนไขนี้ meta viewport ไม่เปลี่ยน
if (environment.native) {
  document.documentElement.classList.add('is-native');
  const vp = document.querySelector('meta[name="viewport"]');
  const content = vp?.getAttribute('content') ?? '';
  if (vp && !content.includes('viewport-fit')) vp.setAttribute('content', content + ', viewport-fit=cover');
}

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
