import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FontSizeToggleComponent } from '../../shared/font-size-toggle.component';
import { IconComponent } from '../../shared/icon.component';
import { LogoComponent } from '../../shared/logo.component';
import { MascotComponent } from '../../shared/components/mascot/mascot.component';

/** โครงหน้า Login/Register: จอกว้างแบ่ง 2 ฝั่ง (แบรนด์ | ฟอร์ม), มือถือคอลัมน์เดียวพร้อมหัวโค้ง */
@Component({
  selector: 'app-auth-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FontSizeToggleComponent, IconComponent, LogoComponent, MascotComponent],
  templateUrl: './auth-shell.component.html',
  styleUrl: './auth-shell.component.scss',
})
export class AuthShellComponent {}
