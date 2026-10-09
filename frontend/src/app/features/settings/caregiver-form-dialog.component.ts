import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { errorText } from '../../core/api/api-error';
import { Caregiver, LineApi } from '../../core/api/line.api';
import { StepperComponent } from '../../shared/components/stepper/stepper.component';
import { IconComponent } from '../../shared/icon.component';

/** เพิ่ม/แก้ไขผู้ดูแล (data = ผู้ดูแลเดิม หรือ null = เพิ่มใหม่) ; ปิดด้วย Caregiver ที่บันทึกแล้ว */
@Component({
  selector: 'app-caregiver-form-dialog',
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatButton, StepperComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data ? 'แก้ไขผู้ดูแล' : 'เพิ่มผู้ดูแล' }}</h2>
    <mat-dialog-content>
      <div class="yt-field">
        <label class="yt-label" for="cg-name">ชื่อ</label>
        <div class="yt-control" [class.is-invalid]="!!nameError()">
          <input id="cg-name" type="text" maxlength="100" autocomplete="off" placeholder="เช่น คุณสมหญิง"
                 [value]="name()" (input)="name.set($any($event.target).value)" [attr.aria-invalid]="!!nameError()" [attr.aria-describedby]="nameError() ? 'cg-name-e' : null" />
        </div>
        @if (nameError(); as ne) { <p class="yt-error-text" id="cg-name-e" role="alert"><app-icon name="alert" /> {{ ne }}</p> }
      </div>
      <div class="yt-field">
        <label class="yt-label" for="cg-rel">ความสัมพันธ์ (ไม่ต้องกรอกก็ได้)</label>
        <div class="yt-control">
          <input id="cg-rel" type="text" maxlength="50" autocomplete="off" placeholder="เช่น ลูกสาว"
                 [value]="relation()" (input)="relation.set($any($event.target).value)" />
        </div>
      </div>
      <div class="yt-field">
        <span class="yt-label" id="cg-min-l">แจ้งผู้ดูแลเมื่อไม่กดกินยานานเกิน</span>
        <app-stepper [(value)]="minutes" [min]="10" [max]="720" [step]="10" [display]="minutes() + ' นาที'" label="นาทีก่อนแจ้งผู้ดูแล" />
        <p class="yt-hint">ตั้งได้ 10–720 นาที</p>
      </div>
      @if (error(); as e) { <p class="yt-error-text" role="alert"><app-icon name="alert" /> {{ e }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-stroked-button type="button" (click)="ref.close()" [disabled]="saving()">ยกเลิก</button>
      <button mat-flat-button type="button" (click)="save()" [disabled]="saving()">{{ saving() ? 'กำลังบันทึก…' : 'บันทึก' }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-actions { flex-wrap: wrap; gap: var(--yt-space-2); padding: var(--yt-space-3) var(--yt-space-5) var(--yt-space-5); }
  `,
})
export class CaregiverFormDialogComponent {
  protected readonly data = inject<Caregiver | null>(MAT_DIALOG_DATA);
  protected readonly ref = inject<MatDialogRef<CaregiverFormDialogComponent, Caregiver>>(MatDialogRef);
  private api = inject(LineApi);

  protected readonly name = signal(this.data?.name ?? '');
  protected readonly relation = signal(this.data?.relation ?? '');
  protected readonly minutes = signal(this.data?.escalate_after_min ?? 60);
  protected readonly nameError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected save(): void {
    const name = this.name().trim();
    this.nameError.set(name ? null : 'กรุณาใส่ชื่อผู้ดูแล');
    if (!name) return;
    this.saving.set(true);
    this.error.set(null);
    const body = { name, relation: this.relation().trim() || null, escalate_after_min: this.minutes() };
    (this.data ? this.api.updateCaregiver(this.data.id, body) : this.api.addCaregiver(body)).subscribe({
      next: (c) => this.ref.close(c),
      error: (e) => { this.saving.set(false); this.error.set(errorText(e)); },
    });
  }
}
