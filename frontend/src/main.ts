import { bootstrapApplication } from '@angular/platform-browser';
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// UI กล้องของ @capacitor/camera ตอนรันบนเว็บ/PWA (บน Android ใช้กล้อง native)
defineCustomElements(window);

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
