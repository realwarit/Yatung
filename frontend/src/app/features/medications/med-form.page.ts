import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, map } from 'rxjs';
import { errorText } from '../../core/api/api-error';
import { HasUnsavedChanges } from '../../core/unsaved-changes.guard';
import { MedicationApi } from '../../core/api/medication.api';
import { SettingsApi } from '../../core/api/settings.api';
import { Medication, SlotTimes } from '../../core/api/models';
import { SLOT_LABEL, thaiJoin } from '../../core/i18n/labels';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { EMPTY_DRAFT, MedDraft, MedField, fieldFromMessage, previewText, toMedicationInput } from '../../shared/components/med-fields/med-draft';
import { MedFieldsComponent } from '../../shared/components/med-fields/med-fields.component';
import { IconComponent } from '../../shared/icon.component';

const DEFAULT_TIMES: SlotTimes = { morning: '08:00', noon: '12:00', evening: '18:00', bedtime: '21:00' };

@Component({
  selector: 'app-med-form-page',
  imports: [RouterLink, MatButton, IconComponent, MedFieldsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './med-form.page.html',
  styleUrl: './med-form.page.scss',
})
export class MedFormPage implements HasUnsavedChanges {
  private api = inject(MedicationApi);
  private settings = inject(SettingsApi);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  /** :id จาก route (ไม่มี = เพิ่มยาใหม่) */
  readonly id = input<string>();
  protected readonly isEdit = computed(() => !!this.id());

  protected readonly draft = signal<MedDraft>({ ...EMPTY_DRAFT });
  protected readonly times = signal<SlotTimes>(DEFAULT_TIMES);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly errors = signal<Partial<Record<MedField, string>>>({});
  protected readonly formError = signal<string | null>(null);
  protected readonly moreOpen = signal(false);

  /** ข้อความตรวจก่อนบันทึก เช่น "ทุกวัน เช้า และ เย็น ครั้งละ 1 เม็ด หลังอาหาร" */
  protected readonly preview = computed(() => previewText(this.draft()));

  private initial = this.snapshot();
  private saved = false;

  constructor() {
    this.settings.slotTimes().subscribe({ next: (t) => this.times.set(t), error: () => { /* ใช้เวลาตั้งต้น */ } });
    effect(() => {
      const id = this.id();
      if (id) this.loadMedication(Number(id));
    });
  }

  private snapshot(): string { return JSON.stringify(this.draft()); }

  private loadMedication(id: number): void {
    this.loading.set(true);
    this.api.get(id).subscribe({
      next: (m) => { this.fill(m); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.formError.set(errorText(e)); },
    });
  }

  private fill(m: Medication): void {
    this.draft.set({
      name: m.name, strength: m.strength ?? '', dose: m.dose_per_time, unit: m.unit, meal: m.meal_relation,
      asNeeded: m.as_needed, slots: m.slots, indication: m.indication ?? '', warnings: m.warnings.join('\n'),
      total: m.total_qty,
    });
    this.moreOpen.set(!!(m.strength || m.indication || m.warnings.length || m.total_qty !== null));
    this.initial = this.snapshot();
  }

  protected clearError(f: MedField): void {
    if (this.errors()[f]) this.errors.update((e) => ({ ...e, [f]: undefined }));
  }

  protected save(): void {
    this.formError.set(null);
    const d = this.draft();
    const errs: Partial<Record<MedField, string>> = {};
    if (!d.name.trim()) errs.name = 'กรุณากรอกชื่อยา';
    if (!d.asNeeded && !d.slots.length) errs.slots = 'กรุณาเลือกมื้อที่กินอย่างน้อย 1 มื้อ';
    this.errors.set(errs);
    if (Object.keys(errs).length) { this.focusFirstError(); return; }

    const body = toMedicationInput(d);
    const id = this.id();
    this.saving.set(true);
    (id ? this.api.update(Number(id), body) : this.api.create(body)).subscribe({
      next: (m) => {
        this.saved = true;
        const skipped = m.skipped_slots_today ?? [];
        const extra = skipped.length
          ? ` · รอบ${thaiJoin(skipped.map((s) => SLOT_LABEL[s]), true)}ของวันนี้ผ่านไปแล้ว จะเริ่มเตือนพรุ่งนี้` : '';
        this.snack.open(`บันทึกยาแล้ว${extra}`, 'ตกลง', { duration: skipped.length ? 10_000 : 5000, panelClass: 'yt-snack' });
        this.router.navigate(['/medications']);
      },
      error: (e) => {
        this.saving.set(false);
        const msg = errorText(e);
        const field = fieldFromMessage(msg);
        if (field) {
          this.errors.set({ [field]: msg });
          if (['strength', 'indication', 'warnings', 'total'].includes(field)) this.moreOpen.set(true);
          this.focusFirstError();
        } else {
          this.formError.set(msg);
        }
      },
    });
  }

  canLeave(): boolean | Observable<boolean> {
    if (this.saved || this.snapshot() === this.initial) return true;
    return this.dialog.open<ConfirmDialogComponent, unknown, boolean>(ConfirmDialogComponent, {
      width: '28rem', maxWidth: '92vw', autoFocus: 'dialog',
      data: { title: 'ออกโดยไม่บันทึก?', message: 'ข้อมูลที่กรอกไว้จะหายไปนะคะ', confirmLabel: 'ออกจากหน้านี้', cancelLabel: 'กลับไปแก้ไข' },
    }).afterClosed().pipe(map((ok) => !!ok));
  }

  // กันปิดแท็บ/รีเฟรชทั้งที่ยังไม่บันทึก
  @HostListener('window:beforeunload', ['$event'])
  protected onUnload(e: BeforeUnloadEvent): void {
    if (!this.saved && this.snapshot() !== this.initial) e.preventDefault();
  }

  private focusFirstError(): void {
    setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }
}
