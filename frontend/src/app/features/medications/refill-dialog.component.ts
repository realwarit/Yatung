import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { errorText } from '../../core/api/api-error';
import { MedicationApi } from '../../core/api/medication.api';
import { Medication } from '../../core/api/models';
import { UnitLabelPipe } from '../../core/i18n/labels.pipe';
import { StepperComponent } from '../../shared/components/stepper/stepper.component';
import { IconComponent } from '../../shared/icon.component';

/** เติมยา: เลือกจำนวนด้วยปุ่ม − / + ใหญ่ๆ แล้วบันทึกเลย; ปิดด้วยยาที่อัปเดตแล้ว (หรือ undefined = ยกเลิก) */
@Component({
  selector: 'app-refill-dialog',
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatButton, StepperComponent, IconComponent, UnitLabelPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>เติมยา {{ med.name }}</h2>
    <mat-dialog-content>
      <p class="now">ตอนนี้เหลือ {{ med.remaining_qty ?? 0 }} {{ med.unit | unitLabel }}</p>
      <p class="ask" id="refill-q">เติมเพิ่มกี่{{ med.unit | unitLabel }}?</p>
      <app-stepper [(value)]="qty" [min]="1" [max]="9999" [step]="5" [label]="'จำนวนที่เติม'" />
      @if (error()) {
        <p class="yt-error-text" role="alert"><app-icon name="alert" /> {{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-stroked-button type="button" (click)="ref.close()" [disabled]="saving()">ยกเลิก</button>
      <button mat-flat-button type="button" (click)="save()" [disabled]="saving()">
        {{ saving() ? 'กำลังบันทึก…' : 'เติมยา ' + qty() + ' ' + (med.unit | unitLabel) }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    p { margin: 0 0 var(--yt-space-3); }
    .now { color: var(--yt-text-muted); }
    .ask { font-weight: 600; }
    mat-dialog-actions { flex-wrap: wrap; gap: var(--yt-space-2); padding: var(--yt-space-3) var(--yt-space-5) var(--yt-space-5); }
  `,
})
export class RefillDialogComponent {
  protected readonly med = inject<Medication>(MAT_DIALOG_DATA);
  protected readonly ref = inject<MatDialogRef<RefillDialogComponent, Medication>>(MatDialogRef);
  private api = inject(MedicationApi);

  protected readonly qty = signal(30);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected save(): void {
    this.saving.set(true);
    this.error.set(null);
    this.api.refill(this.med.id, this.qty()).subscribe({
      next: (m) => this.ref.close(m),
      error: (e) => { this.saving.set(false); this.error.set(errorText(e)); },
    });
  }
}
