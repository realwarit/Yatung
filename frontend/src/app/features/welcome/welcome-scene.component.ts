import { ChangeDetectionStrategy, Component } from '@angular/core';
import { WelcomeFloatersComponent } from './welcome-floaters.component';
import { WelcomeHillsComponent } from './welcome-hills.component';

/** ฉากหลังของหน้าต้อนรับ — ตกแต่งล้วน (aria-hidden) ; CSS/SVG ไม่มี JS วนเฟรม ; ค่าตำแหน่งแปลงจากต้นแบบ 384×832 เป็น % */
@Component({
  selector: 'app-welcome-scene',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WelcomeFloatersComponent, WelcomeHillsComponent],
  templateUrl: './welcome-scene.component.html',
  styleUrl: './welcome-scene.component.scss',
  host: { 'aria-hidden': 'true' },
})
export class WelcomeSceneComponent {
  protected readonly clouds = [
    { w: 120, top: 8, dur: 48, delay: -26, rx: 62, min: 4.6, op: 0.95 },
    { w: 78, top: 18, dur: 70, delay: -30, rx: 40, min: 0, op: 0.7 },
    { w: 96, top: 38, dur: 58, delay: -44, rx: 70, min: 0, op: 0.85 },
  ];
  protected readonly twinkles = [
    { x: 50, y: 12, s: 18, delay: 2.4, white: false },
    { x: 76, y: 11.5, s: 14, delay: 3.3, white: true },
    { x: 90, y: 62, s: 16, delay: 4.1, white: false },
    { x: 7, y: 60, s: 14, delay: 2.9, white: false },
  ];
}
