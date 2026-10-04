import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, map } from 'rxjs';
import { errorText } from '../../core/api/api-error';
import { HasUnsavedChanges } from '../../core/unsaved-changes.guard';
import { MedicationApi } from '../../core/api/medication.api';
import { SettingsApi } from '../../core/api/settings.api';
import { DoseUnit, MealRelation, Medication, MedicationInput, Slot, SlotTimes } from '../../core/api/models';
import { MEAL_LABEL, SLOT_LABEL, SLOT_ORDER, UNIT_LABEL, UNITS, doseText, thaiJoin, unitInDose } from '../../core/i18n/labels';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { SegmentedComponent } from '../../shared/components/segmented/segmented.component';
import { StepperComponent } from '../../shared/components/stepper/stepper.component';
import { IconComponent, IconName } from '../../shared/icon.component';

type Field = 'name' | 'strength' | 'dose' | 'unit' | 'meal' | 'slots' | 'indication' | 'warnings' | 'total';

// backend ตอบ error เป็นข้อความเดียว ไม่ระบุฟิลด์ → จับจากคำขึ้นต้นเพื่อแสดงใต้ช่องที่ผิด
const FIELD_BY_MESSAGE: [RegExp, Field][] = [
  [/^ชื่อยา/, 'name'], [/^ความแรง/, 'strength'], [/^ปริมาณ/, 'dose'], [/^หน่วย/, 'unit'], [/^เวลากิน/, 'meal'],
  [/^(มื้อที่กิน|ยาที่กินเมื่อ|ต้องเลือกมื้อ)/, 'slots'], [/^ข้อบ่งใช้/, 'indication'], [/^คำเตือน/, 'warnings'],
  [/^จำนวนยา/, 'total'],
];

const SLOT_ICON: Record<Slot, IconName> = { morning: 'sunrise', noon: 'sun', evening: 'sunset', bedtime: 'moon' };
const DEFAULT_TIMES: SlotTimes = { morning: '08:00', noon: '12:00', evening: '18:00', bedtime: '21:00' };

@Component({
  selector: 'app-med-form-page',
  imports: [FormsModule, RouterLink, MatButton, MatSlideToggle, IconComponent, SegmentedComponent, StepperComponent],
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

  protected readonly name = signal('');
  protected readonly strength = signal('');
  protected readonly dose = signal(1);
  protected readonly unit = signal<DoseUnit>('tablet');
  protected readonly meal = signal<string>('after');
  protected readonly asNeeded = signal(false);
  protected readonly slots = signal<Slot[]>(['morning']);
  protected readonly indication = signal('');
  protected readonly warnings = signal('');
  protected readonly total = signal<number | null>(null);

  protected readonly times = signal<SlotTimes>(DEFAULT_TIMES);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly formError = signal<string | null>(null);

  protected readonly allSlots = SLOT_ORDER;
  protected readonly slotLabel = SLOT_LABEL;
  protected readonly slotIcon = SLOT_ICON;
  protected readonly units = UNITS;
  protected readonly unitLabel = UNIT_LABEL;
  protected readonly mealOptions = (['before', 'after', 'with', 'any'] as const)
    .map((v) => ({ value: v, label: MEAL_LABEL[v] }));
  protected readonly doseDisplay = computed(() => `${doseText(this.dose())} ${unitInDose(this.unit())}`);

  /** ข้อความตรวจก่อนบันทึก เช่น "ทุกวัน เช้า และ เย็น ครั้งละ 1 เม็ด หลังอาหาร" */
  protected readonly preview = computed(() => {
    const when = this.asNeeded() ? 'เมื่อมีอาการ'
      : this.slots().length ? `ทุกวัน ${thaiJoin(SLOT_ORDER.filter((s) => this.slots().includes(s)).map((s) => SLOT_LABEL[s]))}`
      : 'ทุกวัน (ยังไม่ได้เลือกมื้อ)';
    const meal = MEAL_LABEL[this.meal() as MealRelation];
    return `${when} ครั้งละ ${doseText(this.dose())} ${unitInDose(this.unit())}${meal ? ' ' + meal : ''}`;
  });

  protected readonly moreOpen = signal(false);

  private initial = this.snapshot();
  private saved = false;

  constructor() {
    this.settings.slotTimes().subscribe({ next: (t) => this.times.set(t), error: () => { /* ใช้เวลาตั้งต้น */ } });
    effect(() => {
      const id = this.id();
      if (id) this.loadMedication(Number(id));
    });
  }

  private snapshot(): string {
    return JSON.stringify([this.name(), this.strength(), this.dose(), this.unit(), this.meal(), this.asNeeded(),
      this.slots(), this.indication(), this.warnings(), this.total()]);
  }

  private loadMedication(id: number): void {
    this.loading.set(true);
    this.api.get(id).subscribe({
      next: (m) => { this.fill(m); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.formError.set(errorText(e)); },
    });
  }

  private fill(m: Medication): void {
    this.name.set(m.name);
    this.strength.set(m.strength ?? '');
    this.dose.set(m.dose_per_time);
    this.unit.set(m.unit);
    this.meal.set(m.meal_relation);
    this.asNeeded.set(m.as_needed);
    this.slots.set(m.slots);
    this.indication.set(m.indication ?? '');
    this.warnings.set(m.warnings.join('\n'));
    this.total.set(m.total_qty);
    this.moreOpen.set(!!(m.strength || m.indication || m.warnings.length || m.total_qty !== null));
    this.initial = this.snapshot();
  }

  protected toggleSlot(s: Slot): void {
    this.slots.update((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
    this.clearError('slots');
  }

  protected setAsNeeded(on: boolean): void {
    this.asNeeded.set(on);
    if (on) this.slots.set([]);          // ยาเมื่อมีอาการต้องไม่มีมื้อ (backend ปฏิเสธถ้าส่งมา)
    else if (!this.slots().length) this.slots.set(['morning']);
    this.clearError('slots');
  }

  protected clearError(f: Field): void {
    if (this.errors()[f]) this.errors.update((e) => ({ ...e, [f]: undefined }));
  }

  protected onTotal(v: string): void {
    this.total.set(v === '' || v === null ? null : Number(v));
    this.clearError('total');
  }

  protected save(): void {
    this.formError.set(null);
    const errs: Partial<Record<Field, string>> = {};
    if (!this.name().trim()) errs.name = 'กรุณากรอกชื่อยา';
    if (!this.asNeeded() && !this.slots().length) errs.slots = 'กรุณาเลือกมื้อที่กินอย่างน้อย 1 มื้อ';
    this.errors.set(errs);
    if (Object.keys(errs).length) { this.focusFirstError(); return; }

    const body: MedicationInput = {
      name: this.name().trim(),
      strength: this.strength().trim() || null,
      dose_per_time: this.dose(),
      unit: this.unit(),
      meal_relation: this.meal() as MealRelation,
      as_needed: this.asNeeded(),
      slots: this.asNeeded() ? [] : SLOT_ORDER.filter((s) => this.slots().includes(s)),
      indication: this.indication().trim() || null,
      warnings: this.warnings().split('\n').map((w) => w.trim()).filter(Boolean),
      total_qty: this.total(),
    };
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
        const hit = FIELD_BY_MESSAGE.find(([re]) => re.test(msg));
        if (hit) {
          this.errors.set({ [hit[1]]: msg });
          if (['strength', 'indication', 'warnings', 'total'].includes(hit[1])) this.moreOpen.set(true);
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
