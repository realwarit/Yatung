import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatMenu, MatMenuContent, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { errorText } from '../../core/api/api-error';
import { MedicationApi } from '../../core/api/medication.api';
import { Medication } from '../../core/api/models';
import { SLOT_LABEL, thaiJoin } from '../../core/i18n/labels';
import { DoseQtyPipe, MealLabelPipe, SlotLabelPipe, UnitLabelPipe } from '../../core/i18n/labels.pipe';
import { thaiShortDate } from '../../core/time';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { MascotComponent } from '../../shared/components/mascot/mascot.component';
import { SegmentedComponent } from '../../shared/components/segmented/segmented.component';
import { IconComponent } from '../../shared/icon.component';
import { RefillDialogComponent } from './refill-dialog.component';

@Component({
  selector: 'app-medications-page',
  imports: [RouterLink, MatButton, MatMenu, MatMenuContent, MatMenuItem, MatMenuTrigger, IconComponent, MascotComponent, SegmentedComponent,
    DoseQtyPipe, MealLabelPipe, SlotLabelPipe, UnitLabelPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './medications.page.html',
  styleUrl: './medications.page.scss',
})
export class MedicationsPage {
  private api = inject(MedicationApi);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  protected readonly meds = signal<Medication[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly tab = signal('active');

  protected readonly active = computed(() => this.meds().filter((m) => m.is_active));
  protected readonly stopped = computed(() => this.meds().filter((m) => !m.is_active));
  protected readonly shown = computed(() => (this.tab() === 'active' ? this.active() : this.stopped()));
  protected readonly tabs = computed(() => [
    { value: 'active', label: 'กำลังใช้', count: this.active().length },
    { value: 'stopped', label: 'หยุดแล้ว', count: this.stopped().length },
  ]);

  constructor() { this.load(); }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.list().subscribe({
      next: (list) => { this.meds.set(list); this.loading.set(false); },
      error: (e) => { this.error.set(errorText(e)); this.loading.set(false); },
    });
  }

  /** เหลือพอใช้ ≤ จำนวนวันที่ตั้งเตือน (ปกติ 3 วัน) */
  protected isLow(m: Medication): boolean {
    return m.is_active && m.days_left !== null && m.days_left <= m.refill_alert_days;
  }

  protected date(ymd: string): string { return thaiShortDate(ymd); }

  protected refill(m: Medication): void {
    this.dialog.open<RefillDialogComponent, Medication, Medication>(RefillDialogComponent, { data: m, width: '28rem', maxWidth: '92vw', autoFocus: 'dialog' })
      .afterClosed().subscribe((updated) => {
        if (!updated) return;
        this.replace(updated);
        this.snack.open(`เติมยา ${updated.name} แล้ว`, undefined, { duration: 5000, panelClass: 'yt-snack' });
      });
  }

  protected stop(m: Medication): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '28rem', maxWidth: '92vw', autoFocus: 'dialog',
      data: {
        title: `หยุดใช้ ${m.name}?`,
        message: m.as_needed ? 'ยานี้จะย้ายไปแท็บ "หยุดแล้ว"' : 'รอบที่เหลือของวันนี้จะถูกลบ',
        confirmLabel: 'หยุดใช้ยา',
      },
    }).afterClosed().subscribe((ok) => {
      if (!ok) return;
      this.api.stop(m.id).subscribe({
        next: (updated) => { this.replace(updated); this.snack.open(`หยุดใช้ ${m.name} แล้ว`, undefined, { duration: 5000, panelClass: 'yt-snack' }); },
        error: (e) => this.snack.open(errorText(e), 'ตกลง', { duration: 8000, panelClass: 'yt-snack' }),
      });
    });
  }

  protected resume(m: Medication): void {
    this.api.resume(m.id).subscribe({
      next: (updated) => {
        this.replace(updated);
        const skipped = updated.skipped_slots_today ?? [];
        const extra = skipped.length
          ? ` · รอบ${thaiJoin(skipped.map((s) => SLOT_LABEL[s]), true)}ของวันนี้ผ่านไปแล้ว จะเริ่มเตือนพรุ่งนี้` : '';
        this.snack.open(`กลับมาใช้ ${m.name} แล้ว${extra}`, 'ตกลง', { duration: skipped.length ? 10_000 : 5000, panelClass: 'yt-snack' });
        this.tab.set('active');
      },
      error: (e) => this.snack.open(errorText(e), 'ตกลง', { duration: 8000, panelClass: 'yt-snack' }),
    });
  }

  private replace(updated: Medication): void {
    this.meds.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
  }
}
