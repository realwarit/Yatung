import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FONT_SCALES, FontScale, FontScaleService } from './font-scale.service';

const LABELS: Record<FontScale, { text: string; aria: string }> = {
  100: { text: 'ก', aria: 'ตัวอักษรขนาดปกติ' },
  112: { text: 'ก+', aria: 'ตัวอักษรขนาดใหญ่' },
  125: { text: 'ก++', aria: 'ตัวอักษรขนาดใหญ่มาก' },
};

@Component({
  selector: 'app-font-size-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.compact]': 'compact()' },
  template: `
    <div class="group" role="group" aria-label="ขนาดตัวอักษร">
      @for (s of scales; track s) {
        <button type="button" [attr.aria-pressed]="fs.scale() === s" [attr.aria-label]="labels[s].aria"
                [class.active]="fs.scale() === s" (click)="fs.set(s)">{{ labels[s].text }}</button>
      }
    </div>
  `,
  styles: `
    :host { display: inline-block; }
    .group {
      display: inline-flex;
      gap: var(--yt-space-1);
      padding: var(--yt-space-1);
      background: var(--yt-surface);
      border-radius: var(--yt-radius-pill);
      box-shadow: var(--yt-shadow-sm);
    }
    button {
      min-width: 3rem;
      min-height: var(--yt-tap);
      padding: 0 var(--yt-space-2);
      border: 0;
      border-radius: var(--yt-radius-pill);
      background: transparent;
      font: 600 1rem / 1.6 var(--yt-font-body);   // ใช้ฟอนต์เนื้อความ เพราะ "ก" ของ Mitr คล้ายตัว n
      color: var(--yt-primary-dark);
      cursor: pointer;
      transition: background var(--yt-duration), color var(--yt-duration);
    }
    button:hover { background: var(--yt-primary-soft); }
    button.active { background: var(--yt-primary); color: var(--yt-on-primary); }

    // กะทัดรัด (หน้า Login/Register บนมือถือ < 1024px): สูงที่มองเห็น 32px · พื้นที่แตะสูง ≥ 48px ด้วย ::before · กว้าง ≥ 48px
    @media (max-width: 1023.98px) {
      :host(.compact) button { position: relative; min-height: 2rem; font-size: var(--yt-text-sm); }
      :host(.compact) button::before { content: ''; position: absolute; inset: -0.5rem 0; }
    }
  `,
})
export class FontSizeToggleComponent {
  protected readonly fs = inject(FontScaleService);
  /** true = แถบกะทัดรัด สูง 32px */
  readonly compact = input(false);
  protected readonly scales = FONT_SCALES;
  protected readonly labels = LABELS;
}
