import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { ScanResponse, Slot } from '../../core/api/medicine-parse.model';
import { MEAL_LABEL, SLOT_LABEL, doseText, thaiJoin, unitInDose } from '../../core/i18n/labels';
import { IconComponent } from '../../shared/icon.component';
import { ScanService } from '../scan/scan.service';

/**
 * TODO วันที่ 5: หน้า Review จริง (แก้ไขรายการยา, ยืนยัน → POST /api/prescriptions/:id/confirm)
 * หน้านี้ชั่วคราว ไว้ทดสอบผลสแกนของวันที่ 4: อ่านผลจาก navigation state ก่อน
 * ถ้า state หาย (เช่น เปิด URL ตรงๆ) โหลดจาก GET /api/prescriptions/:id (404 = "ไม่พบข้อมูล")
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
  private readonly scanApi = inject(ScanService);
  private readonly route = inject(ActivatedRoute);

  protected readonly scan = signal<ScanResponse | null>(
    ((this.nav?.extras.state ?? history.state) as { scan?: ScanResponse } | null)?.scan ?? null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (this.scan() || !id) return;
    this.loading.set(true);
    this.scanApi.getPrescription(id).subscribe({
      next: (res) => { this.scan.set(res); this.loading.set(false); },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set(err instanceof HttpErrorResponse && err.status === 404
          ? 'ไม่พบข้อมูล กรุณาสแกนใหม่'
          : 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่');
      },
    });
  }

  protected readonly slotsText = (slots: readonly Slot[]): string =>
    thaiJoin(slots.map((s) => SLOT_LABEL[s]));
  protected readonly meal = (m: keyof typeof MEAL_LABEL): string => MEAL_LABEL[m];
  protected readonly dose = (n: number | null, u: Parameters<typeof unitInDose>[0]): string =>
    n === null ? 'ไม่ระบุ' : `${doseText(n)} ${unitInDose(u)}`;
  protected readonly flagLabel = (index: number): string =>
    index < 0 ? 'ทั้งซอง' : (this.scan()?.result.medications[index]?.name ?? `ยาลำดับที่ ${index + 1}`);
}
