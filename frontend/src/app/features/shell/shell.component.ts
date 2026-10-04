import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { FontSizeToggleComponent } from '../../shared/font-size-toggle.component';
import { IconComponent, IconName } from '../../shared/icon.component';
import { LogoComponent } from '../../shared/logo.component';

interface NavItem { path: string; label: string; icon: IconName; }

/** โครงแอปหลัง login: มือถือ = แถบล่าง 5 ช่อง (ปุ่มสแกนกลาง) · จอ ≥ 1024px = sidebar ซ้าย */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, LogoComponent, FontSizeToggleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);

  protected readonly left: NavItem[] = [
    { path: '/today', label: 'วันนี้', icon: 'today' },
    { path: '/medications', label: 'ยาของฉัน', icon: 'pill' },
  ];
  protected readonly right: NavItem[] = [
    { path: '/overview', label: 'ภาพรวม', icon: 'chart' },
    { path: '/settings', label: 'ตั้งค่า', icon: 'sliders' },
  ];
  protected readonly all = [...this.left, ...this.right];

  protected logout(): void { this.auth.logout(); }
}
