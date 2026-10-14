import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { errorText } from '../../core/api/api-error';
import { MedicationApi } from '../../core/api/medication.api';
import { Medication } from '../../core/api/models';
import { nbNum } from '../../core/nowrap';
import { FitLabelDirective } from '../../shared/fit-label.directive';
import { DoseQtyPipe, MealLabelPipe, NbNumPipe, SlotLabelPipe, UnitLabelPipe } from '../../core/i18n/labels.pipe';
import { thaiShortDate } from '../../core/time';
import { IconComponent } from '../../shared/icon.component';
import { SheetFrameComponent } from '../../shared/ui/sheet/sheet-frame.component';
import { injectSheetClose, injectSheetData } from '../../shared/ui/sheet/sheet.service';

/** ผลที่ sheet ส่งกลับให้หน้ายาของฉัน (หน้าเป็นคนเปิด dialog/ไปหน้าอื่น หลัง sheet ปิดสนิทแล้ว — ห้ามซ้อน dialog บน sheet) */
export type MedSheetResult =
  | { act: 'refill' | 'edit' }
  | { act: 'stopped' | 'resumed'; med: Medication };

/**
 * รายละเอียดยา 1 ตัว (D3 ช่วง 1): ตารางข้อมูล + เติมยา/แก้ไข + "หยุดใช้ยานี้" (ยืนยันแบบ inline ในที่เดียวกัน ไม่ใช่ dialog)
 * ไม่มีปุ่มลบ — ระบบเก็บประวัติการกินไว้ให้สถิติ จึงใช้ "หยุดใช้" และกลับมาใช้ใหม่ได้
 */
@Component({
  selector: 'app-med-detail-sheet',
  imports: [SheetFrameComponent, MatButton, IconComponent, FitLabelDirective, DoseQtyPipe, MealLabelPipe, NbNumPipe, SlotLabelPipe, UnitLabelPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './med-detail-sheet.component.scss',
  template: `
    <app-sheet-frame [title]="med.name + (med.strength ? ' ' + nb(med.strength) : '')">
      @if (med.is_active && med.is_low) {
        <p class="low"><app-icon name="alert" /> {{ med.remaining_qty === 0 ? 'ยาหมดแล้ว' : 'ใกล้หมด' }}</p>
      } @else if (!med.is_active) {
        <p class="stop"><app-icon name="ban" /> หยุดใช้เมื่อ {{ med.end_date ? date(med.end_date) : '' }}</p>
      }

      <dl class="rows">
        <div><dt>วิธีกิน</dt><dd><span class="seg">ครั้งละ {{ med.dose_per_time | doseQty: med.unit | nbNum }}</span>@if (med.meal_relation | mealLabel; as meal) { · <span class="seg">{{ meal }}</span> }</dd></div>
        <div><dt>มื้อ</dt>
          <dd><ul class="chips" aria-label="มื้อที่กิน">
            @if (med.as_needed) { <li class="prn">เมื่อมีอาการ</li> }
            @for (s of med.slots; track s) { <li [attr.data-slot]="s">{{ s | slotLabel }}</li> }
          </ul></dd>
        </div>
        @if (med.indication) { <div><dt>ใช้สำหรับ</dt><dd>{{ med.indication }}</dd></div> }
        @if (med.remaining_qty !== null) {
          <div><dt>คงเหลือ</dt>
            <dd>@if (med.remaining_qty === 0) { ยาหมดแล้ว } @else { <span class="seg">เหลือ {{ med.remaining_qty }}&nbsp;{{ med.unit | unitLabel }}</span>@if (med.days_left !== null) { · <span class="seg">พอใช้ {{ med.days_left }}&nbsp;วัน</span> } }</dd>
          </div>
        }
      </dl>

      @if (error(); as e) { <p class="yt-error-text" role="alert"><app-icon name="alert" /> {{ e }}</p> }

      @if (!med.is_active) {
        <div class="btns"><button mat-flat-button type="button" [disabled]="busy()" (click)="resume()"><app-icon name="undo" /> กลับมาใช้อีกครั้ง</button></div>
      } @else if (!confirming()) {
        <div class="btns yt-fitrow">
          <button mat-flat-button type="button" [class.quiet]="!med.is_low" (click)="done({ act: 'refill' })" fitGroup="med-sheet" fitLabel="เติมยา"><app-icon class="fit-icon" name="plus" /> เติมยา</button>
          <button mat-stroked-button type="button" (click)="done({ act: 'edit' })" fitGroup="med-sheet" fitLabel="แก้ไข"><app-icon class="fit-icon" name="edit" /> แก้ไข</button>
        </div>
        <button type="button" class="stop-link" (click)="ask()">หยุดใช้ยานี้</button>
      } @else {
        <div #confirm class="confirm" tabindex="-1" role="group" aria-labelledby="stop-q">
          <p id="stop-q" class="q">หยุดใช้ <span class="q__n">{{ med.name }}&nbsp;ไหมคะ?</span></p>
          <p class="q__sub">ประวัติการกินยังอยู่ และกลับมาใช้ใหม่ได้ค่ะ</p>
          <div class="btns yt-fitrow">
            <button mat-stroked-button type="button" [disabled]="busy()" (click)="confirming.set(false)" fitGroup="med-stop" fitLabel="ยกเลิก">ยกเลิก</button>
            <button mat-flat-button type="button" [disabled]="busy()" (click)="stop()" fitGroup="med-stop" [fitLabel]="busy() ? 'กำลังหยุด…' : 'หยุดใช้'">{{ busy() ? 'กำลังหยุด…' : 'หยุดใช้' }}</button>
          </div>
        </div>
      }
    </app-sheet-frame>
  `,
})
export class MedDetailSheetComponent {
  protected readonly med = injectSheetData<Medication>();
  private readonly close = injectSheetClose();
  private readonly api = inject(MedicationApi);
  private readonly confirmEl = viewChild<ElementRef<HTMLElement>>('confirm');

  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly nb = nbNum;
  protected date(ymd: string): string { return thaiShortDate(ymd); }
  protected done(r: MedSheetResult): void { this.close(r); }

  protected ask(): void {
    this.error.set(null);
    this.confirming.set(true);
    setTimeout(() => this.confirmEl()?.nativeElement.focus());   // ให้ผู้ใช้คีย์บอร์ด/โปรแกรมอ่านจอลงที่คำถามยืนยัน
  }

  protected stop(): void { this.run(this.api.stop(this.med.id), 'stopped'); }
  protected resume(): void { this.run(this.api.resume(this.med.id), 'resumed'); }

  private run(req: ReturnType<MedicationApi['stop']>, act: 'stopped' | 'resumed'): void {
    this.busy.set(true);
    this.error.set(null);
    req.subscribe({
      next: (med) => this.close({ act, med } satisfies MedSheetResult),
      error: (e) => { this.busy.set(false); this.error.set(errorText(e)); },
    });
  }
}
