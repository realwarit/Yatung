import { ChangeDetectionStrategy, Component, computed, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SlotTimes } from '../../core/api/models';
import { UNIT_LABEL, doseText } from '../../core/i18n/labels';
import { MedDraft, MedField, previewText } from '../../shared/components/med-fields/med-draft';
import { MedFieldsComponent } from '../../shared/components/med-fields/med-fields.component';
import { IconComponent } from '../../shared/icon.component';
import { ReviewCard, flagsForUi, refillQtyOk, summaryOf, todoOf } from './review.model';

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
  readonly remove = output<void>();

  protected readonly showSource = signal(false);
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
