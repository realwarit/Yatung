import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  cameraOutline, cameraReverseOutline, cloudUploadOutline, imagesOutline, reloadOutline, trashOutline,
} from 'ionicons/icons';
import { IconComponent } from '../../../shared/icon.component';

/**
 * โหมดถ่ายรูป: กรอบเล็ง (ยังไม่มีรูป) หรือรูปพร้อมแถบเครื่องมือ (มีรูปแล้ว)
 * ใช้ Ionic: ion-button, ion-icon (ตามเกณฑ์ใช้ Ionic) — ส่วนที่เหลือเป็น markup ธรรมดาที่ใช้ design token
 */
@Component({
  selector: 'app-scan-capture',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonButton, IonIcon, IconComponent],
  templateUrl: './scan-capture.component.html',
  styleUrl: './scan-capture.component.scss',
})
export class ScanCaptureComponent {
  readonly previewUrl = input<string | null>(null);
  readonly info = input('');
  readonly warnings = input<string[]>([]);
  readonly desktop = input(false);
  readonly dragging = input(false);
  /** false = ซ่อนแถบเครื่องมือ/ปุ่มเลือกรูป (ตอน error) */
  readonly interactive = input(true);

  readonly upload = output<void>();
  readonly camera = output<void>();
  readonly gallery = output<void>();
  readonly rotate = output<void>();
  readonly clear = output<void>();

  constructor() {
    addIcons({ cameraOutline, cameraReverseOutline, cloudUploadOutline, imagesOutline, reloadOutline, trashOutline });
  }

  /** แตะกรอบ: จอคอม = เลือกไฟล์, มือถือ = เปิดกล้อง */
  protected onFrame(): void {
    if (this.desktop()) this.upload.emit(); else this.camera.emit();
  }
}
