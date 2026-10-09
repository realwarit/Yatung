import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
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
  host: { '[class.focus]': 'focusMode()' },
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** route data `hideBottomNav: true` = หน้าโฟกัส (เช่น /scan): มือถือซ่อนแถบเมนูล่างและแถบโลโก้ด้านบน */
  protected readonly focusMode = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => {
        let r = this.route.snapshot;
        while (r.firstChild) r = r.firstChild;
        return r.data['hideBottomNav'] === true;
      }),
    ),
    { initialValue: false },
  );

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
