import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, map } from 'rxjs';
import { errorCode, errorText } from '../../core/api/api-error';
import { PrescriptionResponse, PrescriptionStatus } from '../../core/api/medicine-parse.model';
import { SlotTimes } from '../../core/api/models';
import { ConfirmResult, PrescriptionApi } from '../../core/api/prescription.api';
import { SettingsApi } from '../../core/api/settings.api';
import { SLOT_LABEL, thaiJoin } from '../../core/i18n/labels';
import { HasUnsavedChanges } from '../../core/unsaved-changes.guard';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { FlowStepsComponent } from '../../shared/components/flow-steps/flow-steps.component';
import { MascotComponent, MascotMood } from '../../shared/components/mascot/mascot.component';
import { SpeechBubbleComponent } from '../../shared/components/speech-bubble/speech-bubble.component';
import { IconComponent } from '../../shared/icon.component';
import { ImageSheet, openImageZoom } from './image-viewer';
import { ReviewBarComponent } from './review-bar.component';
import { ReviewCardComponent } from './review-card.component';
import {
  ReviewCard, TodoItem, blankCard, draftFromParsed, newCard, reasonsFor, todoOf, toConfirmItems, domIdOf,
} from './review.model';

type View = 'loading' | 'error' | 'draft' | 'done' | 'confirmed' | 'discarded';

const DEFAULT_TIMES: SlotTimes = { morning: '08:00', noon: '12:00', evening: '18:00', bedtime: '21:00' };
const STEPS = ['ถ่ายรูป', 'ตรวจข้อมูล', 'บันทึก'];

/**
 * หน้าตรวจข้อมูลยาหลังสแกน (/review/:id) — AI เสนอ คนตรวจ แล้วค่อยบันทึก
 * ข้อมูลโหลดจาก GET /api/prescriptions/:id เสมอ (ได้ status / existing_matches / review_flags ชุดเดียวกันแม้ refresh)
 * ยาเข้าตารางได้ทางเดียวคือกด "บันทึก" → POST /confirm ด้วยค่าที่ผู้ใช้ตรวจแล้วในการ์ด (ไม่ใช่ค่าดิบของ AI)
 */
@Component({
  selector: 'app-review-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButton, IconComponent, MascotComponent, SpeechBubbleComponent, FlowStepsComponent, ReviewCardComponent, ReviewBarComponent],
  templateUrl: './review.page.html',
  styleUrl: './review.page.scss',
})
export class ReviewPage implements HasUnsavedChanges, OnDestroy {
  private readonly api = inject(PrescriptionApi);
  private readonly settings = inject(SettingsApi);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly sheet = inject(MatBottomSheet);
  private readonly snack = inject(MatSnackBar);

  /** :id จาก route (withComponentInputBinding) */
  readonly id = input.required<string>();

  protected readonly steps = STEPS;
  protected readonly view = signal<View>('loading');
  protected readonly loadError = signal('');
  protected readonly rx = signal<PrescriptionResponse | null>(null);
  protected readonly cards = signal<ReviewCard[]>([]);
  protected readonly times = signal<SlotTimes>(DEFAULT_TIMES);
  protected readonly imageUrl = signal<string | null>(null);
  protected readonly labelOk = signal(false);
  protected readonly saving = signal(false);
  protected readonly serverError = signal<{ text: string; uid: number | null } | null>(null);
  protected readonly result = signal<ConfirmResult | null>(null);
  protected readonly leaving = signal(false);
  /** จำนวนจุดที่ต้องตรวจ "ตอนเปิดหน้า" (ใช้ในกรอบคำพูดของน้อง ไม่เปลี่ยนตามการแก้ไข) */
  protected readonly initialTodo = signal(0);

  private uid = 0;
  private initialSnapshot = '';
  private saved = false;

  // ---------- ค่าที่คำนวณ ----------
  protected readonly notLabel = computed(() =>
    !!this.rx()?.review_flags.some((f) => f.index === -1) && !this.labelOk());
  protected readonly todos = computed(() =>
    this.cards().flatMap((c, i) => todoOf(c).map((t) => ({ ...t, uid: c.uid, name: c.draft.name.trim() || `ยาตัวที่ ${i + 1}` }))));
  protected readonly remaining = computed(() => this.todos().length + (this.notLabel() ? 1 : 0));
  protected readonly canSave = computed(() => this.cards().length > 0 && this.remaining() === 0 && !this.saving());
  /** เหตุผลที่ยังบันทึกไม่ได้ (แสดงใต้ปุ่มเสมอ) */
  protected readonly blocker = computed(() => {
    if (!this.cards().length) return 'ยังไม่มียาในรายการ — กด "เพิ่มยาที่น้องอ่านไม่เจอ" หรือสแกนซองใหม่';
    if (this.notLabel()) return 'ยืนยันก่อนว่ารูปนี้เป็นซองยา แล้วค่อยตรวจต่อ';
    const t = this.todos()[0];
    if (t) return `ยังเหลือ ${this.remaining()} จุดที่ต้องตรวจ · เริ่มที่ ${t.name}: ${t.text}`;
    return '';
  });
  protected readonly blockerShort = computed(() => {
    if (!this.cards().length) return 'ยังไม่มียาในรายการ';
    if (this.notLabel()) return 'ยืนยันก่อนว่าเป็นซองยา';
    return this.remaining() ? `ยังเหลือ ${this.remaining()} จุดที่ต้องตรวจ` : '';
  });
  protected readonly mood = computed<MascotMood>(() => {
    if (this.notLabel() || !this.rx()?.result.medications.length) return 'worried';
    return this.initialTodo() > 0 ? 'thinking' : 'happy';
  });
  protected readonly bubble = computed(() => {
    const r = this.rx();
    if (!r) return '';
    const n = r.result.medications.length;
    if (this.notLabel()) return 'รูปนี้อาจไม่ใช่ซองยา ช่วยดูอีกทีนะคะ';
    if (!n) return 'น้องอ่านรายการยาไม่เจอเลยค่ะ ลองสแกนใหม่ หรือเพิ่มยาเองก็ได้นะคะ';
    return this.initialTodo() > 0
      ? `น้องอ่านได้ ${n} รายการ มี ${this.initialTodo()} จุดที่อยากให้ช่วยตรวจค่ะ`
      : 'น้องอ่านได้ครบ ลองตรวจอีกนิดก่อนบันทึกนะคะ';
  });
  protected readonly alerts = computed(() => {
    const r = this.rx()?.result;
    return r ? [...r.unreadable_parts, ...(r.overall_note ? [r.overall_note] : [])] : [];
  });
  protected readonly doneLines = computed(() => {
    const r = this.result();
    if (!r) return [];
    return [
      ...r.created.map((c) => ({
        name: c.name, kind: 'ใหม่',
        note: c.skipped_slots_today.length
          ? `รอบ${thaiJoin(c.skipped_slots_today.map((s) => SLOT_LABEL[s]), true)}ของวันนี้ผ่านไปแล้ว จะเริ่มเตือนพรุ่งนี้` : '',
      })),
      ...r.refilled.map((c) => ({
        name: c.name, kind: 'เติมจำนวน', note: c.remaining_qty !== null ? `ตอนนี้เหลือ ${c.remaining_qty}` : '',
      })),
    ];
  });
  protected readonly doneCount = computed(() => (this.result()?.created.length ?? 0) + (this.result()?.refilled.length ?? 0));
  protected readonly stepNow = computed(() => (this.view() === 'done' || this.view() === 'confirmed' ? 2 : 1));
  protected readonly textSource = computed(() => (this.rx()?.input_type === 'text' ? this.rx()!.ocr_text : ''));

  constructor() {
    this.settings.slotTimes().subscribe({ next: (t) => this.times.set(t), error: () => { /* ใช้เวลาตั้งต้น */ } });
    queueMicrotask(() => this.load());
  }

  ngOnDestroy(): void { this.revoke(); }

  // ---------- โหลด ----------
  private load(): void {
    this.api.get(this.id()).subscribe({
      next: (r) => this.show(r),
      error: (e: unknown) => {
        this.loadError.set(e instanceof HttpErrorResponse && e.status === 404
          ? 'ไม่พบข้อมูล กรุณาสแกนใหม่' : 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่');
        this.view.set('error');
      },
    });
  }

  private show(r: PrescriptionResponse): void {
    this.rx.set(r);
    if (r.status !== 'draft') { this.view.set(r.status); return; }
    const cards = r.result.medications.map((m, i) => {
      const match = r.existing_matches.find((x) => x.index === i) ?? null;
      const draft = draftFromParsed(m);
      return newCard(++this.uid, i, {
        draft, sourceText: m.source_text, reasons: reasonsFor(r.review_flags, i), match,
        mode: match ? 'refill' : 'create', refillQty: match ? m.total_qty : null,
        moreOpen: !!(m.strength || m.indication || m.warnings.length || m.total_qty !== null),
      });
    });
    this.cards.set(cards);
    this.initialTodo.set(cards.filter((c) => c.mode === 'create').reduce((n, c) => n + todoOf(c).length, 0));
    this.initialSnapshot = this.snapshot();
    this.view.set('draft');
    if (r.has_image) this.loadImage();
  }

  private loadImage(): void {
    this.api.image(this.id()).subscribe({
      next: (blob) => { this.revoke(); this.imageUrl.set(URL.createObjectURL(blob)); },
      error: () => { /* รูปหาย = ไม่แสดงรูป (ยังตรวจจากข้อความได้) */ },
    });
  }

  private revoke(): void {
    const u = this.imageUrl();
    if (u) URL.revokeObjectURL(u);
    this.imageUrl.set(null);
  }

  // ---------- รูป ----------
  protected viewImage(): void {
    const url = this.imageUrl();
    if (url) openImageZoom(this.dialog, url);
  }

  protected openSheet(): void {
    const url = this.imageUrl();
    if (url) this.sheet.open(ImageSheet, { data: { url }, panelClass: 'yt-sheet' });
  }

  // ---------- การ์ด ----------
  protected updateCard(next: ReviewCard): void {
    this.cards.update((list) => list.map((c) => (c.uid === next.uid ? next : c)));
  }

  protected removeCard(uid: number): void {
    const list = this.cards();
    const at = list.findIndex((c) => c.uid === uid);
    if (at < 0) return;
    const removed = list[at];
    this.cards.set(list.filter((c) => c.uid !== uid));
    this.snack.open('ลบแล้ว', 'เลิกทำ', { duration: 8000, panelClass: 'yt-snack' }).onAction().subscribe(() => {
      this.cards.update((cur) => {
        const copy = [...cur];
        copy.splice(Math.min(at, copy.length), 0, removed);
        return copy;
      });
    });
  }

  protected addCard(): void {
    const c = blankCard(++this.uid);
    this.cards.update((l) => [...l, c]);
    setTimeout(() => this.focusId(`c${c.uid}-name`));
  }

  // ---------- ไปจุดถัดไป ----------
  protected goNext(): void {
    if (this.notLabel()) { this.focusId('not-label'); return; }
    const t: (TodoItem & { uid: number }) | undefined = this.todos()[0];
    if (t) this.focusId(domIdOf(t.uid, t.field));
  }

  private focusId(id: string): void {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    (el.matches('input,textarea,button,[tabindex]') ? el : el.querySelector<HTMLElement>('button,input,[tabindex]') ?? el).focus({ preventScroll: true });
  }

  // ---------- บันทึก / ทิ้ง ----------
  protected save(): void {
    if (!this.canSave()) { this.goNext(); return; }
    const cards = this.cards();
    this.serverError.set(null);
    this.saving.set(true);
    this.api.confirm(this.id(), toConfirmItems(cards)).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.saved = true;
        this.result.set(res);
        this.view.set('done');
        this.revoke();
        document.querySelector('.main')?.scrollTo?.({ top: 0 });
      },
      error: (e: unknown) => {
        this.saving.set(false);
        if (errorCode(e) === 'ALREADY_DONE') {          // กดซ้ำจากอีกแท็บ → ถือว่าสำเร็จแล้ว ไม่ใช่ error
          const st = (e as HttpErrorResponse).error?.status as PrescriptionStatus | undefined;
          this.saved = true;
          this.revoke();
          this.view.set(st === 'discarded' ? 'discarded' : 'confirmed');
          return;
        }
        const idx = e instanceof HttpErrorResponse ? (e.error?.item_index as number | undefined) : undefined;
        this.serverError.set({ text: errorText(e), uid: idx !== undefined ? (cards[idx]?.uid ?? null) : null });
        const uid = this.serverError()?.uid;
        if (uid) setTimeout(() => document.getElementById(`c${uid}-title`)?.scrollIntoView({ block: 'center' }));
      },
    });
  }

  protected askDiscard(): void {
    this.dialog.open<ConfirmDialogComponent, unknown, boolean>(ConfirmDialogComponent, {
      width: '28rem', maxWidth: '92vw', autoFocus: 'dialog',
      data: { title: 'ทิ้งผลสแกนนี้?', message: 'ข้อมูลที่น้องอ่านได้และรูปซองจะถูกลบ ยาจะไม่ถูกบันทึกเข้าตาราง', confirmLabel: 'ทิ้งผลสแกน', cancelLabel: 'กลับไปตรวจต่อ' },
    }).afterClosed().subscribe((ok) => { if (ok) this.discardAndScan(); });
  }

  /** ทิ้ง (ลบรูปที่เซิร์ฟเวอร์) แล้วไปสแกนใหม่ — ถ้าทิ้งไม่สำเร็จก็ยังไปต่อได้ (cron ลบรูปเก่าเกิน 7 วัน) */
  protected discardAndScan(): void {
    this.saved = true;      // ไม่ถามซ้ำตอนออกจากหน้า
    this.leaving.set(true);
    const go = () => this.router.navigate(['/scan']);
    this.api.discard(this.id()).subscribe({ next: go, error: go });
  }

  // ---------- ออกจากหน้า ----------
  private snapshot(): string {
    return JSON.stringify([this.cards().map((c) => [c.uid, c.draft, c.mode, c.refillQty, c.acked]), this.labelOk()]);
  }

  canLeave(): boolean | Observable<boolean> {
    if (this.saved || this.view() !== 'draft' || this.snapshot() === this.initialSnapshot) return true;
    return this.dialog.open<ConfirmDialogComponent, unknown, boolean>(ConfirmDialogComponent, {
      width: '28rem', maxWidth: '92vw', autoFocus: 'dialog',
      data: { title: 'ออกโดยไม่บันทึก?', message: 'ที่ตรวจและแก้ไขไว้จะหายไปนะคะ', confirmLabel: 'ออกจากหน้านี้', cancelLabel: 'กลับไปตรวจต่อ' },
    }).afterClosed().pipe(map((ok) => !!ok));
  }

  @HostListener('window:beforeunload', ['$event'])
  protected onUnload(e: BeforeUnloadEvent): void {
    if (!this.saved && this.view() === 'draft' && this.snapshot() !== this.initialSnapshot) e.preventDefault();
  }
}
