import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FontSizeToggleComponent } from '../../shared/font-size-toggle.component';
import { IconComponent } from '../../shared/icon.component';
import { LogoComponent } from '../../shared/logo.component';
import { MascotComponent, MascotMood } from '../../shared/components/mascot/mascot.component';
import { SpeechBubbleComponent } from '../../shared/components/speech-bubble/speech-bubble.component';
import { AuthStageComponent } from './auth-stage.component';

/**
 * โครงหน้า Login/Register — น้องยาตรงเป็นตัวเอก
 * จอกว้าง: เวทีน้องยาตรงซ้าย + การ์ดฟอร์มขวา · มือถือ: น้องโผล่หน้าจากหลังการ์ดฟอร์ม
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
  readonly mood = input<MascotMood>('happy');
  readonly message = input.required<string>();
  /** mood shy: แง้มนิ้วแอบมอง (ตอนกด "แสดงรหัส") */
  readonly peek = input(false);
  /** false = ฟอร์มกำลัง error/ส่งข้อมูล → กดมาสคอตไม่เปลี่ยนข้อความ */
  readonly chatty = input(true);
}
