import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonButton, IonIcon, IonLabel, IonSegment, IonSegmentButton } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cameraOutline, createOutline, refreshOutline, sparklesOutline } from 'ionicons/icons';
import { MascotMood } from '../../../shared/components/mascot/mascot.component';
import { Mode, Phase } from '../scan.types';
import { ScanCaptureComponent } from './scan-capture.component';
import { ScanCoachComponent } from './scan-coach.component';
import { ScanProcessingComponent } from './scan-processing.component';
import { ScanTextInputComponent } from './scan-text-input.component';
import { ScanPerchComponent } from './scan-perch.component';

const MIN_TEXT = 5;

/**
 * การ์ดหลักของหน้า Scan — แสดงผลล้วน (รับ state ผ่าน input, ส่ง event ผ่าน output) ให้ /scan และ /dev/scan-states ใช้ร่วมกัน
 * ใช้ Ionic: ion-segment / ion-segment-button / ion-label / ion-button / ion-icon (ส่วนย่อยใช้ ion-textarea, ion-chip, ion-spinner)
 * D2.5 G: การ์ดขาวใบเดียว + น้องยาตรงเกาะขอบบน (scan-perch) · ช่องมองกล้องทั้งกรอบแตะได้ · คำแนะนำย่อใต้กรอบ
 * หลักปุ่ม: แต่ละ state มีปุ่มหลัก (สีทึบ) ได้ปุ่มเดียว และไม่แสดงปุ่มหลักแบบ disabled
 */
@Component({
  selector: 'app-scan-stage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonSegment, IonSegmentButton, IonLabel, IonButton, IonIcon,
    ScanCaptureComponent, ScanCoachComponent, ScanPerchComponent, ScanProcessingComponent, ScanTextInputComponent,
  ],
  templateUrl: './scan-stage.component.html',
  styleUrl: './scan-stage.component.scss',
})
export class ScanStageComponent {
  readonly mode = input<Mode>('photo');
  readonly phase = input<Phase>('idle');
  readonly desktop = input(false);
  readonly dragging = input(false);
  readonly previewUrl = input<string | null>(null);
  readonly imageInfo = input('');
  readonly warnings = input<string[]>([]);
  readonly text = input('');
  readonly errorMessage = input<string | null>(null);
  /** ขั้นที่กำลังทำ (0 = เตรียมรูป, 1–3) */
  readonly step = input(1);
  /** ปุ่มหลักบนมือถือติดล่างจอ (หน้า /dev/scan-states ปิดไว้ เพราะมีหลายการ์ดในหน้าเดียว) */
  readonly stickyAction = input(true);

  readonly modeChange = output<Mode>();
  readonly textChange = output<string>();
  readonly upload = output<void>();
  readonly camera = output<void>();
  readonly gallery = output<void>();
  readonly rotate = output<void>();
  readonly clear = output<void>();
  readonly submit = output<void>();
  readonly cancel = output<void>();
  readonly retry = output<void>();
  readonly switchToText = output<void>();
  readonly dismissError = output<void>();

  protected readonly busy = computed(() => this.phase() === 'compressing' || this.phase() === 'reading');
  protected readonly failed = computed(() => this.phase() === 'error');

  /** ปุ่มหลัก/รอง ของ state ปัจจุบัน (null = ไม่มีปุ่มในแถบ action) */
  protected readonly action = computed<{ primary: string; short?: string; secondary?: string; icon: string } | null>(() => {
    if (this.failed()) {
      return this.mode() === 'photo'
        ? { primary: 'ลองถ่ายใหม่', secondary: 'พิมพ์ข้อมูลยาเอง', icon: 'refresh-outline' }
        : { primary: 'ลองส่งอีกครั้ง', secondary: 'แก้ข้อความ', icon: 'refresh-outline' };
    }
    if (this.mode() === 'photo') return this.previewUrl() ? { primary: 'ให้น้องยาตรงอ่านซองยา', icon: 'sparkles-outline' } : null;
    return this.text().trim().length >= MIN_TEXT ? { primary: 'ให้น้องยาตรงจัดตารางยา', short: 'จัดตารางยา', icon: 'sparkles-outline' } : null;
  });

  /** ข้อความของน้องยาตรงตอนอ่านไม่สำเร็จ (สถานะอื่นไม่มีกล่องคำพูด — คำแนะนำอยู่ในกรอบถ่ายรูปแล้ว) */
  protected readonly coachText = computed(() => (this.failed() ? (this.errorMessage() ?? 'อ่านไม่สำเร็จ ลองใหม่อีกครั้งนะคะ') : null));

  /** น้องยาตรงที่เกาะขอบการ์ด : อ่านอยู่ = thinking · อ่านไม่สำเร็จ = worried · ปกติ = happy */
  protected readonly perchMood = computed<MascotMood>(() => (this.busy() ? 'thinking' : this.failed() ? 'worried' : 'happy'));
  protected readonly perchText = computed(() =>
    this.busy() ? (this.step() === 0 ? 'กำลังเตรียมรูป…' : 'กำลังอ่านซองยาอยู่นะคะ…') : 'น้องช่วยอ่านซองให้ แต่อาจอ่านผิด ตรวจก่อนบันทึกนะคะ');
  protected readonly perchShort = computed(() => (this.busy() ? 'กำลังอ่านซองอยู่นะคะ…' : 'ตรวจก่อนบันทึกนะคะ'));

  constructor() {
    addIcons({ cameraOutline, createOutline, refreshOutline, sparklesOutline });
  }

  protected onMode(value: unknown): void {
    if ((value === 'photo' || value === 'text') && value !== this.mode()) this.modeChange.emit(value);
  }

  protected onPrimary(): void {
    if (!this.failed()) this.submit.emit();
    else if (this.mode() === 'photo') this.retry.emit();
    else this.submit.emit();
  }

  protected onSecondary(): void {
    if (this.mode() === 'photo') this.switchToText.emit(); else this.dismissError.emit();
  }
}
