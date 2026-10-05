import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { ScanResponse, Slot } from '../../core/api/medicine-parse.model';
import { MEAL_LABEL, SLOT_LABEL, doseText, thaiJoin, unitInDose } from '../../core/i18n/labels';
import { IconComponent } from '../../shared/icon.component';

/**
 * TODO วันที่ 5: หน้า Review จริง (แก้ไขรายการยา, ยืนยัน → POST /api/prescriptions/:id/confirm)
 * หน้านี้ชั่วคราว ไว้ทดสอบผลสแกนของวันที่ 4: อ่านผลจาก navigation state เท่านั้น
 * (ยังไม่ fallback ไปโหลด GET /api/prescriptions/:id — refresh แล้วจะเห็น "ไม่พบข้อมูล")
 */
@Component({
  selector: 'app-review-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButton, IconComponent],
  templateUrl: './review.page.html',
  styleUrl: './review.page.scss',
})
export class ReviewPage {
  // getCurrentNavigation() ใช้ได้ตอนสร้าง component ระหว่างนำทาง; history.state เป็น fallback
  private readonly nav = inject(Router).getCurrentNavigation();
  protected readonly scan: ScanResponse | null =
    ((this.nav?.extras.state ?? history.state) as { scan?: ScanResponse } | null)?.scan ?? null;

  protected readonly slotsText = (slots: readonly Slot[]): string =>
    thaiJoin(slots.map((s) => SLOT_LABEL[s]));
  protected readonly meal = (m: keyof typeof MEAL_LABEL): string => MEAL_LABEL[m];
  protected readonly dose = (n: number | null, u: Parameters<typeof unitInDose>[0]): string =>
    n === null ? 'ไม่ระบุ' : `${doseText(n)} ${unitInDose(u)}`;
  protected readonly flagLabel = (index: number): string =>
    index < 0 ? 'ทั้งซอง' : (this.scan?.result.medications[index]?.name ?? `ยาลำดับที่ ${index + 1}`);
}
