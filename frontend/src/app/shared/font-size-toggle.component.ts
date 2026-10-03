import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FONT_SCALES, FontScale, FontScaleService } from './font-scale.service';

const LABELS: Record<FontScale, { text: string; aria: string }> = {
  100: { text: 'ก', aria: 'ตัวอักษรขนาดปกติ' },
  112: { text: 'ก+', aria: 'ตัวอักษรขนาดใหญ่' },
  125: { text: 'ก++', aria: 'ตัวอักษรขนาดใหญ่มาก' },
};

@Component({
  selector: 'app-font-size-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
      min-width: 48px;   // กว้าง 48 / สูง 56 เพื่อให้พอดีแถบบนมือถือ
      min-height: 56px;
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
  `,
})
export class FontSizeToggleComponent {
  protected readonly fs = inject(FontScaleService);
  protected readonly scales = FONT_SCALES;
  protected readonly labels = LABELS;
}
