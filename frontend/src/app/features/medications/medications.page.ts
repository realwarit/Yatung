import { ErrTextComponent } from '../../shared/components/err-text/err-text.component';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { errorText } from '../../core/api/api-error';
import { MedicationApi } from '../../core/api/medication.api';
import { Medication } from '../../core/api/models';
import { SLOT_LABEL, thaiJoin } from '../../core/i18n/labels';
import { DoseQtyPipe, MealLabelPipe, NbNumPipe, SlotLabelPipe, UnitLabelPipe } from '../../core/i18n/labels.pipe';
import { thaiShortDate } from '../../core/time';
import { FitLabelDirective } from '../../shared/fit-label.directive';
import { MascotComponent } from '../../shared/components/mascot/mascot.component';
import { SegmentedComponent } from '../../shared/components/segmented/segmented.component';
import { SpeechBubbleComponent } from '../../shared/components/speech-bubble/speech-bubble.component';
import { IconComponent } from '../../shared/icon.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { SheetService } from '../../shared/ui/sheet/sheet.service';
import { MedDetailSheetComponent, MedSheetResult } from './med-detail-sheet.component';
import { medsSay } from './meds-say';
import { RefillDialogComponent } from './refill-dialog.component';

@Component({
  selector: 'app-medications-page',
  imports: [ErrTextComponent, RouterLink, MatButton, IconComponent, MascotComponent, SegmentedComponent, SpeechBubbleComponent, EmptyStateComponent,
    DoseQtyPipe, MealLabelPipe, NbNumPipe, SlotLabelPipe, UnitLabelPipe, FitLabelDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './medications.page.html',
  styleUrl: './medications.page.scss',
})
export class MedicationsPage {
  private api = inject(MedicationApi);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private sheet = inject(SheetService);
  private router = inject(Router);

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
  /** กล่องคำพูดเดียวของหน้า */
  protected readonly say = computed(() => medsSay(this.tab() === 'stopped' ? 'stopped' : 'active', this.meds()));

  /** หน้าว่าง : ยังไม่มียา หรือมีแต่ยาที่หยุดแล้ว (แท็บ "กำลังใช้") */
  protected readonly isEmpty = computed(() => !this.loading() && !this.error() && this.tab() === 'active' && this.active().length === 0);

  constructor() { this.load(); }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.list().subscribe({
      next: (list) => { this.meds.set(list); this.loading.set(false); },
      error: (e) => { this.error.set(errorText(e)); this.loading.set(false); },
    });
  }

  /** เกณฑ์เดียวกับ LINE: backend คำนวณ is_low ให้ (stock-service) */
  protected isLow(m: Medication): boolean {
    return m.is_active && m.is_low;
  }

  protected date(ymd: string): string { return thaiShortDate(ymd); }

  /** แตะที่ว่างของการ์ด (ไม่ใช่ปุ่ม/ลิงก์) = เปิดรายละเอียด */
  protected cardTap(e: Event, m: Medication): void {
    if ((e.target as Element).closest('button, a')) return;
    this.open(m);
  }

  /** รายละเอียดยา (sheet) ; เติมยา/แก้ไขทำหลัง sheet ปิดสนิทแล้ว — ไม่เปิด dialog ซ้อนบน sheet */
  protected async open(m: Medication): Promise<void> {
    const r = await this.sheet.open<MedDetailSheetComponent, Medication, MedSheetResult>(MedDetailSheetComponent, m);
    if (!r) return;
    switch (r.act) {
      case 'refill': this.refill(m); break;
      case 'edit': void this.router.navigate(['/medications', m.id, 'edit']); break;
      case 'stopped':
        this.replace(r.med);
        this.snack.open(`หยุดใช้ ${m.name} แล้ว`, undefined, { duration: 5000, panelClass: 'yt-snack' });
        break;
      case 'resumed': this.resumed(m, r.med); break;
    }
  }

  protected refill(m: Medication): void {
    this.dialog.open<RefillDialogComponent, Medication, Medication>(RefillDialogComponent, { data: m, width: '28rem', maxWidth: '92vw', autoFocus: 'dialog' })
      .afterClosed().subscribe((updated) => {
        if (!updated) return;
        this.replace(updated);
        this.snack.open(`เติมยา ${updated.name} แล้ว`, undefined, { duration: 5000, panelClass: 'yt-snack' });
      });
  }

  protected resume(m: Medication): void {
    this.api.resume(m.id).subscribe({
      next: (updated) => this.resumed(m, updated),
      error: (e) => this.snack.open(errorText(e), 'ตกลง', { duration: 8000, panelClass: 'yt-snack' }),
    });
  }

  private resumed(m: Medication, updated: Medication): void {
    this.replace(updated);
    const skipped = updated.skipped_slots_today ?? [];
    const extra = skipped.length
      ? ` · รอบ${thaiJoin(skipped.map((s) => SLOT_LABEL[s]), true)}ของวันนี้ผ่านไปแล้ว จะเริ่มเตือนพรุ่งนี้` : '';
    this.snack.open(`กลับมาใช้ ${m.name} แล้ว${extra}`, 'ตกลง', { duration: skipped.length ? 10_000 : 5000, panelClass: 'yt-snack' });
    this.tab.set('active');
  }

  private replace(updated: Medication): void {
    this.meds.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
  }
}
