import { FitLabelDirective } from '../../shared/fit-label.directive';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Slot } from '../../core/api/models';
import { MEAL_LABEL, SLOT_LABEL, doseText, sourceLabel, unitInDose } from '../../core/i18n/labels';
import { IconComponent, IconName } from '../../shared/icon.component';
import { TtsButtonComponent } from '../../shared/components/tts-button/tts-button.component';
import { ListRowComponent } from '../../shared/ui/list-row/list-row.component';
import { DoseVM, SlotVM } from './today-model';

const SLOT_ICON: Record<Slot, IconName> = { morning: 'sunrise', noon: 'sun', evening: 'sunset', bedtime: 'moon' };

/**
 * 1 มื้อบนหน้าวันนี้ — 3 รูปแบบตามสถานะ (ดู SlotVM.mode) :
 *  open = หัวมื้อ + chip สถานะ + 🔊 + แถวยา + "กินครบมื้อนี้" (เมื่อมียาถึงเวลาที่ยังไม่กิน ≥ 2)
 *  next พับ = "เย็น · 18:00 / chip อีก n นาที" + บรรทัดรอง [chip มื้อถัดไป] ชื่อยา (หัวรูปแบบเดียวกับมื้อที่กาง) (ไม่มีปุ่มกินแล้ว) ; กางเอง = แถวยาตามเดิม
 *  done พับ = แถวเขียว "เช้า กินครบแล้ว" ; กางดู/ยกเลิกได้
 * ออฟไลน์ : ปุ่มกดไม่ได้ (aria-disabled) ไม่มีข้อความใต้ทุกแถว — แตะแล้วแจ้งผ่าน `blocked` ครั้งเดียว (หน้าแม่เป็นคนแสดง)
 */
@Component({
  selector: 'app-slot-group',
  imports: [IconComponent, ListRowComponent, TtsButtonComponent, FitLabelDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './slot-group.component.html',
  styleUrl: './slot-group.component.scss',
  host: { '[attr.data-slot]': 's().slot', '[attr.data-mode]': 's().mode', '[attr.data-first-screen]': 's().isNext ? "next-slot" : null' },
})
export class SlotGroupComponent {
  readonly s = input.required<SlotVM>();
  readonly offline = input(false);
  readonly busyIds = input<ReadonlySet<number>>(new Set());
  readonly popId = input<number | null>(null);
  readonly lowText = input<ReadonlyMap<number, string>>(new Map());
  readonly taking = input(false);
  /** มื้อแรกที่เปิดอยู่ของหน้า (ติดป้าย first-screen ให้ปุ่มกินแล้วตัวแรก) */
  readonly firstOpen = input(false);
  /** สร้างข้อความอ่านออกเสียงของมื้อนี้ (อ้างอิงคงที่ต่อมื้อ) */
  readonly speak = input.required<() => string[]>();

  readonly take = output<DoseVM>();
  readonly undo = output<number>();
  readonly takeAll = output<void>();
  readonly toggle = output<void>();
  readonly blocked = output<void>();

  protected readonly name = (slot: Slot): string => SLOT_LABEL[slot];
  protected readonly icon = (slot: Slot): IconName => SLOT_ICON[slot];
  protected readonly canTakeAll = (): boolean => this.s().mode === 'open' && this.s().takeAllIds.length >= 2;

  protected title(v: DoseVM): string { return v.dose.strength ? `${v.dose.name} ${v.dose.strength}` : v.dose.name; }

  /** "1 เม็ด · หลังอาหาร" (+ เวลาของรอบนี้เมื่อมื้อมีหลายเวลา, + ช่องทางที่ยืนยันเมื่อกินแล้ว) */
  protected sub(v: DoseVM): string {
    const d = v.dose;
    const parts = [`${doseText(d.dose_per_time)} ${unitInDose(d.unit)}`];
    const meal = MEAL_LABEL[d.meal_relation];
    if (meal) parts.push(meal);
    if (this.s().multiTime) parts.unshift(`${d.scheduled_at.slice(11, 16)} น.`);
    if (v.state === 'taken') { const src = sourceLabel(d.source); if (src) parts.push(src); }
    return parts.join(' · ');
  }

  protected onTake(v: DoseVM): void { if (this.offline()) this.blocked.emit(); else this.take.emit(v); }
  protected onUndo(v: DoseVM): void { if (this.offline()) this.blocked.emit(); else this.undo.emit(v.dose.id); }
  protected onTakeAll(): void { if (this.offline()) this.blocked.emit(); else this.takeAll.emit(); }
}
