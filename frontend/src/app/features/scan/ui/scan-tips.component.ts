import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IconComponent, IconName } from '../../../shared/icon.component';

const TIPS: { icon: IconName; text: string }[] = [
  { icon: 'layers', text: 'วางบนพื้นเรียบ' },
  { icon: 'level', text: 'ถ่ายตรงไม่เอียง' },
  { icon: 'bulb', text: 'แสงสว่างพอ' },
  { icon: 'type', text: 'เห็นตัวหนังสือครบ' },
];

/** เคล็ดลับถ่ายรูป 4 ข้อ: กว้าง = grid 2×2 · แคบ = เลื่อนแนวนอน */
@Component({
  selector: 'app-scan-tips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <ul class="tips" aria-label="เคล็ดลับถ่ายรูปซองยา">
      @for (t of tips; track t.text) {
        <li class="tip"><span class="ic"><app-icon [name]="t.icon" /></span><span>{{ t.text }}</span></li>
      }
    </ul>
    <p class="yt-hint">มียาหลายซอง สแกนทีละซองนะคะ · รองรับเฉพาะซองยาที่พิมพ์ด้วยเครื่อง</p>
  `,
  styles: `
    :host { display: block; }
    .tips {
      display: flex;
      gap: var(--yt-space-3);
      margin: 0;
      padding: var(--yt-space-1) var(--yt-space-1) var(--yt-space-2);
      list-style: none;
      overflow-x: auto;
      scroll-snap-type: x proximity;
    }
    .tip {
      flex: 0 0 62%;
      display: flex;
      align-items: center;
      gap: var(--yt-space-3);
      padding: var(--yt-space-3);
      border-radius: var(--yt-radius-md);
      background: var(--yt-primary-softer);
      border: 1px solid var(--yt-border);
      font-weight: 500;
      line-height: var(--yt-line-height-tight);
      scroll-snap-align: start;
    }
    .ic {
      --icon-optical-offset: 0;
      display: grid;
      place-items: center;
      flex: none;
      width: 2.6rem;
      height: 2.6rem;
      border-radius: 50%;
      background: var(--yt-primary-soft);
      color: var(--yt-primary-deep);
      font-size: 1.2rem;
    }
    .yt-hint { margin-top: var(--yt-space-2); }
    @media (min-width: 600px) {
      .tips { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); overflow: visible; padding: 0; }
      .tip { flex: initial; }
    }
  `,
})
export class ScanTipsComponent {
  protected readonly tips = TIPS;
}
