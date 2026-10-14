import { ErrTextComponent } from '../../shared/components/err-text/err-text.component';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { filter, forkJoin, fromEvent, merge } from 'rxjs';
import { DoseApi } from '../../core/api/dose.api';
import { MedicationApi } from '../../core/api/medication.api';
import { PushTakeService } from '../../core/push/push-take.service';
import { OnlineService } from '../../core/offline/online.service';
import { NEEDS_ONLINE_TEXT } from '../../core/offline/offline-text';
import { SnapshotService } from '../../core/offline/snapshot.service';
import { pickToday } from '../../core/offline/snapshot';
import { errorCode, errorText } from '../../core/api/api-error';
import { Dose, DoseActionResult, Medication, Slot, TodayResponse } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { startClock } from '../../core/clock';
import { DoseQtyPipe, MealLabelPipe } from '../../core/i18n/labels.pipe';
import { thaiDateShort, toServerTime } from '../../core/time';
import { ConfettiComponent } from '../../shared/components/confetti/confetti.component';
import { MascotComponent, MascotMood } from '../../shared/components/mascot/mascot.component';
import { IconComponent } from '../../shared/icon.component';
import { SectionComponent } from '../../shared/ui/section/section.component';
import { ListRowComponent } from '../../shared/ui/list-row/list-row.component';
import { SlotFlags, DoseVM, SlotVM, bubbleOf, buildSlots, progressOf } from './today-model';
import { SpeakableSlot, slotSpeech, todaySpeech } from '../../core/tts/speech-text';
import { SlotGroupComponent } from './slot-group.component';
import { TodayProgressComponent } from './today-progress.component';
import { lowStockText } from './low-stock';

@Component({
  selector: 'app-today-page',
  imports: [ErrTextComponent, RouterLink, MatButton, IconComponent, MascotComponent, ConfettiComponent, SectionComponent, ListRowComponent,
    SlotGroupComponent, TodayProgressComponent, DoseQtyPipe, MealLabelPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './today.page.html',
  styleUrl: './today.page.scss',
})
export class TodayPage {
  private doseApi = inject(DoseApi);
  private medApi = inject(MedicationApi);
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);
  private pushTake = inject(PushTakeService);
  private online = inject(OnlineService);
  private snapshots = inject(SnapshotService);
  /** ออฟไลน์ → ปุ่มที่ต้องใช้เน็ตกดไม่ได้ (ดู slot-group) */
  protected readonly offline = this.online.offline;
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private destroyRef = inject(DestroyRef);

  protected readonly data = signal<TodayResponse | null>(null);
  protected readonly asNeeded = signal<Medication[]>([]);
  protected readonly activeMeds = signal(0);
  /** ยาที่ใกล้หมด (medication_id → ข้อความสั้น) ใช้แสดงป้ายเหลืองบนแถวยา */
  protected readonly lowText = signal<ReadonlyMap<number, string>>(new Map());
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  /** นาฬิกาของหน้า : เดินตามเวลาจริงของเครื่องทุก 30 วินาที (ชิดขอบ :00/:30) ทั้งตอนออนไลน์และออฟไลน์ — ห้ามใช้เวลาตอนโหลดข้อมูลหรือเวลาของ snapshot */
  protected readonly now = signal(Date.now());
  protected readonly confetti = signal(false);
  protected readonly popId = signal<number | null>(null);
  protected readonly takingAll = signal(false);

  private readonly busy = signal<ReadonlySet<number>>(new Set());
  protected readonly busyIds = this.busy;
  private readonly expired = signal<ReadonlySet<number>>(new Set());     // undo เลยเวลาแล้ว (ซ่อนปุ่ม)
  private readonly touched = signal<ReadonlySet<Slot>>(new Set());       // มื้อที่ผู้ใช้เพิ่งกด ไม่ยุบทันที
  private readonly opened = signal<ReadonlySet<Slot>>(new Set());        // มื้อที่ผู้ใช้กางเอง
  private scrolled = false;
  private offlineHinted = false;

  protected readonly dateShort = computed(() => thaiDateShort(this.now()));
  protected readonly greet = computed(() => {
    const n = this.auth.currentUser()?.display_name?.trim() ?? '';
    return !n ? 'สวัสดี' : `สวัสดี ${n.startsWith('คุณ') ? n : `คุณ${n}`}`;   // ชื่อที่ขึ้นต้นด้วย "คุณ" อยู่แล้วไม่ต้องเติมซ้ำ
  });

  protected readonly slots = computed<SlotVM[]>(() => buildSlots(this.data(), this.now(), {
    touched: this.touched(), opened: this.opened(), undoExpired: this.expired(),
  } satisfies SlotFlags));
  protected readonly firstOpen = computed(() => this.slots().find((s) => s.mode === 'open')?.slot ?? null);

  /** ข้อมูลสำหรับอ่านออกเสียง (ใช้สถานะจากเซิร์ฟเวอร์ ไม่ใช่สถานะที่คำนวณฝั่ง client) */
  private readonly speakable = computed<SpeakableSlot[]>(() => (this.data()?.slots ?? []).map((s) => ({ slot: s.slot, time: s.time, doses: s.doses })));
  protected readonly speakAll = (): string[] => todaySpeech(this.speakable());
  private readonly slotBuilders = new Map<Slot, () => string[]>();
  /** ฟังก์ชันสร้างข้อความของมื้อ (อ้างอิงคงที่ต่อมื้อ ไม่สร้างใหม่ทุกรอบ change detection) */
  protected speakSlot(slot: Slot): () => string[] {
    let fn = this.slotBuilders.get(slot);
    if (!fn) {
      fn = () => { const s = this.speakable().find((x) => x.slot === slot); return s ? slotSpeech(s) : []; };
      this.slotBuilders.set(slot, fn);
    }
    return fn;
  }

  protected readonly progress = computed(() => progressOf(this.slots()));
  /** กล่องคำพูดของน้องยาตรง (เรื่องเดียวที่สำคัญที่สุดตอนนี้ ตามนาฬิกาของหน้า) */
  protected readonly bubble = computed(() => bubbleOf(this.slots(), this.now()));
  protected readonly total = computed(() => this.progress().total);
  protected readonly taken = computed(() => this.progress().taken);
  protected readonly allDone = computed(() => this.progress().allDone);
  /** รอบที่ถึงเวลา/เลยเวลาแล้วแต่ยังไม่ได้กิน */
  protected readonly notTaken = computed(() => this.progress().notTaken);

  protected readonly mood = computed<MascotMood>(() => (this.allDone() ? 'celebrate' : this.notTaken() > 0 ? 'reminder' : 'happy'));

  protected readonly noMeds = computed(() => !this.loading() && !this.loadError() && this.activeMeds() === 0);

  constructor() {
    this.load();
    this.destroyRef.onDestroy(startClock((n) => this.now.set(n)));
    // กลับมาที่แท็บ/แอป (หรือกลับจากแคช bfcache) → ปรับนาฬิกา + ดึงข้อมูลใหม่เงียบๆ (เผื่อกดกินจาก LINE หรืออีกเครื่อง)
    merge(
      fromEvent(document, 'visibilitychange').pipe(filter(() => document.visibilityState === 'visible')),
      fromEvent(window, 'pageshow'),
    ).pipe(takeUntilDestroyed()).subscribe(() => { this.now.set(Date.now()); this.load(true); });
    // กด "✓ กินแล้ว" จากการแจ้งเตือนเสร็จ → ดึงข้อมูลใหม่ให้เห็นผลทันที
    this.pushTake.done.pipe(takeUntilDestroyed()).subscribe(() => this.load(true));
    // กลับมาออนไลน์ → รีเฟรชเอง (ไม่ต้องกดอะไร) และแจ้ง "ต่ออินเทอร์เน็ตก่อน" ได้อีกครั้งถ้าหลุดอีกรอบ
    this.online.backOnline.pipe(takeUntilDestroyed()).subscribe(() => { this.offlineHinted = false; this.now.set(Date.now()); this.load(true); });
  }

  protected load(silent = false): void {
    if (!silent) { this.loading.set(true); this.loadError.set(null); }
    forkJoin({ today: this.doseApi.today(), meds: this.medApi.list(true) }).subscribe({
      next: ({ today, meds }) => {
        this.data.set(today);
        this.activeMeds.set(meds.length);
        this.asNeeded.set(meds.filter((m) => m.as_needed));
        this.lowText.set(new Map(meds.filter((m) => m.is_low).map((m) => [m.id, lowStockText(m)])));
        this.snapshots.save('today', pickToday(today, meds, this.lowText()));
        this.loading.set(false);
        this.loadError.set(null);
        this.now.set(Date.now());
        if (!this.scrolled) { this.scrolled = true; setTimeout(() => this.scrollToCurrent(), 80); }
      },
      error: (e) => {
        this.loading.set(false);
        if (this.useSnapshot(e)) return;
        if (!silent || !this.data()) this.loadError.set(errorText(e));
      },
    });
  }

  /** เชื่อมต่อไม่ได้ (status 0 / ออฟไลน์) → แสดงข้อมูลล่าสุดที่เก็บไว้ (อ่านอย่างเดียว) ; คืน true ถ้าใช้ snapshot */
  private useSnapshot(e: unknown): boolean {
    if (!(e instanceof HttpErrorResponse && e.status === 0) && !this.online.offline()) return false;
    const s = this.snapshots.load('today');
    if (!s) return false;
    this.data.set(s.data.today);
    this.activeMeds.set(s.data.activeMeds);
    this.asNeeded.set(s.data.asNeeded as Medication[]);
    this.lowText.set(new Map(s.data.low));
    this.loadError.set(null);
    this.now.set(Date.now());   // นาฬิกาจริงของเครื่อง ไม่ใช่เวลาที่บันทึก snapshot
    return true;
  }

  protected toggle(vm: SlotVM): void {
    const slot = vm.slot;
    if (vm.expanded) {
      this.opened.update((s) => { const n = new Set(s); n.delete(slot); return n; });
      this.touched.update((s) => { const n = new Set(s); n.delete(slot); return n; });
    } else {
      this.opened.update((s) => new Set(s).add(slot));
    }
  }

  /** แตะปุ่มที่ต้องใช้เน็ตตอนออฟไลน์ → บอกครั้งเดียว (ไม่มีข้อความใต้ทุกแถว) */
  protected offlineTap(): void {
    if (this.offlineHinted) return;
    this.offlineHinted = true;
    this.snack.open(NEEDS_ONLINE_TEXT, 'ตกลง', { duration: 5000, panelClass: 'yt-snack' });
  }

  protected take(vm: DoseVM, slot: Slot): void {
    const d = vm.dose;
    if (this.busy().has(d.id) || this.online.offline()) return;
    const wasDone = this.allDone();
    this.setBusy(d.id, true);
    this.touched.update((s) => new Set(s).add(slot));
    // optimistic: เปลี่ยนเป็น "กินแล้ว" ทันที
    this.patch(d.id, { status: 'taken', taken_at: toServerTime(Date.now()) });
    this.popId.set(d.id);

    this.doseApi.take(d.id).subscribe({
      next: (r) => {
        this.setBusy(d.id, false);
        this.applyResult(r);
        if (!wasDone && this.allDone()) this.celebrate();
        this.snack.open('บันทึกแล้ว', 'ยกเลิก', { duration: 10_000, panelClass: 'yt-snack' })
          .onAction().subscribe(() => this.undo(d.id, slot));
      },
      error: (e) => {
        this.setBusy(d.id, false);
        this.popId.set(null);
        if (errorCode(e) === 'ALREADY_TAKEN') { this.load(true); return; }   // กดจากอีกเครื่องไปแล้ว ไม่ใช่ error
        this.patch(d.id, { status: vm.dose.status, taken_at: vm.dose.taken_at });   // ย้อนสถานะ
        this.snack.open(errorText(e), 'ตกลง', { duration: 8000, panelClass: 'yt-snack' });
      },
    });
  }

  /** "กินครบมื้อนี้" : บันทึกรอบที่ถึงเวลา/เลยเวลาของมื้อนั้นทั้งหมดในคำขอเดียว (atomic) แล้วโหลดข้อมูลใหม่ */
  protected takeAll(vm: SlotVM): void {
    const ids = vm.takeAllIds;
    if (this.takingAll() || this.online.offline() || ids.length < 2) return;
    const before = new Map<number, Dose>((this.data()?.slots.flatMap((s) => s.doses) ?? []).filter((x) => ids.includes(x.id)).map((x): [number, Dose] => [x.id, x]));
    const wasDone = this.allDone();
    this.takingAll.set(true);
    this.touched.update((s) => new Set(s).add(vm.slot));
    const at = toServerTime(Date.now());
    for (const id of ids) this.patch(id, { status: 'taken', taken_at: at });   // optimistic
    this.doseApi.takeMany(ids).subscribe({
      next: (r) => {
        this.takingAll.set(false);
        if (!wasDone && this.allDone()) this.celebrate();
        this.snack.open(r.taken.length ? `บันทึก ${r.taken.length} รายการแล้วค่ะ` : 'บันทึกไว้แล้วค่ะ', undefined, { duration: 4000, panelClass: 'yt-snack' });
        this.load(true);   // ช่องทาง/เวลาจริงและยอดยาคงเหลือมาจากเซิร์ฟเวอร์
      },
      error: (e) => {
        this.takingAll.set(false);
        for (const [id, x] of before) this.patch(id, { status: x.status, taken_at: x.taken_at });   // ย้อนสถานะ
        this.snack.open(errorText(e), 'ตกลง', { duration: 8000, panelClass: 'yt-snack' });
        this.load(true);
      },
    });
  }

  protected undo(id: number, slot: Slot): void {
    if (this.busy().has(id) || this.online.offline()) return;
    this.setBusy(id, true);
    this.touched.update((s) => new Set(s).add(slot));
    this.doseApi.undo(id).subscribe({
      next: (r) => {
        this.setBusy(id, false);
        this.popId.set(null);
        this.applyResult(r);   // สถานะหลัง undo อาจเป็น missed ได้ → ใช้ตาม response เท่านั้น
        this.snack.open('ยกเลิกแล้ว', undefined, { duration: 4000, panelClass: 'yt-snack' });
      },
      error: (e) => {
        this.setBusy(id, false);
        const code = errorCode(e);
        if (code === 'UNDO_EXPIRED') {
          this.expired.update((s) => new Set(s).add(id));
          this.snack.open('เลยเวลายกเลิกแล้ว', 'ตกลง', { duration: 6000, panelClass: 'yt-snack' });
        } else if (code === 'NOT_TAKEN') {
          this.load(true);
        } else {
          this.snack.open(errorText(e), 'ตกลง', { duration: 8000, panelClass: 'yt-snack' });
        }
      },
    });
  }

  private applyResult(r: DoseActionResult): void {
    this.patch(r.id, { status: r.status, taken_at: r.taken_at, source: r.source });
  }

  private patch(id: number, changes: Partial<Dose>): void {
    this.data.update((d) => d && ({
      ...d,
      slots: d.slots.map((s) => ({ ...s, doses: s.doses.map((x) => (x.id === id ? { ...x, ...changes } : x)) })),
    }));
  }

  private setBusy(id: number, on: boolean): void {
    this.busy.update((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });
  }

  private celebrate(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.confetti.set(true);
    setTimeout(() => this.confetti.set(false), 2200);
  }

  /** เลื่อนไปมื้อที่ต้องทำก่อน (มื้อเปิดแรก ไม่งั้นมื้อถัดไป) ถ้ายังไม่อยู่ในสายตา */
  private scrollToCurrent(): void {
    const target = this.slots().find((s) => s.mode === 'open') ?? this.slots().find((s) => s.isNext);
    if (!target) return;
    const el = this.host.nativeElement.querySelector<HTMLElement>(`[data-slot="${target.slot}"]`);
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.55) {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }
}
