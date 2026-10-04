import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { errorText } from '../../core/api/api-error';
import { SettingsApi } from '../../core/api/settings.api';
import { Slot, SlotTimes } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { SLOT_LABEL, SLOT_ORDER } from '../../core/i18n/labels';
import { TimePickerComponent } from '../../shared/components/time-picker/time-picker.component';
import { FontSizeToggleComponent } from '../../shared/font-size-toggle.component';
import { IconComponent, IconName } from '../../shared/icon.component';

const SLOT_ICON: Record<Slot, IconName> = { morning: 'sunrise', noon: 'sun', evening: 'sunset', bedtime: 'moon' };

@Component({
  selector: 'app-settings-page',
  imports: [MatButton, IconComponent, TimePickerComponent, FontSizeToggleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage {
  private api = inject(SettingsApi);
  private snack = inject(MatSnackBar);
  private auth = inject(AuthService);

  protected readonly slots = SLOT_ORDER;
  protected readonly label = SLOT_LABEL;
  protected readonly icon = SLOT_ICON;

  protected readonly times = signal<SlotTimes | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  private original = '';

  constructor() { this.load(); }

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

  protected save(): void {
    const t = this.times();
    if (!t) return;
    // ตรวจลำดับก่อนส่ง (backend ตรวจซ้ำอีกชั้น)
    for (let i = 1; i < SLOT_ORDER.length; i++) {
      if (t[SLOT_ORDER[i]] <= t[SLOT_ORDER[i - 1]]) {
        this.saveError.set(`เวลามื้อ${SLOT_LABEL[SLOT_ORDER[i]]}ต้องหลังมื้อ${SLOT_LABEL[SLOT_ORDER[i - 1]]}`);
        return;
      }
    }
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
