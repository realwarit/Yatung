import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { IconComponent } from '../../shared/icon.component';

/**
 * แถบล่างของหน้า Review: ปุ่มหลัก "บันทึก N รายการ" + "ทิ้งผลสแกนนี้"
 * ยังบันทึกไม่ได้ = ปุ่มปิด แต่ต้องบอกเหตุผลใต้/เหนือปุ่มเสมอ (+ ปุ่ม "ไปจุดถัดไป") — ห้ามปิดปุ่มเฉยๆ
 */
@Component({
  selector: 'app-review-bar',
  imports: [MatButton, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar" role="region" aria-label="บันทึกผลสแกน">
      @if (blocker()) {
        <p class="bar__why" id="why" role="status">
          <app-icon name="alert" />
          <span class="why__s" aria-hidden="true">{{ short() }}</span>
          <span class="why__l">{{ blocker() }}</span>
          @if (remaining() > 0 && count() > 0) {
            <button type="button" class="bar__next" (click)="next.emit()">ไปจุดถัดไป <app-icon name="arrow-right" /></button>
          }
        </p>
      }
      <div class="bar__btns">
        <button mat-stroked-button type="button" class="bar__drop" (click)="discard.emit()" [disabled]="leaving()">ทิ้งผลสแกนนี้</button>
        <button mat-flat-button type="button" class="bar__save" (click)="save.emit()" [disabled]="!canSave()"
                [attr.aria-describedby]="blocker() ? 'why' : null">
          @if (saving()) { กำลังบันทึก… } @else { บันทึก {{ count() }} รายการ<span class="more">เข้าตารางยา</span> }
        </button>
      </div>
    </div>
  `,
  styleUrl: './review-bar.component.scss',
})
export class ReviewBarComponent {
  /** ข้อความเต็ม (อ่านออกเสียง/จอกว้าง) */
  readonly blocker = input('');
  /** ข้อความสั้น (มือถือ) */
  readonly short = input('');
  readonly remaining = input(0);
  readonly count = input(0);
  readonly canSave = input(false);
  readonly saving = input(false);
  readonly leaving = input(false);
  readonly next = output<void>();
  readonly save = output<void>();
  readonly discard = output<void>();
}
