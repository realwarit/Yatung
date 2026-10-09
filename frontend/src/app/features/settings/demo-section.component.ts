import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { errorText } from '../../core/api/api-error';
import { DemoApi } from '../../core/api/line.api';
import { SLOT_LABEL } from '../../core/i18n/labels';
import { IconComponent } from '../../shared/icon.component';

/** ปุ่ม "ทดลองส่งเตือนตอนนี้" — ส่งเตือนรอบถัดไปของวันนี้เข้า LINE ของตัวเอง (แสดงเฉพาะเมื่อ GET /api/config ตอบ demoMode = true) */
@Component({
  selector: 'app-demo-section',
  imports: [MatButton, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="hint">สำหรับนำเสนอ: ส่งข้อความเตือนของรอบกินยาถัดไปของวันนี้เข้า LINE ทันที (ไม่สร้างรอบยาปลอม)</p>
    <button mat-flat-button type="button" class="full" [disabled]="busy()" (click)="send()">
      <app-icon name="bell" /> {{ busy() ? 'กำลังส่ง…' : 'ทดลองส่งเตือนตอนนี้' }}
    </button>
    @if (result(); as r) { <p class="yt-alert" role="status"><app-icon name="check" /> <span>{{ r }}</span></p> }
    @if (error(); as e) { <p class="yt-alert yt-alert--danger" role="alert"><app-icon name="alert" /> <span>{{ e }}</span></p> }
  `,
  styles: `
    :host { display: block; }
    .hint { margin: 0 0 var(--yt-space-3); color: var(--yt-text-muted); }
    .full { width: 100%; }
    .yt-alert { margin-top: var(--yt-space-3); }
  `,
})
export class DemoSectionComponent {
  private api = inject(DemoApi);
  protected readonly busy = signal(false);
  protected readonly result = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected send(): void {
    this.busy.set(true);
    this.result.set(null);
    this.error.set(null);
    this.api.remindNow().subscribe({
      next: (r) => {
        this.busy.set(false);
        this.result.set(`ส่งเตือนมื้อ${SLOT_LABEL[r.slot]} ${r.time} น. (${r.doses} รายการ) เข้า LINE แล้วค่ะ${r.resent ? ' — ส่งซ้ำรอบที่เตือนไปแล้ว' : ''}`);
      },
      error: (e) => { this.busy.set(false); this.error.set(errorText(e)); },
    });
  }
}
