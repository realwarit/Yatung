import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { DemoApi, LineApi } from '../../core/api/line.api';
import { SettingsApi } from '../../core/api/settings.api';
import { SlotTimes } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { SLOT_ORDER } from '../../core/i18n/labels';
import { PushService } from '../../core/push/push.service';
import { InstallService } from '../../core/pwa/install.service';
import { MascotComponent, MascotMood } from '../../shared/components/mascot/mascot.component';
import { BubbleTone, SpeechBubbleComponent } from '../../shared/components/speech-bubble/speech-bubble.component';
import { FitLabelDirective } from '../../shared/fit-label.directive';
import { IconComponent } from '../../shared/icon.component';
import { ListRowComponent } from '../../shared/ui/list-row/list-row.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { SectionComponent } from '../../shared/ui/section/section.component';
import { SheetService } from '../../shared/ui/sheet/sheet.service';
import { DemoSheetComponent, DisplaySheetComponent, InstallSheetComponent, PushSheetComponent, TtsSheetComponent } from './settings-sheets';
import { TimesSheetComponent } from './times-sheet.component';

export type SettingsSheet = 'times' | 'push' | 'tts' | 'display' | 'install' | 'demo';
const OPEN_KEYS: readonly string[] = ['times', 'push', 'tts', 'display', 'install', 'demo'];
const NL = String.fromCharCode(10);

/**
 * หน้ารวมตั้งค่า (D3 ช่วง 3) : กล่องคำพูดเดียว + รายการ appListRow พร้อมสถานะท้ายแถว
 * sheet = เวลา/แจ้งเตือนเครื่องนี้/เสียงอ่าน/การแสดงผล/ติดตั้ง/ทดลองเตือน · หน้าย่อย = /settings/line, /settings/caregivers, /settings/developer
 * `?open=install|display|…` เปิด sheet ให้ (banner) แล้วลบออกจาก URL ทันที
 */
@Component({
  selector: 'app-settings-page',
  imports: [RouterLink, MatButton, IconComponent, MascotComponent, SpeechBubbleComponent, FitLabelDirective, ListRowComponent, PageHeaderComponent, SectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage {
  private api = inject(SettingsApi);
  private line = inject(LineApi);
  private demo = inject(DemoApi);
  private auth = inject(AuthService);
  private sheet = inject(SheetService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private install = inject(InstallService);
  protected readonly push = inject(PushService);

  protected readonly times = signal<SlotTimes | null>(null);
  protected readonly lineLinked = signal<boolean | null>(null);
  protected readonly caregiverCount = signal<number | null>(null);
  /** GET /api/config (สาธารณะ) → true = แสดงแถวเดโม ; เรียกไม่ได้ = ซ่อน */
  protected readonly demoMode = signal(false);
  protected readonly leaving = signal(false);
  protected readonly installMode = this.install.settingsMode;

  protected readonly timesSummary = computed(() => {
    const t = this.times();
    return t ? SLOT_ORDER.map((s) => t[s]).join(' · ') : 'กำลังโหลด…';
  });
  protected readonly pushLabel = computed(() => ({
    enabled: 'เปิดอยู่', off: 'ปิดอยู่', blocked: 'ถูกบล็อก', 'needs-install': 'ต้องติดตั้งก่อน', unsupported: 'ไม่รองรับ',
  }[this.push.state()]));
  protected readonly say = computed<{ tone: BubbleTone; mood: MascotMood; text: string }>(() =>
    this.lineLinked() === false
      ? { tone: 'info', mood: 'happy', text: 'ยังไม่ได้เชื่อม LINE ค่ะ' + NL + 'แตะ "เชื่อม LINE" ได้เลยนะคะ' }
      : { tone: 'neutral', mood: 'happy', text: 'ตั้งค่าให้เหมาะกับคุณนะคะ' });

  constructor() {
    this.api.slotTimes().subscribe({ next: (t) => this.times.set(t), error: () => this.times.set(null) });
    this.line.status().subscribe({ next: (s) => this.lineLinked.set(s.linked), error: () => this.lineLinked.set(null) });
    this.line.caregivers().subscribe({ next: (r) => this.caregiverCount.set(r.caregivers.length), error: () => this.caregiverCount.set(null) });
    this.demo.config().subscribe({ next: (c) => this.demoMode.set(c.demoMode === true), error: () => this.demoMode.set(false) });
    void this.push.refresh();

    // ?open=… (จาก banner) : เปิด sheet แล้วลบ query ออกทันที ; ฟังต่อเพราะ banner อาจแตะตอนอยู่หน้านี้อยู่แล้ว
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((q) => {
      const want = q.get('open');
      if (!want) return;
      void this.router.navigate([], { relativeTo: this.route, queryParams: { open: null }, queryParamsHandling: 'merge', replaceUrl: true });
      if (OPEN_KEYS.includes(want)) setTimeout(() => void this.openSheet(want as SettingsSheet));
    });
  }

  /** เปิด sheet ; เวลามื้อส่งค่าเดิมเข้าไปและรับค่าล่าสุดกลับ */
  protected async openSheet(kind: SettingsSheet): Promise<void> {
    switch (kind) {
      case 'times': {
        const r = await this.sheet.open<TimesSheetComponent, SlotTimes | null, SlotTimes | null>(TimesSheetComponent, this.times());
        if (r) this.times.set(r);
        break;
      }
      case 'push': await this.sheet.open(PushSheetComponent); break;
      case 'tts': await this.sheet.open(TtsSheetComponent); break;
      case 'display': await this.sheet.open(DisplaySheetComponent); break;
      case 'install': await this.sheet.open(InstallSheetComponent); break;
      case 'demo': await this.sheet.open(DemoSheetComponent); break;
    }
  }

  protected logout(): void { this.auth.logout(); }
}
