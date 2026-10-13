import { ChangeDetectionStrategy, Component, computed, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SlotTimes } from '../../core/api/models';
import { UNIT_LABEL, doseText } from '../../core/i18n/labels';
import { MedDraft, MedField, previewText } from '../../shared/components/med-fields/med-draft';
import { MedFieldsComponent, MedGroup } from '../../shared/components/med-fields/med-fields.component';
import { IconComponent } from '../../shared/icon.component';
import { foldedGroups } from './review-fold';
import { ReviewCard, flagsForUi, refillQtyOk, summaryOf, todoOf } from './review.model';

const NONE: ReadonlySet<MedGroup> = new Set();

/** การ์ดยาหนึ่งตัวในหน้า Review: ฟอร์มเดียวกับหน้าเพิ่มยา (app-med-fields) + ช่องที่ต้องตรวจ + เติมจำนวนให้ยาเดิม */
@Component({
  selector: 'app-review-card',
  imports: [FormsModule, MedFieldsComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './review-card.component.html',
  styleUrl: './review-card.component.scss',
})
export class ReviewCardComponent {
  readonly card = model.required<ReviewCard>();
  readonly times = input.required<SlotTimes>();
  readonly position = input(1);
  readonly total = input(1);
  /** true = กางทุกช่อง (เช่น เซิร์ฟเวอร์ตอบ error ของการ์ดนี้ ผู้ใช้ต้องเห็นช่องที่ผิด) */
  readonly forceOpen = input(false);
  readonly remove = output<void>();

  protected readonly showSource = signal(false);
  /** ผู้ใช้กด "แก้ไข" ที่บรรทัดสรุป → กางทุกช่องในที่เดิม */
  protected readonly unfolded = signal(false);
  private fold0: ReadonlySet<MedGroup> | null = null;
  /** กลุ่มที่พับ — ตัดสินครั้งเดียวจากค่าตอนแรก (ไม่เปลี่ยนตามการแก้ไข) */
  protected readonly fold = computed<ReadonlySet<MedGroup>>(() => {
    if (this.unfolded() || this.forceOpen()) return NONE;
    return (this.fold0 ??= foldedGroups(untracked(() => this.card())));
  });
  protected readonly todo = computed(() => todoOf(this.card()));
  protected readonly flags = computed(() => flagsForUi(this.card()));
  protected readonly summary = computed(() => summaryOf(this.card(), previewText(this.card().draft)));
  protected readonly qtyBad = computed(() => this.card().mode === 'refill' && !refillQtyOk(this.card()));
  protected readonly unitName = computed(() => UNIT_LABEL[this.card().draft.unit]);
  protected readonly prefix = computed(() => `c${this.card().uid}`);
  protected readonly title = computed(() => this.card().draft.name.trim() || `ยาตัวที่ ${this.position()}`);
  protected readonly leftAfter = computed(() => {
    const c = this.card();
    return c.match ? doseText((c.match.remaining_qty ?? 0) + (c.refillQty ?? 0)) : '';
  });

  protected setDraft(draft: MedDraft): void { this.card.update((c) => ({ ...c, draft })); }
  protected setMore(moreOpen: boolean): void { this.card.update((c) => ({ ...c, moreOpen })); }
  protected setMode(mode: 'create' | 'refill'): void { this.card.update((c) => ({ ...c, mode })); }

  protected ack(f: MedField): void {
    this.card.update((c) => (c.acked.includes(f) ? c : { ...c, acked: [...c.acked, f] }));
  }

  protected onQty(v: string | number | null): void {
    this.card.update((c) => ({ ...c, refillQty: v === '' || v === null ? null : Number(v) }));
  }
}
