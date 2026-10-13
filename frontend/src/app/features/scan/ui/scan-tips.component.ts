import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IconComponent, IconName } from '../../../shared/icon.component';

const TIPS: { icon: IconName; text: string }[] = [
  { icon: 'layers', text: 'วางซองบนพื้นเรียบ ให้อยู่ในกรอบ' },
  { icon: 'level', text: 'ถ่ายตรง ไม่เอียง ไม่มีเงาบัง' },
  { icon: 'type', text: 'สแกนทีละซอง · เฉพาะซองที่พิมพ์ด้วยเครื่อง' },
];

/** คำแนะนำถ่ายรูป 3 ข้อ บรรทัดละข้อพร้อมไอคอน (อยู่ในกรอบถ่ายรูป ไม่เลื่อนแนวนอน) */
@Component({
  selector: 'app-scan-tips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <ul class="tips" aria-label="คำแนะนำถ่ายรูปซองยา" data-first-screen="tips">
      @for (t of tips; track t.text) {
        <li><span class="ic"><app-icon [name]="t.icon" /></span><span>{{ t.text }}</span></li>
      }
    </ul>
  `,
  styles: `
    :host { display: block; }
    .tips { display: grid; gap: var(--yt-space-1); margin: 0; padding: 0; list-style: none; }
    li { display: flex; align-items: center; gap: var(--yt-space-3); font-size: var(--yt-text-sm); font-weight: 500; line-height: var(--yt-line-height-tight); color: var(--yt-primary-deep); }
    .ic { --icon-optical-offset: 0; display: grid; place-items: center; flex: none; width: 2rem; height: 2rem; border-radius: 50%; background: var(--yt-primary-soft); }
  `,
})
export class ScanTipsComponent {
  protected readonly tips = TIPS;
}
