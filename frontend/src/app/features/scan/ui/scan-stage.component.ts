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
import { ScanTipsComponent } from './scan-tips.component';

const MIN_TEXT = 5;

/**
 * การ์ดหลักของหน้า Scan — แสดงผลล้วน (รับ state ผ่าน input, ส่ง event ผ่าน output) ให้ /scan และ /dev/scan-states ใช้ร่วมกัน
 * ใช้ Ionic: ion-segment / ion-segment-button / ion-label / ion-button / ion-icon (ส่วนย่อยใช้ ion-textarea, ion-chip, ion-spinner)
 * หลักปุ่ม: แต่ละ state มีปุ่มหลัก (สีทึบ) ได้ปุ่มเดียว และไม่แสดงปุ่มหลักแบบ disabled
 */
@Component({
  selector: 'app-scan-stage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonSegment, IonSegmentButton, IonLabel, IonButton, IonIcon,
    ScanCaptureComponent, ScanCoachComponent, ScanProcessingComponent, ScanTextInputComponent, ScanTipsComponent,
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
  protected readonly action = computed<{ primary: string; secondary?: string; icon: string } | null>(() => {
    if (this.failed()) {
      return this.mode() === 'photo'
        ? { primary: 'ลองถ่ายใหม่', secondary: 'พิมพ์ข้อมูลยาเอง', icon: 'refresh-outline' }
        : { primary: 'ลองส่งอีกครั้ง', secondary: 'แก้ข้อความ', icon: 'refresh-outline' };
    }
    if (this.mode() === 'photo') return this.previewUrl() ? { primary: 'ให้น้องยาตรงอ่านซองยา', icon: 'sparkles-outline' } : null;
    return this.text().trim().length >= MIN_TEXT ? { primary: 'ให้น้องยาตรงจัดตารางยา', icon: 'sparkles-outline' } : null;
  });

  protected readonly showTips = computed(() => this.mode() === 'photo' && !this.previewUrl() && !this.failed());

  protected readonly coach = computed<{ mood: MascotMood; text: string }>(() => {
    if (this.failed()) return { mood: 'worried', text: this.errorMessage() ?? 'อ่านไม่สำเร็จ ลองใหม่อีกครั้งนะคะ' };
    if (this.mode() === 'text') return { mood: 'happy', text: 'พิมพ์ข้อความบนซองยาได้เลย น้องจะช่วยจัดตารางให้ค่ะ' };
    if (!this.previewUrl()) return { mood: 'happy', text: 'วางซองยาให้อยู่ในกรอบนะคะ' };
    if (this.warnings().length) return { mood: 'worried', text: 'รูปนี้อาจอ่านยากนิดหน่อย ถ่ายใหม่จะแม่นกว่า แต่ส่งให้น้องอ่านเลยก็ได้ค่ะ' };
    return { mood: 'happy', text: 'รูปพร้อมแล้ว! ให้น้องอ่านได้เลยค่ะ' };
  });

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
