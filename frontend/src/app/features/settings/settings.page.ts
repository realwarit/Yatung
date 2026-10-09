import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { errorText } from '../../core/api/api-error';
import { SettingsApi } from '../../core/api/settings.api';
import { Slot, SlotTimes } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { SLOT_LABEL, SLOT_ORDER } from '../../core/i18n/labels';
import { TimeRowComponent } from '../../shared/components/time-row/time-row.component';
import { FontSizeToggleComponent } from '../../shared/font-size-toggle.component';
import { IconComponent, IconName } from '../../shared/icon.component';
import { DemoApi } from '../../core/api/line.api';
import { CaregiversSectionComponent } from './caregivers-section.component';
import { DemoSectionComponent } from './demo-section.component';
import { LineSectionComponent } from './line-section.component';

const SLOT_ICON: Record<Slot, IconName> = { morning: 'sunrise', noon: 'sun', evening: 'sunset', bedtime: 'moon' };

@Component({
  selector: 'app-settings-page',
  imports: [MatButton, IconComponent, TimeRowComponent, FontSizeToggleComponent, LineSectionComponent, CaregiversSectionComponent, DemoSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage {
  private api = inject(SettingsApi);
  private snack = inject(MatSnackBar);
  private auth = inject(AuthService);
  private demo = inject(DemoApi);

  protected readonly slots = SLOT_ORDER;
  protected readonly label = SLOT_LABEL;
  protected readonly icon = SLOT_ICON;

  protected readonly times = signal<SlotTimes | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** GET /api/config (สาธารณะ) → true = แสดงปุ่มทดลองส่งเตือน; เรียกไม่ได้ = ซ่อน */
  protected readonly demoMode = signal(false);
  private original = '';

  constructor() {
    this.load();
    this.demo.config().subscribe({ next: (c) => this.demoMode.set(c.demoMode === true), error: () => this.demoMode.set(false) });
  }

  protected load(): void {
    this.loadError.set(null);
    this.api.slotTimes().subscribe({
      next: (t) => { this.times.set(t); this.original = JSON.stringify(t); },
      error: (e) => this.loadError.set(errorText(e)),
    });
  }

  protected setTime(slot: Slot, value: string): void {
    this.times.update((t) => t && { ...t, [slot]: value });
    this.saveError.set(null);
  }

  protected get dirty(): boolean { return JSON.stringify(this.times()) !== this.original; }

  /** ข้อความเตือนของแต่ละมื้อที่เวลาไม่เรียง (เช้า < กลางวัน < เย็น < ก่อนนอน) */
  protected readonly orderErrors = computed<Partial<Record<Slot, string>>>(() => {
    const t = this.times();
    const out: Partial<Record<Slot, string>> = {};
    if (!t) return out;
    for (let i = 1; i < SLOT_ORDER.length; i++) {
      const cur = SLOT_ORDER[i], prev = SLOT_ORDER[i - 1];
      if (t[cur] <= t[prev]) out[cur] = `เวลามื้อ${SLOT_LABEL[cur]}ต้องหลังมื้อ${SLOT_LABEL[prev]} (${t[prev]})`;
    }
    return out;
  });
  protected readonly hasOrderError = computed(() => Object.keys(this.orderErrors()).length > 0);

  protected save(): void {
    const t = this.times();
    if (!t || this.hasOrderError()) return;   // ปุ่มถูกปิดอยู่แล้ว; backend ตรวจซ้ำอีกชั้น
    this.saving.set(true);
    this.saveError.set(null);
    this.api.saveSlotTimes(t).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.times.set(saved);
        this.original = JSON.stringify(saved);
        this.snack.open('บันทึกเวลามื้อยาแล้ว', undefined, { duration: 5000, panelClass: 'yt-snack' });
      },
      error: (e) => { this.saving.set(false); this.saveError.set(errorText(e)); },
    });
  }

  protected logout(): void { this.auth.logout(); }
}
