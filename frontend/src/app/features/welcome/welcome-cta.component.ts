import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { IconComponent } from '../../shared/icon.component';

/** ปุ่ม "เริ่มต้นใช้งาน" (นูน 3D ครีม ลอยเบาๆ + แสงวิ่งผ่าน) + บรรทัดล่าง ; กดได้ตั้งแต่เฟรมแรก (animation ไม่บล็อกการคลิก) */
@Component({
  selector: 'app-welcome-cta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <footer class="cta">
      <button type="button" class="go" data-first-screen="start" (click)="start.emit()">
        <span class="shine" aria-hidden="true"></span>
        <span class="lbl">เริ่มต้นใช้งาน</span>
        <app-icon name="arrow-right" class="arr" />
      </button>
      <p class="who">สำหรับผู้ป่วยและญาติผู้ดูแล</p>
    </footer>
  `,
  styleUrl: './welcome-cta.component.scss',
})
export class WelcomeCtaComponent {
  readonly start = output<void>();
}
