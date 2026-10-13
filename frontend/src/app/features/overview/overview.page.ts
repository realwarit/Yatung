import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { AdherenceResponse, StatsApi } from '../../core/api/stats.api';
import { LineApi } from '../../core/api/line.api';
import { errorText } from '../../core/api/api-error';
import { HttpErrorResponse } from '@angular/common/http';
import { OnlineService } from '../../core/offline/online.service';
import { SnapshotService } from '../../core/offline/snapshot.service';
import { pickAdherence } from '../../core/offline/snapshot';
import { IconComponent } from '../../shared/icon.component';
import { AdherenceChartComponent } from './adherence-chart.component';
import { AdherenceHeroComponent } from './adherence-hero.component';
import { hasData, rangeText, worstMeal } from './adherence-level';
import { MedBreakdownComponent } from './med-breakdown.component';
import { TtsButtonComponent } from '../../shared/components/tts-button/tts-button.component';
import { adherenceSpeech } from '../../core/tts/speech-text';

const DAYS = 7;

/** หน้า "สรุป" — อัตราการกินยา 7 วัน (ตัวเลขจาก GET /api/stats/adherence นิยามเดียวกับ LINE "สรุป") */
@Component({
  selector: 'app-overview-page',
  imports: [RouterLink, MatButton, IconComponent, AdherenceHeroComponent, AdherenceChartComponent, MedBreakdownComponent, TtsButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './overview.page.html',
  styleUrl: './overview.page.scss',
})
export class OverviewPage {
  private api = inject(StatsApi);
  private lineApi = inject(LineApi);
  private destroyRef = inject(DestroyRef);
  private online = inject(OnlineService);
  private snapshots = inject(SnapshotService);

  protected readonly data = signal<AdherenceResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly days = DAYS;
  /** เชื่อม LINE แล้วหรือยัง (null = ยังไม่ทราบ/ถามไม่ได้) — เปลี่ยนข้อความน้องยาตรงเมื่ออัตราต่ำกว่า 50 */
  protected readonly lineLinked = signal<boolean | null>(null);
  protected readonly range = computed(() => rangeText(this.data()?.days ?? []));

  protected readonly empty = computed(() => !hasData(this.data()));
  /** ข้อสังเกตมื้อ: มื้อ rate ต่ำสุดที่ < 100 และ due ≥ 2 */
  protected readonly worst = computed(() => { const d = this.data(); return d ? worstMeal(d.by_meal) : null; });

  protected readonly speak = (): string[] => { const d = this.data(); return d ? adherenceSpeech(d, this.lineLinked()) : []; };

  constructor() {
    this.load();
    this.online.backOnline.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());   // กลับมาออนไลน์ → รีเฟรชเอง
    this.lineApi.status().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (s) => this.lineLinked.set(s.linked), error: () => this.lineLinked.set(null) });
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.adherence(DAYS).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => { this.data.set(r); this.loading.set(false); this.snapshots.save('adherence', pickAdherence(r)); },
      error: (e) => {
        this.loading.set(false);
        // เชื่อมต่อไม่ได้ → แสดงสรุปล่าสุดที่เก็บไว้ (อ่านอย่างเดียว)
        const snap = (e instanceof HttpErrorResponse && e.status === 0) || this.online.offline() ? this.snapshots.load('adherence') : null;
        if (snap) this.data.set(snap.data); else this.error.set(errorText(e));
      },
    });
  }
}
