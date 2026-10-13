import { ErrTextComponent } from '../../shared/components/err-text/err-text.component';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { filter, forkJoin, fromEvent } from 'rxjs';
import { DoseApi } from '../../core/api/dose.api';
import { MedicationApi } from '../../core/api/medication.api';
import { PushTakeService } from '../../core/push/push-take.service';
import { OnlineService } from '../../core/offline/online.service';
import { SnapshotService } from '../../core/offline/snapshot.service';
import { pickToday } from '../../core/offline/snapshot';
import { errorCode, errorText } from '../../core/api/api-error';
import { Dose, DoseActionResult, Medication, Slot, TodayResponse } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { SLOT_LABEL } from '../../core/i18n/labels';
import { DoseQtyPipe, MealLabelPipe, SlotLabelPipe } from '../../core/i18n/labels.pipe';
import { clockTime, duration, greeting, parseServerTime, thaiDate, toServerTime } from '../../core/time';
import { ConfettiComponent } from '../../shared/components/confetti/confetti.component';
import { MascotComponent, MascotMood } from '../../shared/components/mascot/mascot.component';
import { IconComponent, IconName } from '../../shared/icon.component';
import { TtsButtonComponent } from '../../shared/components/tts-button/tts-button.component';
import { SpeakableSlot, slotSpeech, todaySpeech } from '../../core/tts/speech-text';
import { DoseCardComponent, DoseState } from './dose-card.component';
import { TodayProgressComponent } from './today-progress.component';
import { AdherenceCardComponent } from './adherence-card.component';
import { InstallCardComponent } from '../../shared/components/install-card/install-card.component';
import { hasMultipleTimes, slotTimeLabel } from './slot-time';
import { lowStockText } from './low-stock';

const OVERDUE_AFTER_MIN = 30;           // ตรงกับ is_overdue ของ backend
const UNDO_WINDOW_MS = 10 * 60 * 1000;  // undo ได้ 10 นาทีหลังกด
const TICK_MS = 20_000;

const SLOT_ICON: Record<Slot, IconName> = { morning: 'sunrise', noon: 'sun', evening: 'sunset', bedtime: 'moon' };

interface DoseVM { dose: Dose; state: DoseState; lateMin: number; takenClock: string | null; canUndo: boolean; }
interface SlotVM {
  slot: Slot; time: string; multiTime: boolean; icon: IconName; doses: DoseVM[];
  allTaken: boolean; collapsible: boolean; collapsed: boolean;
}

@Component({
  selector: 'app-today-page',
  imports: [ErrTextComponent, RouterLink, MatButton, IconComponent, MascotComponent, ConfettiComponent,
    DoseCardComponent, TodayProgressComponent, AdherenceCardComponent, InstallCardComponent, TtsButtonComponent, DoseQtyPipe, MealLabelPipe, SlotLabelPipe],
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
  /** ออฟไลน์ → ปุ่มที่ต้องใช้เน็ตกดไม่ได้ (ดู dose-card) */
  protected readonly offline = this.online.offline;
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private destroyRef = inject(DestroyRef);

  protected readonly data = signal<TodayResponse | null>(null);
  protected readonly asNeeded = signal<Medication[]>([]);
  protected readonly activeMeds = signal(0);
  /** ยาที่ใกล้หมด (medication_id → ข้อความสั้น) ใช้แสดงป้ายเหลืองบนการ์ดยา */
  protected readonly lowText = signal<ReadonlyMap<number, string>>(new Map());
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly now = signal(Date.now());
  protected readonly confetti = signal(false);
  protected readonly popId = signal<number | null>(null);

  private readonly busy = signal<ReadonlySet<number>>(new Set());
  private readonly expired = signal<ReadonlySet<number>>(new Set());     // undo เลยเวลาแล้ว (ซ่อนปุ่ม)
  private readonly touched = signal<ReadonlySet<Slot>>(new Set());       // มื้อที่ผู้ใช้เพิ่งกด ไม่ยุบทันที
  private readonly expanded = signal<ReadonlySet<Slot>>(new Set());      // มื้อที่ผู้ใช้กดขยาย
  private scrolled = false;

  protected readonly today = computed(() => thaiDate(this.now()));
  protected readonly greet = computed(() => greeting(this.now()));
  protected readonly who = computed(() => {
    const n = this.auth.currentUser()?.display_name?.trim() ?? '';
    return !n ? '' : n.startsWith('คุณ') ? n : `คุณ${n}`;   // ชื่อที่ขึ้นต้นด้วย "คุณ" อยู่แล้วไม่ต้องเติมซ้ำ
  });

  protected readonly slots = computed<SlotVM[]>(() => {
    const d = this.data();
    if (!d) return [];
    const now = this.now();
    return d.slots.map((s) => {
      const doses = s.doses.map((dose): DoseVM => {
        const sched = parseServerTime(dose.scheduled_at);
        const taken = dose.status === 'taken';
        const lateMin = Math.floor((now - sched) / 60000);
        const state: DoseState = taken ? 'taken'
          : dose.status === 'missed' || lateMin > OVERDUE_AFTER_MIN ? 'overdue'
          : lateMin >= 0 ? 'due' : 'waiting';
        const takenMs = taken && dose.taken_at ? parseServerTime(dose.taken_at) : null;
        return {
          dose, state, lateMin: Math.max(0, lateMin),
          takenClock: takenMs ? clockTime(takenMs) : null,
          canUndo: takenMs !== null && now - takenMs < UNDO_WINDOW_MS && !this.expired().has(dose.id),
        };
      });
      const allTaken = doses.every((x) => x.state === 'taken');
      const passed = s.doses.every((x) => parseServerTime(x.scheduled_at) <= now);
      const collapsible = allTaken && passed && !this.touched().has(s.slot);
      return {
        slot: s.slot, time: slotTimeLabel(s.doses.map((x) => x.scheduled_at)), multiTime: hasMultipleTimes(s.doses.map((x) => x.scheduled_at)), icon: SLOT_ICON[s.slot], doses, allTaken, collapsible,
        collapsed: collapsible && !this.expanded().has(s.slot),
      };
    });
  });

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

  protected readonly total = computed(() => this.slots().reduce((n, s) => n + s.doses.length, 0));
  protected readonly taken = computed(() =>
    this.slots().reduce((n, s) => n + s.doses.filter((x) => x.state === 'taken').length, 0));
  protected readonly allDone = computed(() => this.total() > 0 && this.taken() === this.total());
  /** รอบที่ถึงเวลา/เลยเวลาแล้วแต่ยังไม่ได้กิน */
  protected readonly notTaken = computed(() =>
    this.slots().reduce((n, s) => n + s.doses.filter((x) => x.state === 'overdue' || x.state === 'due').length, 0));

  protected readonly mood = computed<MascotMood>(() =>
    this.allDone() ? 'celebrate' : this.notTaken() > 0 ? 'reminder' : 'happy');

  /** รอบถัดไป = มื้อที่เวลายังไม่ถึงและยังไม่กินครบ */
  protected readonly next = computed(() => {
    const now = this.now();
    for (const s of this.slots()) {
      const w = s.doses.find((x) => x.state === 'waiting');   // dose แรกที่ยังรอเวลา (มื้อเดียวอาจมีหลายเวลา)
      if (w) {
        const min = Math.max(1, Math.ceil((parseServerTime(w.dose.scheduled_at) - now) / 60000));
        return { label: SLOT_LABEL[s.slot], time: slotTimeLabel([w.dose.scheduled_at]), remain: duration(min) };
      }
    }
    return null;
  });

  protected readonly bubble = computed(() => {
    if (this.total() === 0) return 'วันนี้ไม่มียาที่ต้องกินค่ะ';
    if (this.allDone()) return 'เก่งมากค่ะ วันนี้กินครบแล้ว!';
    if (this.notTaken() > 0) return 'ยังมียาที่ยังไม่ได้กินนะคะ';
    const n = this.next();
    return n ? `รอบถัดไป ${n.label} ${n.time} ค่ะ` : 'วันนี้ไม่มียาที่ต้องกินค่ะ';
  });

  protected readonly noMeds = computed(() => !this.loading() && !this.loadError() && this.activeMeds() === 0);

  constructor() {
    this.load();
    const timer = setInterval(() => this.now.set(Date.now()), TICK_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
    // กลับมาที่แท็บ/แอป → ดึงข้อมูลใหม่เงียบๆ (เผื่อกดกินจาก LINE หรืออีกเครื่อง)
    fromEvent(document, 'visibilitychange').pipe(
      filter(() => document.visibilityState === 'visible'),
      takeUntilDestroyed(),
    ).subscribe(() => { this.now.set(Date.now()); this.load(true); });
    // กด "✓ กินแล้ว" จากการแจ้งเตือนเสร็จ → ดึงข้อมูลใหม่ให้เห็นผลทันที
    this.pushTake.done.pipe(takeUntilDestroyed()).subscribe(() => this.load(true));
    // กลับมาออนไลน์ → รีเฟรชเอง (ไม่ต้องกดอะไร)
    this.online.backOnline.pipe(takeUntilDestroyed()).subscribe(() => this.load(true));
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
    this.now.set(Date.now());
    return true;
  }

  protected toggle(slot: Slot): void {
    this.expanded.update((s) => { const n = new Set(s); n.has(slot) ? n.delete(slot) : n.add(slot); return n; });
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

  protected isBusy(id: number): boolean { return this.busy().has(id); }

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

  /** ปุ่ม "ดูรายการ": เลื่อนไปมื้อแรกที่ยังมียาถึงเวลาแล้วแต่ยังไม่ได้กิน */
  protected goFirstNotTaken(): void {
    const s = this.slots().find((v) => v.doses.some((x) => x.state === 'overdue' || x.state === 'due'));
    this.host.nativeElement.querySelector<HTMLElement>(`[data-slot="${s?.slot}"]`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  /** เลื่อนไปมื้อปัจจุบัน (มื้อแรกที่ยังไม่ครบและถึง/เลยเวลาแล้ว ไม่งั้นมื้อถัดไป) ถ้ายังไม่อยู่ในสายตา */
  private scrollToCurrent(): void {
    const list = this.slots();
    const target = list.find((s) => s.doses.some((x) => x.state === 'due' || x.state === 'overdue'))
      ?? list.find((s) => !s.allTaken);
    if (!target) return;
    const el = this.host.nativeElement.querySelector<HTMLElement>(`[data-slot="${target.slot}"]`);
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.55) {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }
}
