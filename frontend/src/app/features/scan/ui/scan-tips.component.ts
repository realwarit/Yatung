import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, IconName } from '../../../shared/icon.component';

const TIPS: { icon: IconName; text: string }[] = [
  { icon: 'layers', text: 'วางซองบนพื้นเรียบ ให้อยู่ในกรอบ' },
  { icon: 'level', text: 'ถ่ายตรง ไม่เอียง ไม่มีเงาบัง' },
  { icon: 'type', text: 'สแกนทีละซอง · เฉพาะซองที่พิมพ์ด้วยเครื่อง' },
];

/** ข้อความเต็มของคำแนะนำ (ให้ screen reader อ่านผ่าน aria-describedby ของกรอบถ่ายรูป) */
export const TIPS_FULL_TEXT = TIPS.map((t) => t.text).join(' · ');

/**
 * คำแนะนำถ่ายรูป 3 ข้อ — `line` = บรรทัดย่อใต้กรอบ (มือถือ) · `list` = รายการเต็มพร้อมไอคอน (คอลัมน์ขวาของจอกว้าง)
 */
@Component({
  selector: 'app-scan-tips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (variant() === 'line') {
      <p class="line" data-first-screen="tips">วางบนพื้นเรียบ · ถ่ายตรง · ทีละซอง</p>
    } @else {
      <ul class="list" aria-label="คำแนะนำถ่ายรูปซองยา">
        @for (t of tips; track t.text) {
          <li><span class="ic"><app-icon [name]="t.icon" /></span><span>{{ t.text }}</span></li>
        }
      </ul>
    }
  `,
  styles: `
    :host { display: block; }
    .line { margin: 0; text-align: center; font-size: var(--yt-text-label); line-height: var(--yt-line-height-tight); color: var(--yt-text-muted); }
    .list { display: grid; gap: var(--yt-space-3); margin: 0; padding: 0; list-style: none; }
    li { display: flex; align-items: center; gap: var(--yt-space-3); font-size: var(--yt-text-body); font-weight: 500; line-height: var(--yt-line-height-tight); color: var(--yt-primary-deep); }
    .ic { --icon-optical-offset: 0; display: grid; place-items: center; flex: none; width: 2.25rem; height: 2.25rem; border-radius: 50%; background: var(--yt-primary-soft); }
  `,
})
export class ScanTipsComponent {
  readonly variant = input<'line' | 'list'>('line');
  protected readonly tips = TIPS;
}
