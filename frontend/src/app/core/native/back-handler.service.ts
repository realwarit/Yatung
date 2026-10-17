import { Injectable, inject } from '@angular/core';
import { Location } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatDialog } from '@angular/material/dialog';
import { App } from '@capacitor/app';
import { BackLayers } from './back-layers';
import { decideBack, parentOf, shouldHandleBack } from './back-decision';

/** ปุ่ม back ของ Android (เฉพาะ native — ไฟล์นี้ถูก import แบบ lazy จาก native-init) ; ลำดับดู `back-decision.ts` */
@Injectable({ providedIn: 'root' })
export class BackHandlerService {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly dialog = inject(MatDialog);
  private readonly bottom = inject(MatBottomSheet);
  private readonly layers = inject(BackLayers);

  private navCount = 0;
  private lastAt = 0;

  start(): void {
    this.router.events.subscribe((e) => { if (e instanceof NavigationEnd) this.navCount++; });
    void App.addListener('backButton', () => this.onBack());
  }

  private onBack(): void {
    const now = Date.now();
    if (!shouldHandleBack(now, this.lastAt)) return;
    this.lastAt = now;

    const action = decideBack({
      inline: this.layers.topScope(),
      overlayOpen: this.dialog.openDialogs.length > 0 || this.bottom._openedBottomSheetRef !== null,
      path: this.router.url,
      navigating: this.router.getCurrentNavigation() !== null,
      hasHistory: this.navCount > 1,
      cameFromWelcome: (history.state as { from?: string } | null)?.from === 'welcome',
    });
    switch (action) {
      case 'close-inline': this.layers.closeTop(); break;
      case 'close-overlay':
        if (this.dialog.openDialogs.length) this.dialog.openDialogs[this.dialog.openDialogs.length - 1].close();
        else this.bottom.dismiss();
        break;
      case 'history-back': this.location.back(); break;
      case 'go-parent': void this.router.navigateByUrl(parentOf(this.router.url), { replaceUrl: true }); break;
      case 'go-today': void this.router.navigateByUrl('/today', { replaceUrl: true }); break;
      case 'go-welcome': void this.router.navigateByUrl('/welcome', { replaceUrl: true }); break;
      case 'exit': void App.exitApp(); break;
      case 'ignore': break;
    }
  }
}
