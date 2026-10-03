import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FontScaleService } from './shared/font-scale.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  // สร้างตั้งแต่เริ่มแอป เพื่อใช้ขนาดตัวอักษรที่ผู้ใช้เลือกไว้ทุกหน้า
  private readonly fontScale = inject(FontScaleService);
  protected readonly title = signal('frontend');
}
