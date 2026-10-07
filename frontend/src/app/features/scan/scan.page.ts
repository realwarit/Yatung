import { Component, HostListener, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { Observable, Subscription, map } from 'rxjs';
// หน้านี้ใช้ Ionic (เกณฑ์คะแนน): ion-header/ion-toolbar/ion-title/ion-buttons/ion-button/ion-icon/ion-toast
// ส่วน ion-segment, ion-textarea, ion-chip, ion-spinner อยู่ใน components ย่อย (ui/)
import { IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonToast } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

import { ScanService } from './scan.service';
import { scanErrorMessage } from './scan-errors';
import { compressImage } from './image-compress';
import { assessImageQuality } from './image-quality';
import { ScanResponse } from '../../core/api/medicine-parse.model';
import { Mode, Phase } from './scan.types';
import { ScanStageComponent } from './ui/scan-stage.component';

const DESKTOP_QUERY = '(min-width: 1024px) and (pointer: fine)';
const MIN_TEXT = 5;
const STEP_AT_MS = { photo: [4000, 9000], text: [3000] } as const;   // เวลาโดยประมาณที่ขยับไปขั้น 2, 3 (ขั้น 3 ค้างจน API ตอบ)

@Component({
  selector: 'app-scan-page',
  standalone: true,
  imports: [
    RouterLink, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonToast,
    ScanStageComponent,
  ],
  templateUrl: './scan.page.html',
  styleUrl: './scan.page.scss',
})
export class ScanPage implements OnDestroy {
  private scan = inject(ScanService);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  readonly mode = signal<Mode>('photo');
  readonly phase = signal<Phase>('idle');
  readonly previewUrl = signal<string | null>(null);
  readonly imageInfo = signal<string>('');
  readonly warnings = signal<string[]>([]);
  readonly manualText = signal('');
  readonly step = signal(1);
  readonly dragging = signal(false);
  readonly desktop = signal(typeof matchMedia === 'function' && matchMedia(DESKTOP_QUERY).matches);
  /** ข้อความ error ของการอ่านซอง (แสดงในกรอบคำพูดของน้องยาตรง) */
  readonly errorMessage = signal<string | null>(null);
  /** error ระดับระบบ/การเลือกรูป (ion-toast) */
  readonly toastMessage = signal<string | null>(null);

  readonly busy = computed(() => this.phase() === 'compressing' || this.phase() === 'reading');
  readonly canSubmit = computed(() =>
    !this.busy() &&
    (this.mode() === 'photo' ? !!this.previewUrl() : this.manualText().trim().length >= MIN_TEXT)
  );

  private base64: string | null = null;
  private original: Blob | null = null;   // รูปต้นฉบับ (ใช้หมุนใหม่จากต้นฉบับทุกครั้ง)
  private rotation = 0;
  private rotating = false;
  private submitted = false;              // true ก่อน navigate เมื่อส่งสำเร็จ → canLeave ไม่ถาม
  private stepTimers: ReturnType<typeof setTimeout>[] = [];
  private request?: Subscription;
  private readonly mql = typeof matchMedia === 'function' ? matchMedia(DESKTOP_QUERY) : null;
  private readonly onMql = (e: MediaQueryListEvent) => this.desktop.set(e.matches);

  constructor() {
    addIcons({ arrowBackOutline });
    this.mql?.addEventListener('change', this.onMql);
  }

  onModeChange(value: Mode) {
    if (!this.busy()) this.mode.set(value);
  }

  // ---------- เลือก/รับรูป ----------

  /** ถ่ายรูป (กล้อง) หรือเลือกจากคลังภาพ — บนเว็บ Capacitor จะใช้ file input แทนให้อัตโนมัติ */
  async pick(source: 'camera' | 'gallery') {
    if (this.busy()) return;
    this.toastMessage.set(null);
    try {
      const photo = await Camera.getPhoto({
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        resultType: CameraResultType.DataUrl,
        quality: 90,
        correctOrientation: true,   // รูปแนวตั้งจากมือถือไม่กลับหัว
        allowEditing: false,
      });
      if (!photo.dataUrl) return;
      await this.ingest(photo.dataUrl);
    } catch (e: unknown) {
      this.phase.set('idle');
      const msg = e instanceof Error ? e.message : String(e);
      // ผู้ใช้กดยกเลิกเอง ไม่ต้องแสดง error
      if (/cancel/i.test(msg)) return;
      this.toastMessage.set('เปิดกล้องหรือรูปไม่ได้: ' + msg);
    }
  }

  /** จอคอม: เลือกไฟล์จากเครื่องด้วย <input type="file"> ตรงๆ (ไม่ผ่าน Camera.getPhoto) */
  upload() {
    if (this.busy()) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => { const f = input.files?.[0]; if (f) void this.acceptFile(f); };
    input.click();
  }

  /** รับไฟล์จาก file input / ลากวาง / วาง (paste) — รับเฉพาะรูป และไม่รับระหว่างกำลังประมวลผล */
  async acceptFile(file: File) {
    if (this.busy()) return;
    if (!file.type.startsWith('image/')) {
      this.toastMessage.set('รองรับเฉพาะไฟล์รูปภาพนะคะ (JPG, PNG)');
      return;
    }
    this.toastMessage.set(null);
    try {
      await this.ingest(file);
    } catch (e: unknown) {
      this.phase.set('idle');
      this.toastMessage.set('เปิดรูปไม่ได้: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  /** บีบรูป + ตรวจคุณภาพ แล้วแสดงพรีวิว (รูปเดิมถูกแทนที่เมื่อสำเร็จเท่านั้น) */
  private async ingest(src: string | Blob) {
    this.phase.set('compressing');
    this.step.set(0);
    const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
    const [out, warnings] = await Promise.all([compressImage(blob), assessImageQuality(blob)]);
    this.original = blob;
    this.rotation = 0;
    this.base64 = out.base64;
    this.setPreview(URL.createObjectURL(out.blob));
    this.imageInfo.set(`${out.width}×${out.height} · ${(out.bytes / 1024).toFixed(0)} KB`);
    this.warnings.set(warnings);
    this.errorMessage.set(null);
    this.phase.set('idle');
  }

  /** หมุนรูป 90° ตามเข็ม — หมุนจริงที่ canvas จากต้นฉบับ รูปที่ส่ง OCR จึงหมุนตามที่เห็น */
  async rotate() {
    if (this.busy() || this.rotating || !this.original) return;
    this.rotating = true;
    try {
      const next = (this.rotation + 90) % 360;
      const out = await compressImage(this.original, 1600, 0.85, next);
      this.rotation = next;
      this.base64 = out.base64;
      this.setPreview(URL.createObjectURL(out.blob));
      this.imageInfo.set(`${out.width}×${out.height} · ${(out.bytes / 1024).toFixed(0)} KB`);
    } catch {
      this.toastMessage.set('หมุนรูปไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      this.rotating = false;
    }
  }

  /** ปุ่ม "ถ่าย/เลือกใหม่" ในแถบเครื่องมือรูป: จอคอม = เลือกไฟล์ · มือถือ = กล้อง */
  replace() {
    if (this.desktop()) this.upload(); else void this.pick('camera');
  }

  clearImage() {
    if (this.busy()) return;
    this.base64 = null;
    this.original = null;
    this.rotation = 0;
    this.setPreview(null);
    this.imageInfo.set('');
    this.warnings.set([]);
  }

  /** เปลี่ยนรูปพรีวิว พร้อม revoke object URL เดิมเสมอ (กันหน่วยความจำรั่วบนมือถือ) */
  private setPreview(url: string | null) {
    const old = this.previewUrl();
    if (old) URL.revokeObjectURL(old);
    this.previewUrl.set(url);
  }

  // ---------- ลากวาง / วางรูป (ลบ listener เองตอน destroy โดย HostListener) ----------

  private static hasFiles(e: DragEvent): boolean {
    return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  }

  /** กันเบราว์เซอร์เปิดไฟล์ทับแอปเมื่อปล่อยนอกกรอบ (เฉพาะการลากไฟล์ — ลากข้อความเข้า textarea ยังทำงานปกติ) */
  @HostListener('window:dragover', ['$event'])
  onDragOver(e: DragEvent) {
    if (!ScanPage.hasFiles(e)) return;
    e.preventDefault();
    this.dragging.set(this.mode() === 'photo' && !this.busy());
  }

  @HostListener('window:dragleave', ['$event'])
  onDragLeave(e: DragEvent) {
    if (e.relatedTarget === null) this.dragging.set(false);   // ออกนอกหน้าต่าง
  }

  @HostListener('window:drop', ['$event'])
  onDrop(e: DragEvent) {
    if (!ScanPage.hasFiles(e)) return;
    e.preventDefault();
    this.dragging.set(false);
    if (this.busy()) return;                                  // ห้ามรับไฟล์ระหว่างประมวลผล
    if (this.mode() !== 'photo') {
      this.toastMessage.set('ลากรูปวางได้เฉพาะโหมดถ่ายรูปซองยานะคะ');
      return;
    }
    const file = e.dataTransfer?.files?.[0];
    if (file) void this.acceptFile(file);                     // ปล่อยไฟล์ใหม่ทับรูปเดิมได้
  }

  /** Ctrl+V: รับเฉพาะรูป ในโหมดถ่ายรูปและไม่ได้ประมวลผล — นอกนั้นปล่อยการวางข้อความตามปกติ (ไม่ preventDefault) */
  @HostListener('document:paste', ['$event'])
  onPaste(e: ClipboardEvent) {
    if (this.mode() !== 'photo' || this.busy()) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.closest('textarea, input, [contenteditable="true"]') || t.tagName === 'ION-TEXTAREA')) return;
    const file = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile();
    if (!file) return;
    e.preventDefault();
    void this.acceptFile(file);
  }

  // ---------- ส่งอ่าน ----------

  submit() {
    if (!this.canSubmit()) return;
    this.errorMessage.set(null);
    this.toastMessage.set(null);
    this.phase.set('reading');
    this.startSteps();

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
    this.stopSteps();
    this.phase.set('idle');
  }

  private onSuccess(res: ScanResponse) {
    this.stopSteps();
    this.phase.set('idle');
    this.submitted = true;   // ส่งสำเร็จแล้ว ออกจากหน้านี้โดยไม่ต้องถามยืนยัน
    // ส่ง draft ไปหน้า Review ผ่าน navigation state (ไม่ต้องยิง API ซ้ำ)
    // หน้า Review ควร fallback ไปโหลด GET /api/prescriptions/:id ถ้า state หาย (เช่น refresh)
    this.router.navigate(['/review', res.prescription_id], { state: { scan: res } })
      .then((ok) => { if (!ok) this.submitted = false; });
  }

  private onError(err: unknown) {
    this.stopSteps();

    let msg = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    let unreadable = false;   // true = ขึ้นกรอบคำพูดน้องยาตรง (worried) · false = ปัญหาระดับระบบ (ion-toast)
    if (err instanceof HttpErrorResponse) {
      const mapped = scanErrorMessage(err);
      if (mapped) {
        msg = mapped;
        unreadable = true;
      } else if (err.status === 0) msg = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ต';
      else if (err.status === 413) msg = 'รูปใหญ่เกินไป ลองถ่ายใหม่';
      else if (err.status === 404 || err.status >= 500) msg = 'ระบบอ่านซองยายังไม่พร้อมใช้งาน ลองใหม่ภายหลังนะคะ';
      else if (err.status === 401) msg = 'กรุณาเข้าสู่ระบบใหม่';
    } else if (err instanceof Error && err.name === 'TimeoutError') {
      msg = 'ใช้เวลานานเกินไป ลองใหม่อีกครั้ง';
    }

    if (unreadable) {
      this.errorMessage.set(msg);
      this.phase.set('error');
    } else {
      this.phase.set('idle');
      this.toastMessage.set(msg);
    }
  }

  /** ลองถ่ายใหม่ (จากหน้า error): ถ้าผู้ใช้ยกเลิกการเลือก รูปเดิมยังอยู่ */
  retry() {
    this.errorMessage.set(null);
    this.phase.set('idle');
    this.replace();
  }

  /** ไปพิมพ์เองเมื่ออ่านรูปไม่ได้ — รูปเดิมยังอยู่ กลับมาโหมดรูปได้ */
  switchToText() {
    this.mode.set('text');
    this.phase.set('idle');
    this.errorMessage.set(null);
  }

  dismissError() {
    this.phase.set('idle');
    this.errorMessage.set(null);
  }

  /** ขั้นตอนที่โชว์ระหว่างรอ: เปลี่ยนตามเวลาโดยประมาณ ขั้นสุดท้ายค้างจน API ตอบ (โหมดพิมพ์ข้ามขั้นอ่านตัวหนังสือ) */
  private startSteps() {
    this.stopSteps();
    const photo = this.mode() === 'photo';
    const times = photo ? STEP_AT_MS.photo : STEP_AT_MS.text;
    let s = photo ? 1 : 2;
    this.step.set(s);
    for (const ms of times) {
      this.stepTimers.push(setTimeout(() => this.step.set(++s), ms));
    }
  }

  private stopSteps() {
    this.stepTimers.forEach(clearTimeout);
    this.stepTimers = [];
  }

  // ---------- ออกจากหน้า ----------

  private get dirty() {
    return !this.submitted && (!!this.previewUrl() || this.manualText().trim().length > 0);
  }

  /** canDeactivate: ถามเมื่อมีรูป/ข้อความที่ยังไม่ส่ง · ไม่ถามเมื่อส่งสำเร็จหรือยังไม่มีอะไร */
  canLeave(): boolean | Observable<boolean> {
    if (!this.dirty) return true;
    return this.dialog.open<ConfirmDialogComponent, unknown, boolean>(ConfirmDialogComponent, {
      width: '28rem', maxWidth: '92vw', autoFocus: 'dialog',
      data: {
        title: 'ยังไม่ได้ส่งให้น้องอ่าน', message: 'ออกจากหน้านี้เลยไหม?',
        confirmLabel: 'ออกจากหน้านี้', cancelLabel: 'อยู่ต่อ',
      },
    }).afterClosed().pipe(map((ok) => !!ok));
  }

  // กันปิดแท็บ/รีเฟรชทั้งที่ยังมีรูปหรือข้อความที่ยังไม่ส่ง
  @HostListener('window:beforeunload', ['$event'])
  protected onUnload(e: BeforeUnloadEvent) {
    if (this.dirty) e.preventDefault();
  }

  ngOnDestroy() {
    this.request?.unsubscribe();
    this.stopSteps();
    this.mql?.removeEventListener('change', this.onMql);
    this.setPreview(null);
  }
}
