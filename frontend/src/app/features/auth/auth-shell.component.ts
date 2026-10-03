import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FontSizeToggleComponent } from '../../shared/font-size-toggle.component';
import { HeroIllustrationComponent } from '../../shared/hero-illustration.component';
import { IconComponent } from '../../shared/icon.component';
import { LogoComponent } from '../../shared/logo.component';

/** โครงหน้า Login/Register: จอกว้างแบ่ง 2 ฝั่ง (แบรนด์ | ฟอร์ม), มือถือคอลัมน์เดียวพร้อมหัวโค้ง */
@Component({
  selector: 'app-auth-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FontSizeToggleComponent, HeroIllustrationComponent, IconComponent, LogoComponent],
  templateUrl: './auth-shell.component.html',
  styleUrl: './auth-shell.component.scss',
})
export class AuthShellComponent {}
