import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonIcon,
  IonSegment, IonSegmentButton, IonLabel, IonCard, IonCardContent, IonTextarea,
  IonSpinner, IonToast, IonNote, IonFooter,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, cameraOutline, imagesOutline, createOutline,
  refreshOutline, sparklesOutline, bulbOutline, closeCircleOutline,
} from 'ionicons/icons';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

import { ScanService } from './scan.service';
import { compressImage } from './image-compress';
import { ScanResponse } from '../../core/api/medicine-parse.model';

type Mode = 'photo' | 'text';
type Phase = 'idle' | 'compressing' | 'reading' | 'error';

// ข้อความระหว่างรอ OCR + LLM (หมุนทุก 3 วินาที) ให้ผู้สูงอายุรู้ว่าระบบยังทำงานอยู่
const WAIT_MESSAGES = [
  'กำลังอ่านตัวหนังสือบนซองยา…',
  'กำลังแยกชื่อยาและมื้อที่ต้องกิน…',
  'กำลังตรวจสอบความถูกต้อง…',
  'ใกล้เสร็จแล้ว รอสักครู่นะคะ…',
];

@Component({
  selector: 'app-scan-page',
  standalone: true,
  imports: [
    FormsModule, RouterLink,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonIcon,
    IonSegment, IonSegmentButton, IonLabel, IonCard, IonCardContent, IonTextarea,
    IonSpinner, IonToast, IonNote, IonFooter,
  ],
  templateUrl: './scan.page.html',
  styleUrl: './scan.page.scss',
  // ion-page ทำให้ ion-header/ion-content จัด layout เต็มจอได้ถูกต้อง
  // แม้ route นี้จะอยู่ใน <router-outlet> ปกติของ Angular (ไม่ใช่ ion-router-outlet)
  host: { class: 'ion-page' },
})
export class ScanPage implements OnDestroy {
  private scan = inject(ScanService);
  private router = inject(Router);

  readonly mode = signal<Mode>('photo');
  readonly phase = signal<Phase>('idle');
  readonly previewUrl = signal<string | null>(null);
  readonly imageInfo = signal<string>('');
  readonly manualText = signal('');
  readonly waitMessage = signal(WAIT_MESSAGES[0]);
  readonly errorMessage = signal<string | null>(null);

  readonly busy = computed(() => this.phase() === 'compressing' || this.phase() === 'reading');
  readonly canSubmit = computed(() =>
    !this.busy() &&
    (this.mode() === 'photo' ? !!this.previewUrl() : this.manualText().trim().length >= 5)
  );

  private base64: string | null = null;
  private waitTimer?: ReturnType<typeof setInterval>;
  private request?: Subscription;

  constructor() {
    addIcons({
      arrowBackOutline, cameraOutline, imagesOutline, createOutline,
      refreshOutline, sparklesOutline, bulbOutline, closeCircleOutline,
    });
  }

  onModeChange(value: unknown) {
    if (value === 'photo' || value === 'text') this.mode.set(value);
  }

  /** ถ่ายรูป (กล้อง) หรือเลือกจากคลังภาพ — บนเว็บ Capacitor จะใช้ file input แทนให้อัตโนมัติ */
  async pick(source: 'camera' | 'gallery') {
    this.errorMessage.set(null);
    try {
      const photo = await Camera.getPhoto({
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        resultType: CameraResultType.DataUrl,
        quality: 90,
        correctOrientation: true,   // รูปแนวตั้งจากมือถือไม่กลับหัว
        allowEditing: false,
      });
      if (!photo.dataUrl) return;

      this.phase.set('compressing');
      const out = await compressImage(photo.dataUrl);
      this.base64 = out.base64;
      this.previewUrl.set('data:image/jpeg;base64,' + out.base64);
      this.imageInfo.set(`${out.width}×${out.height} · ${(out.bytes / 1024).toFixed(0)} KB`);
      this.phase.set('idle');
    } catch (e: unknown) {
      this.phase.set('idle');
      const msg = e instanceof Error ? e.message : String(e);
      // ผู้ใช้กดยกเลิกเอง ไม่ต้องแสดง error
      if (/cancel/i.test(msg)) return;
      this.errorMessage.set('เปิดกล้องหรือรูปไม่ได้: ' + msg);
    }
  }

  clearImage() {
    this.base64 = null;
    this.previewUrl.set(null);
    this.imageInfo.set('');
  }

  submit() {
    if (!this.canSubmit()) return;
    this.errorMessage.set(null);
    this.phase.set('reading');
    this.startWaitMessages();

    const call$ = this.mode() === 'photo' && this.base64
      ? this.scan.scanImage(this.base64)
      : this.scan.scanText(this.manualText());

    this.request = call$.subscribe({
      next: (res) => this.onSuccess(res),
      error: (err) => this.onError(err),
    });
  }

  cancel() {
    this.request?.unsubscribe();
    this.stopWaitMessages();
    this.phase.set('idle');
  }

  private onSuccess(res: ScanResponse) {
    this.stopWaitMessages();
    this.phase.set('idle');
    // ส่ง draft ไปหน้า Review ผ่าน navigation state (ไม่ต้องยิง API ซ้ำ)
    // หน้า Review ควร fallback ไปโหลด GET /api/prescriptions/:id ถ้า state หาย (เช่น refresh)
    this.router.navigate(['/review', res.prescription_id], { state: { scan: res } });
  }

  private onError(err: unknown) {
    this.stopWaitMessages();
    this.phase.set('error');

    let msg = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) msg = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ต';
      else if (err.status === 413) msg = 'รูปใหญ่เกินไป ลองถ่ายใหม่';
      else if (err.status === 422) msg = err.error?.details && typeof err.error.details === 'string'
        ? err.error.details
        : 'AI อ่านซองยานี้ไม่ได้ ลองถ่ายให้ชัดขึ้น หรือพิมพ์เอง';
      else if (err.status === 401) msg = 'กรุณาเข้าสู่ระบบใหม่';
    } else if (err instanceof Error && err.name === 'TimeoutError') {
      msg = 'ใช้เวลานานเกินไป ลองใหม่อีกครั้ง';
    }
    this.errorMessage.set(msg);
  }

  /** ไปพิมพ์เองเมื่ออ่านรูปไม่ได้ */
  switchToText() {
    this.mode.set('text');
    this.phase.set('idle');
    this.errorMessage.set(null);
  }

  private startWaitMessages() {
    let i = 0;
    this.waitMessage.set(WAIT_MESSAGES[0]);
    this.waitTimer = setInterval(() => {
      i = Math.min(i + 1, WAIT_MESSAGES.length - 1);
      this.waitMessage.set(WAIT_MESSAGES[i]);
    }, 3000);
  }

  private stopWaitMessages() {
    if (this.waitTimer) clearInterval(this.waitTimer);
    this.waitTimer = undefined;
  }

  ngOnDestroy() {
    this.request?.unsubscribe();
    this.stopWaitMessages();
  }
}
