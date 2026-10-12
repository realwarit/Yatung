import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { AdherenceResponse, StatsApi } from '../../core/api/stats.api';
import { errorText } from '../../core/api/api-error';
import { IconComponent } from '../../shared/icon.component';
import { MascotComponent } from '../../shared/components/mascot/mascot.component';
import { AdherenceChartComponent } from './adherence-chart.component';
import { AdherenceHeroComponent } from './adherence-hero.component';
import { hasData, worstMeal } from './adherence-level';
import { MedBreakdownComponent } from './med-breakdown.component';
import { TtsButtonComponent } from '../../shared/components/tts-button/tts-button.component';
import { adherenceSpeech } from '../../core/tts/speech-text';

const DAYS = 7;

/** หน้า "สรุป" — อัตราการกินยา 7 วัน (ตัวเลขจาก GET /api/stats/adherence นิยามเดียวกับ LINE "สรุป") */
@Component({
  selector: 'app-overview-page',
  imports: [RouterLink, MatButton, IconComponent, MascotComponent, AdherenceHeroComponent, AdherenceChartComponent, MedBreakdownComponent, TtsButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './overview.page.html',
  styleUrl: './overview.page.scss',
})
export class OverviewPage {
  private api = inject(StatsApi);
  private destroyRef = inject(DestroyRef);

  protected readonly data = signal<AdherenceResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly days = DAYS;

  protected readonly empty = computed(() => !hasData(this.data()));
  /** ข้อสังเกตมื้อ: มื้อ rate ต่ำสุดที่ < 100 และ due ≥ 2 */
  protected readonly worst = computed(() => { const d = this.data(); return d ? worstMeal(d.by_meal) : null; });

  protected readonly speak = (): string[] => { const d = this.data(); return d ? adherenceSpeech(d) : []; };

  constructor() { this.load(); }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.adherence(DAYS).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => { this.data.set(r); this.loading.set(false); },
      error: (e) => { this.error.set(errorText(e)); this.loading.set(false); },
    });
  }
}
