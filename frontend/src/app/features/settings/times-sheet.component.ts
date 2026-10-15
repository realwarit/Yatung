import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { errorText } from '../../core/api/api-error';
import { SettingsApi } from '../../core/api/settings.api';
import { Slot, SlotTimes } from '../../core/api/models';
import { SLOT_LABEL, SLOT_ORDER } from '../../core/i18n/labels';
import { ErrTextComponent } from '../../shared/components/err-text/err-text.component';
import { TimeRowComponent } from '../../shared/components/time-row/time-row.component';
import { FitLabelDirective } from '../../shared/fit-label.directive';
import { IconComponent, IconName } from '../../shared/icon.component';
import { SheetFrameComponent } from '../../shared/ui/sheet/sheet-frame.component';
import { injectSheetClose, injectSheetData } from '../../shared/ui/sheet/sheet.service';

const SLOT_ICON: Record<Slot, IconName> = { morning: 'sunrise', noon: 'sun', evening: 'sunset', bedtime: 'moon' };

/** sheet "เวลากินยาแต่ละมื้อ" : ค่าเริ่มต้นส่งมาจากหน้ารวม ; บันทึก = PUT /api/settings/slot-times ทั้ง 4 ค่าเหมือนเดิม ; ปิดแล้วส่งเวลาล่าสุดกลับ */
@Component({
  selector: 'app-times-sheet',
  imports: [SheetFrameComponent, MatButton, IconComponent, TimeRowComponent, ErrTextComponent, FitLabelDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .hint { margin: 0 0 var(--yt-space-3); color: var(--yt-text-muted); }
    .slot { padding: var(--yt-space-3) 0; border-top: 1px solid var(--yt-border); }
    .yt-alert { margin-top: var(--yt-space-3); }
    .btns { margin-top: var(--yt-space-3); }
    .sk { height: 14rem; }
  `,
  template: `
    <app-sheet-frame title="เวลากินยาแต่ละมื้อ">
      <p class="hint">รอบวันนี้ที่ยังไม่ได้กินจะย้ายไปเวลาใหม่ รอบที่กินแล้วไม่เปลี่ยน</p>
      @if (loadError(); as err) {
        <div class="yt-alert yt-alert--danger" role="alert"><app-icon name="alert" /> <span><app-err-text [text]="err" /></span></div>
        <div class="btns"><button mat-flat-button type="button" (click)="load()">ลองใหม่</button></div>
      } @else if (times(); as t) {
        @for (s of slots; track s) {
          <div class="slot"><app-time-row [inline]="true" [value]="t[s]" (valueChange)="setTime(s, $event)" [label]="label[s]" [icon]="icon[s]" [error]="orderErrors()[s] ?? null" /></div>
        }
        @if (saveError(); as se) { <div class="yt-alert yt-alert--danger" role="alert"><app-icon name="alert" /> <span>{{ se }}</span></div> }
        <div class="btns yt-fitrow">
          <button mat-stroked-button type="button" fitGroup="times-act" fitLabel="ปิด" (click)="close(saved())">ปิด</button>
          <button mat-flat-button type="button" fitGroup="times-act" [fitLabel]="saving() ? 'กำลังบันทึก…' : 'บันทึกเวลา'" [disabled]="saving() || !dirty() || hasOrderError()" (click)="save()">
            {{ saving() ? 'กำลังบันทึก…' : 'บันทึกเวลา' }}
          </button>
        </div>
      } @else {
        <div class="yt-skeleton sk" aria-busy="true" aria-label="กำลังโหลดเวลามื้อ"></div>
      }
    </app-sheet-frame>
  `,
})
export class TimesSheetComponent {
  private api = inject(SettingsApi);
  private snack = inject(MatSnackBar);
  protected readonly close = injectSheetClose();
  private readonly initial = injectSheetData<SlotTimes | null>();

  protected readonly slots = SLOT_ORDER;
  protected readonly label = SLOT_LABEL;
  protected readonly icon = SLOT_ICON;
  protected readonly times = signal<SlotTimes | null>(this.initial);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** เวลาที่บันทึกแล้วล่าสุด (ส่งกลับให้หน้ารวมเมื่อปิด) */
  protected readonly saved = signal<SlotTimes | null>(this.initial);
  protected readonly dirty = computed(() => JSON.stringify(this.times()) !== JSON.stringify(this.saved()));

  constructor() { if (!this.initial) this.load(); }

  protected load(): void {
    this.loadError.set(null);
    this.api.slotTimes().subscribe({ next: (t) => { this.times.set(t); this.saved.set(t); }, error: (e) => this.loadError.set(errorText(e)) });
  }

  protected setTime(slot: Slot, value: string): void {
    this.times.update((t) => t && { ...t, [slot]: value });
    this.saveError.set(null);
  }

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
    if (!t || this.hasOrderError()) return;
    this.saving.set(true);
    this.saveError.set(null);
    this.api.saveSlotTimes(t).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.times.set(saved);
        this.saved.set(saved);
        this.snack.open('บันทึกเวลามื้อยาแล้ว', undefined, { duration: 5000, panelClass: 'yt-snack' });
      },
      error: (e) => { this.saving.set(false); this.saveError.set(errorText(e)); },
    });
  }
}
