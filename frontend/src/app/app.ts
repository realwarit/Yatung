import { Component, Injector, inject, signal } from '@angular/core';
import { isNative } from './core/native/native';
import { RouterOutlet } from '@angular/router';
import { ConnectionService } from './core/network/connection.service';
import { UpdateService } from './core/pwa/update.service';
import { PushTakeService } from './core/push/push-take.service';
import { BannerHostComponent } from './shared/ui/banner/banner-host.component';
import { KeyboardService } from './core/banner/keyboard.service';
import { FontScaleService } from './shared/font-scale.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, BannerHostComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  // สร้างตั้งแต่เริ่มแอป เพื่อใช้ขนาดตัวอักษรที่ผู้ใช้เลือกไว้ทุกหน้า
  private readonly fontScale = inject(FontScaleService);
  protected readonly title = signal('frontend');

  constructor() {
    // เปิดจากปุ่ม "✓ กินแล้ว" ของการแจ้งเตือน (/today#take=…) → บันทึกก่อนที่ guard จะพาไปหน้าอื่น
    inject(PushTakeService).watch();
    // ngrok ฟรีแทรกหน้าเตือน HTML → แสดงแถบ "การเชื่อมต่อหมดอายุ" (ดู core/network)
    inject(ConnectionService).watch();
    // เวอร์ชันใหม่พร้อม → yt-banner "แตะเพื่ออัปเดต" (ไม่ reload เอง)
    inject(UpdateService).watch();
    // ช่องกรอกโฟกัส = คีย์บอร์ดเปิด → class kb-open ซ่อนแถบเมนูล่าง
    inject(KeyboardService).watch();
    // แอป Android เท่านั้น : สีไอคอนแถบระบบ + ปุ่ม back (lazy — เว็บ/PWA ไม่ดึงโค้ดนี้)
    if (isNative()) {
      const injector = inject(Injector);
      void import('./core/native/native-init').then((m) => m.initNative(injector));
    }
  }
}
