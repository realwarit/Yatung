import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { authInterceptor } from './core/auth/auth.interceptor';
import { ngrokInterceptor } from './core/network/ngrok.interceptor';
import { htmlGuardInterceptor } from './core/network/html-guard.interceptor';
import { AppErrorHandler, errorLogInterceptor } from './core/diagnostics/error-log.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: AppErrorHandler },
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([ngrokInterceptor, htmlGuardInterceptor, authInterceptor, errorLogInterceptor])),
    // Ionic ใช้เฉพาะหน้า Scan : provider อยู่ใน features/scan/scan.routes.ts (lazy ไม่อยู่ใน initial bundle)
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
