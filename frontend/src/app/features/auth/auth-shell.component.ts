import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { FontSizeToggleComponent } from '../../shared/font-size-toggle.component';
import { FontScaleService } from '../../shared/font-scale.service';
import { IconComponent } from '../../shared/icon.component';
import { LogoComponent } from '../../shared/logo.component';
import { MascotComponent, MascotMood } from '../../shared/components/mascot/mascot.component';
import { SpeechBubbleComponent } from '../../shared/components/speech-bubble/speech-bubble.component';
import { AuthStageComponent } from './auth-stage.component';

/** ความสูงจอที่ใหญ่พอให้ใช้น้องยาตรง L (112px) ที่ขนาดตัวอักษร ก ; ต่ำกว่านี้ใช้ M (56px) */
export const AUTH_TALL_PX = 740;

/**
 * โครงหน้า Login/Register — น้องยาตรงเป็นตัวเอก (D2.5)
 * มือถือ: บล็อกกลางจอ = กล่องคำพูด (หางชี้ลง) เหนือน้องยาตรง (L เมื่อจอสูง ≥ 740 และขนาด ก ไม่งั้น M) แล้วการ์ดฟอร์มขาว เงาเบา ; จัดกลางแนวตั้ง (เนื้อหาสูงกว่าจอ = เริ่มจากบนและเลื่อนได้)
 *   จอเตี้ย (< 700px): น้องยาตรง M ซ้าย + กล่องคำพูด (หางชี้ซ้าย) แถวเดียว เพื่อให้ฟอร์มอยู่ในจอแรก
 * จอกว้าง ≥ 1024px: เวทีน้องยาตรงซ้าย (กล่องคำพูดตัวเดียวกัน) + การ์ดฟอร์มขวา
 * หน้าที่ครอบเป็นคนกำหนด mood/ข้อความจาก state ของฟอร์ม
 */
@Component({
  selector: 'app-auth-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AuthStageComponent, FontSizeToggleComponent, IconComponent, LogoComponent, MascotComponent, SpeechBubbleComponent],
  templateUrl: './auth-shell.component.html',
  styleUrl: './auth-shell.component.scss',
})
export class AuthShellComponent {
  private readonly fontScale = inject(FontScaleService);

  /** ข้อความหลักในกล่องคำพูด เช่น "ยินดีต้อนรับกลับมาค่ะ" (และเป็นหัวข้อหน้าบนจอกว้าง) */
  readonly title = input.required<string>();
  /** บรรทัดรอง */
  readonly lead = input.required<string>();
  readonly mood = input<MascotMood>('happy');
  readonly message = input.required<string>();
  /** mood shy: แง้มนิ้วแอบมอง (ตอนกด "แสดงรหัส") */
  readonly peek = input(false);
  /** false = ฟอร์มกำลัง error/ส่งข้อมูล → กดมาสคอตไม่เปลี่ยนข้อความ */
  readonly chatty = input(true);

  private readonly height = signal(typeof window === 'undefined' ? 0 : window.innerHeight);
  /** L 112 เมื่อความสูงจอ ≥ 740 และขนาด ก (100) นอกนั้น M 56 */
  protected readonly big = computed(() => this.height() >= AUTH_TALL_PX && this.fontScale.scale() === 100);

  constructor() {
    const on = () => this.height.set(window.innerHeight);
    window.addEventListener('resize', on);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('resize', on));
  }
}
