import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ConnectionService } from '../network/connection.service';
import { offlineBarText } from '../offline/offline-text';
import { OnlineService } from '../offline/online.service';
import { SnapshotService } from '../offline/snapshot.service';
import { InstallService } from '../pwa/install.service';
import { UpdateService } from '../pwa/update.service';
import { FontScaleService } from '../../shared/font-scale.service';
import { Banner, BannerInputs, pickBanner } from './banner';

export const FONT_HINT_KEY = 'yatung_font_hint_off';

/**
 * รวมแหล่งข้อความด้านบนทั้งหมดเป็นแถบเดียว (ดู banner.ts) — แทน offline-bar / connection-banner / snackbar อัปเดต / การ์ดชวนติดตั้งหน้าวันนี้
 *  - ชวนติดตั้ง: เฉพาะหน้า /today ครั้งเดียวหลัง login ค้างจนกดปิด/ติดตั้ง (กติกาเดิมของ InstallService)
 *  - แจ้งขนาดตัวอักษร: เฉพาะหน้าใต้ Shell (ไม่ใช่ Login/Register) เมื่อไม่เคยเลือกขนาดเลย ; หายถาวรเมื่อกดปิด/แตะลิงก์/เลือกขนาด
 */
@Injectable({ providedIn: 'root' })
export class BannerService {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly conn = inject(ConnectionService);
  private readonly online = inject(OnlineService);
  private readonly snap = inject(SnapshotService);
  private readonly update = inject(UpdateService);
  private readonly install = inject(InstallService);
  private readonly fontScale = inject(FontScaleService);

  private readonly path = signal(this.pathOf(this.router.url));
  private readonly installLatched = signal(false);
  private readonly fontHintOff = signal(this.readHintOff());

  private readonly inShell = computed(() => !!this.auth.currentUser() && !/^\/(login|register|dev)(\/|$)/.test(this.path()));

  readonly inputs = computed<BannerInputs>(() => ({
    expired: this.conn.expired(),
    offline: this.online.offline(),
    offlineText: offlineBarText(this.snap.lastSavedAt()),
    update: this.update.bannerState(),
    install: this.inShell() && this.path() === '/today' && this.installLatched() ? this.install.todayModeNow() : null,
    font: this.inShell() && !this.fontScale.chosen() && !this.fontHintOff(),
  }));
  readonly banner = computed<Banner | null>(() => pickBanner(this.inputs()));

  constructor() {
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => this.path.set(this.pathOf(e.urlAfterRedirects)));
    // เริ่มแสดงชวนติดตั้งได้ครั้งเดียวต่อรอบ login ที่หน้าวันนี้ แล้วค้างจนกดปิด
    effect(() => {
      if (this.inShell() && this.path() === '/today' && !this.installLatched() && this.install.todayMode()) {
        this.installLatched.set(true);
        untracked(() => this.install.markTodayShown());
      }
    });
    effect(() => { this.auth.currentUser(); untracked(() => this.installLatched.set(false)); });
  }

  /** ปุ่มท้ายแถบ */
  async act(): Promise<void> {
    const b = this.banner();
    if (!b) return;
    switch (b.kind) {
      case 'expired': this.conn.reconnect(); break;
      case 'update': this.update.apply(); break;
      case 'install':
        if (this.inputs().install === 'native') await this.install.install();
        else void this.router.navigateByUrl('/settings?open=install');   // iPhone: ขั้นตอนเต็มอยู่ใน sheet ติดตั้งแอป
        break;
      case 'font': this.hideFontHint(); void this.router.navigateByUrl('/settings?open=display'); break;
      case 'offline': break;
    }
  }

  dismiss(): void {
    const b = this.banner();
    if (b?.kind === 'install') this.install.dismiss();
    else if (b?.kind === 'update') this.update.dismiss();
    else if (b?.kind === 'font') this.hideFontHint();
  }

  private hideFontHint(): void {
    this.fontHintOff.set(true);
    try { localStorage.setItem(FONT_HINT_KEY, '1'); } catch { /* storage ถูกบล็อก: ซ่อนเฉพาะรอบนี้ */ }
  }
  private readHintOff(): boolean { try { return localStorage.getItem(FONT_HINT_KEY) === '1'; } catch { return false; } }
  private pathOf(url: string): string { return url.split(/[?#]/)[0] || '/'; }
}
