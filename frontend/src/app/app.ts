import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConnectionService } from './core/network/connection.service';
import { UpdateService } from './core/pwa/update.service';
import { PushTakeService } from './core/push/push-take.service';
import { ConnectionBannerComponent } from './shared/components/connection-banner/connection-banner.component';
import { FontScaleService } from './shared/font-scale.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConnectionBannerComponent],
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
    // เวอร์ชันใหม่พร้อม → snackbar "แตะเพื่ออัปเดต" (ไม่ reload เอง)
    inject(UpdateService).watch();
  }
}
