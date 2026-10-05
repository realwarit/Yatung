import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonButton, IonSpinner } from '@ionic/angular';
import { IconComponent } from '../../../shared/icon.component';
import { MascotComponent } from '../../../shared/components/mascot/mascot.component';
import { Mode, READING_STEPS } from '../scan.types';

/**
 * กำลังประมวลผล (10–20 วินาที) — ใช้พื้นที่การ์ดทั้งหมด
 * ใช้ Ionic: ion-spinner (ขั้นปัจจุบัน), ion-button (ยกเลิก)
 * step: 0 = กำลังเตรียมรูป · 1–3 = ขั้นที่กำลังทำ (ก่อนหน้า = ✓, ขั้น 3 ค้างจน API ตอบ)
 */
@Component({
  selector: 'app-scan-processing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonSpinner, IonButton, IconComponent, MascotComponent],
  templateUrl: './scan-processing.component.html',
  styleUrl: './scan-processing.component.scss',
})
export class ScanProcessingComponent {
  readonly mode = input<Mode>('photo');
  readonly previewUrl = input<string | null>(null);
  readonly text = input('');
  readonly step = input(1);

  readonly cancel = output<void>();

  protected readonly labels = READING_STEPS;
  protected readonly preparing = computed(() => this.step() === 0);
  /** ข้อความสำหรับ screen reader (aria-live) */
  protected readonly announce = computed(() =>
    this.preparing() ? 'กำลังเตรียมรูป' : `กำลัง${this.labels[Math.min(this.step(), 3) - 1]}`);

  protected state(i: number): 'done' | 'active' | 'todo' {
    const s = this.step();
    return i + 1 < s ? 'done' : i + 1 === s ? 'active' : 'todo';
  }
}
