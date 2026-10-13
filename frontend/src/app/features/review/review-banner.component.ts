import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { MascotComponent, MascotMood } from '../../shared/components/mascot/mascot.component';
import { IconComponent } from '../../shared/icon.component';

/**
 * แถบเด่นบนสุดของหน้า Review : น้องยาตรง S + "ตรวจทุกช่องก่อนบันทึกนะคะ" + จำนวนจุดที่ควรตรวจ
 * warning (เหลือง) เมื่อมีช่องที่ต้องตรวจ · info (ฟ้า) เมื่อไม่มี ; "ส่วนที่น้องไม่แน่ใจ" (unreadable_parts) อยู่ในแถบนี้ — กล่องเหลืองกล่องเดียวในหน้า
 */
@Component({
  selector: 'app-review-banner',
  imports: [MascotComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.warn]': 'remaining() > 0', 'data-first-screen': 'banner', role: 'region', 'aria-label': 'สิ่งที่ต้องตรวจก่อนบันทึก' },
  template: `
    <app-mascot [mood]="mood()" size="s" />
    <div class="t">
      <p class="h">ตรวจทุกช่องก่อนบันทึกนะคะ</p>
      <p class="s" role="status">{{ remaining() > 0 ? 'มี ' + remaining() + ' ช่องที่ควรตรวจเป็นพิเศษ' : 'ตรวจครบทุกจุดแล้ว กดบันทึกได้เลย' }}</p>
    </div>
    @if (alerts().length) {
      <button type="button" class="more" [attr.aria-expanded]="open()" (click)="open.set(!open())">
        ส่วนที่น้องไม่แน่ใจ <app-icon name="chevron-down" [class.up]="open()" />
      </button>
    }
    @if (open() && alerts().length) {
      <ul class="list" aria-label="ส่วนที่น้องอ่านไม่ออก หรือข้อสังเกต">@for (a of alerts(); track $index) { <li>{{ a }}</li> }</ul>
    }
  `,
  styles: `
    :host {
      display: flex; flex-wrap: wrap; align-items: center; gap: var(--yt-space-2) var(--yt-space-3); margin-bottom: var(--yt-space-3); padding: var(--yt-space-2) var(--yt-space-3);
      border-radius: var(--yt-radius-sm); background: var(--yt-info-soft); color: var(--yt-on-info-soft);
    }
    :host(.warn) { background: var(--yt-warning-soft); color: var(--yt-on-warning-soft); }
    .t { flex: 1; min-width: 0; }
    .h { margin: 0; font-weight: 600; line-height: var(--yt-line-height-tight); }
    .s { margin: 0; font-size: var(--yt-text-sm); line-height: var(--yt-line-height-tight); }
    .more {
      --icon-optical-offset: 0; display: inline-flex; align-items: center; gap: 0.4em; min-height: var(--yt-tap); padding: 0; border: 0; background: none; color: inherit;
      font: 600 var(--yt-text-sm) / 1.4 var(--yt-font-body); text-decoration: underline; cursor: pointer;
    }
    .up { transform: rotate(180deg); }
    .list { flex-basis: 100%; margin: 0; padding: 0 0 var(--yt-space-1) 1.2em; font-size: var(--yt-text-sm); }
  `,
})
export class ReviewBannerComponent {
  readonly mood = input<MascotMood>('happy');
  /** จำนวนจุดที่ยังต้องตรวจ (ลดลงเมื่อผู้ใช้ตรวจ) */
  readonly remaining = input(0);
  /** ส่วนที่น้องอ่านไม่ออก/ข้อสังเกตของ AI */
  readonly alerts = input<string[]>([]);
  protected readonly open = signal(false);
}
