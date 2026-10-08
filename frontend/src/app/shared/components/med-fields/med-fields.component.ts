import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatOption, MatSelect } from '@angular/material/select';
import { DoseUnit, MealRelation, Slot } from '../../../core/api/medicine-parse.model';
import { SlotTimes } from '../../../core/api/models';
import { MEAL_LABEL, SLOT_LABEL, SLOT_ORDER, UNIT_LABEL, UNITS, doseText, unitInDose } from '../../../core/i18n/labels';
import { IconComponent, IconName } from '../../icon.component';
import { SegmentedComponent } from '../segmented/segmented.component';
import { StepperComponent } from '../stepper/stepper.component';
import { MedDraft, MedField } from './med-draft';

/** ช่องที่ต้องตรวจ: เหตุผล + กด "ถูกต้องแล้ว" ได้หรือไม่ (ค่าว่างต้องเลือกเอง กดผ่านไม่ได้) */
export interface MedFlag { reason: string; canAck: boolean; }

const SLOT_ICON: Record<Slot, IconName> = { morning: 'sunrise', noon: 'sun', evening: 'sunset', bedtime: 'moon' };

/**
 * ช่องกรอกยาชุดเดียวกันของหน้าเพิ่ม/แก้ไขยา (วันที่ 3) และหน้า Review (วันที่ 5)
 * presentational: ค่าอยู่ใน `draft` (two-way) ; error/flag ส่งเข้าทาง input ; ทุกครั้งที่ผู้ใช้แก้ช่องใดจะยิง `edited`
 * `idPrefix` กัน id ซ้ำเมื่อมีหลายการ์ดในหน้าเดียว
 */
@Component({
  selector: 'app-med-fields',
  imports: [NgTemplateOutlet, FormsModule, MatSelect, MatOption, IconComponent, SegmentedComponent, StepperComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './med-fields.component.html',
  styleUrl: './med-fields.component.scss',
})
export class MedFieldsComponent {
  readonly draft = model.required<MedDraft>();
  readonly times = input.required<SlotTimes>();
  readonly errors = input<Partial<Record<MedField, string>>>({});
  readonly flags = input<Partial<Record<MedField, MedFlag>>>({});
  readonly idPrefix = input('f');
  /** พับ "ข้อมูลเพิ่มเติม" (two-way) */
  readonly moreOpen = model(false);
  readonly edited = output<MedField>();
  readonly ack = output<MedField>();

  protected readonly allSlots = SLOT_ORDER;
  protected readonly slotLabel = SLOT_LABEL;
  protected readonly slotIcon = SLOT_ICON;
  protected readonly units = UNITS;
  protected readonly unitLabel = UNIT_LABEL;
  protected readonly mealOptions = (['before', 'after', 'with', 'any'] as const)
    .map((v) => ({ value: v, label: MEAL_LABEL[v] }));
  protected readonly doseDisplay = computed(() => {
    const d = this.draft();
    return d.dose === null ? '—' : `${doseText(d.dose)} ${unitInDose(d.unit)}`;
  });

  protected set<K extends keyof MedDraft>(key: K, value: MedDraft[K], field: MedField): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
    this.edited.emit(field);
  }

  protected setMeal(v: string): void { this.set('meal', v as MealRelation, 'meal'); }
  protected setDose(v: number): void { this.set('dose', v, 'dose'); }
  protected setUnit(v: DoseUnit): void { this.set('unit', v, 'unit'); }

  protected onTotal(v: string | number | null): void {
    this.set('total', v === '' || v === null ? null : Number(v), 'total');
  }

  protected toggleSlot(s: Slot): void {
    const cur = this.draft().slots;
    this.set('slots', cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s], 'slots');
  }

  protected setAsNeeded(on: boolean): void {
    const d = this.draft();
    // ยาเมื่อมีอาการต้องไม่มีมื้อ (backend ปฏิเสธถ้าส่งมา)
    const slots: Slot[] = on ? [] : d.slots.length ? d.slots : ['morning'];
    this.draft.set({ ...d, asNeeded: on, slots });
    this.edited.emit('slots');
  }

  protected flagOf(f: MedField): MedFlag | undefined { return this.flags()[f]; }
  protected errText(f: MedField): string | undefined { return this.errors()[f]; }

  protected id(f: string): string { return `${this.idPrefix()}-${f}`; }

  /** aria-describedby ของช่อง: error ก่อน แล้วตามด้วยเหตุผลที่ต้องตรวจ */
  protected describedBy(f: MedField): string | null {
    const ids = [this.errors()[f] ? this.id('e-' + f) : '', this.flags()[f] ? this.id('flag-' + f) : ''].filter(Boolean);
    return ids.length ? ids.join(' ') : null;
  }
}
