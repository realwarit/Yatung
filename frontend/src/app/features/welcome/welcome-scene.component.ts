import { ChangeDetectionStrategy, Component } from '@angular/core';
import { WelcomeHillsComponent } from './welcome-hills.component';

/** ของลอย: ตำแหน่ง (% ของความกว้าง/สูงฉาก) · ชนิด · หน่วงตอนเด้งเข้า · ท่าลอยต่อเนื่อง (วินาที) */
interface Floater { x: number; y: number; kind: 'cap-pink' | 'cap-mint' | 'pill' | 'heart' | 'star'; pop: number; loop: 'bob' | 'orbit' | 'orbit-rev'; dur: number; delay: number }

/** ฉากหลังของหน้าต้อนรับ — ตกแต่งล้วน (aria-hidden) ; CSS/SVG ไม่มี JS วนเฟรม ; ค่าตำแหน่งแปลงจากต้นแบบ 384×832 เป็น % */
@Component({
  selector: 'app-welcome-scene',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WelcomeHillsComponent],
  templateUrl: './welcome-scene.component.html',
  styleUrl: './welcome-scene.component.scss',
  host: { 'aria-hidden': 'true' },
})
export class WelcomeSceneComponent {
  protected readonly clouds = [
    { w: 120, top: 8, dur: 48, delay: -8, op: 0.95 },
    { w: 78, top: 18, dur: 70, delay: -30, op: 0.7 },
    { w: 96, top: 38, dur: 58, delay: -44, op: 0.85 },
  ];
  protected readonly twinkles = [
    { x: 10.4, y: 8.7, s: 18, delay: 2.4, white: false },
    { x: 60, y: 18, s: 14, delay: 3.3, white: true },
    { x: 39, y: 45.7, s: 16, delay: 4.1, white: false },
    { x: 91.7, y: 26.7, s: 14, delay: 2.9, white: false },
  ];
  protected readonly floaters: Floater[] = [
    { x: 6.3, y: 41.8, kind: 'cap-pink', pop: 2.2, loop: 'bob', dur: 6, delay: 2.8 },
    { x: 82.8, y: 39.7, kind: 'pill', pop: 2.35, loop: 'orbit', dur: 5, delay: 2.9 },
    { x: 8.9, y: 57.9, kind: 'heart', pop: 2.5, loop: 'bob', dur: 5.5, delay: 3.1 },
    { x: 84.4, y: 55.5, kind: 'cap-mint', pop: 2.65, loop: 'bob', dur: 6.5, delay: 3.3 },
    { x: 17.2, y: 15.4, kind: 'star', pop: 2.8, loop: 'orbit-rev', dur: 7, delay: 3.4 },
  ];
}
