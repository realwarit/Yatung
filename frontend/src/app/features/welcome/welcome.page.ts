import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FontSizeToggleComponent } from '../../shared/font-size-toggle.component';
import { MascotComponent } from '../../shared/components/mascot/mascot.component';
import { SpeechBubbleComponent } from '../../shared/components/speech-bubble/speech-bubble.component';
import { WelcomeCtaComponent } from './welcome-cta.component';
import { WelcomeSceneComponent } from './welcome-scene.component';
import { WelcomeTitleComponent } from './welcome-title.component';

/** หน้าต้อนรับ (วันที่ 9W) — ขึ้นเมื่อเข้า `/` ตอนยังไม่ล็อกอิน ; ฉากอยู่ใน `welcome-scene` ; ปุ่มกดได้ตั้งแต่เฟรมแรก */
@Component({
  selector: 'app-welcome-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FontSizeToggleComponent, MascotComponent, SpeechBubbleComponent, WelcomeSceneComponent, WelcomeTitleComponent, WelcomeCtaComponent],
  templateUrl: './welcome.page.html',
  styleUrl: './welcome.page.scss',
})
export class WelcomePage {
  private readonly router = inject(Router);

  /** ไม่ใส่ returnUrl → หลัง login ไป /today ; state.from ให้ปุ่ม back ของ Android กลับมาที่นี่ */
  start(): void {
    void this.router.navigate(['/login'], { state: { from: 'welcome' } });
  }
}
