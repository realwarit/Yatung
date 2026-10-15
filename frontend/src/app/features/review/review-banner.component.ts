import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { nowrapUnits } from '../../core/nowrap';
import { MascotComponent, MascotMood } from '../../shared/components/mascot/mascot.component';
import { SpeechBubbleComponent } from '../../shared/components/speech-bubble/speech-bubble.component';
import { IconComponent } from '../../shared/icon.component';

/**
 * บนสุดของหน้า Review (D2.5 B2): น้องยาตรง M + กล่องคำพูด warning (มีช่องที่ต้องตรวจ) / info (ไม่มี) แทนแถบเดิม ข้อความเดิม
 * "ส่วนที่น้องไม่แน่ใจ" เป็นลิงก์ใต้กล่อง และรายการเปิดเป็นกรอบขาวธรรมดา — ไม่มีกล่องเหลืองซ้อนเกิน 1 ชั้น
 */
@Component({
  selector: 'app-review-banner',
  imports: [MascotComponent, SpeechBubbleComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-first-screen': 'banner', role: 'region', 'aria-label': 'สิ่งที่ต้องตรวจก่อนบันทึก' },
  template: `
    <div class="row">
      <app-mascot [mood]="mood()" size="m" />
      <app-speech-bubble class="b" tail="left" [typing]="false" [live]="true" [tone]="remaining() > 0 ? 'warning' : 'info'"
                         text="ตรวจทุกช่องก่อนบันทึกนะคะ" [sub]="sub()" />
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
    :host { display: block; margin-bottom: var(--yt-space-3); }
    .row { display: flex; align-items: center; gap: var(--yt-space-3); }
    .b { flex: 1; min-width: 0; }
    .more {
      --icon-optical-offset: 0; display: inline-flex; align-items: center; gap: 0.4em; min-height: var(--yt-tap); padding: 0; border: 0; background: none; color: var(--yt-primary-dark);
      font: 600 var(--yt-text-sm) / 1.4 var(--yt-font-body); text-decoration: underline; cursor: pointer;
    }
    .up { transform: rotate(180deg); }
    .list { margin: 0; padding: var(--yt-space-3) var(--yt-space-4) var(--yt-space-3) 2em; border: 1px solid var(--yt-border); border-radius: var(--yt-radius-sm); background: var(--yt-surface); font-size: var(--yt-text-sm); }
  `,
})
export class ReviewBannerComponent {
  readonly mood = input<MascotMood>('happy');
  /** จำนวนจุดที่ยังต้องตรวจ (ลดลงเมื่อผู้ใช้ตรวจ) */
  readonly remaining = input(0);
  /** ส่วนที่น้องอ่านไม่ออก/ข้อสังเกตของ AI */
  readonly alerts = input<string[]>([]);
  protected readonly open = signal(false);
  protected readonly sub = computed(() => (this.remaining() > 0 ? nowrapUnits('มี ' + this.remaining() + ' ช่องที่ควรตรวจเป็นพิเศษ') : 'ตรวจครบทุกจุดแล้ว กดบันทึกได้เลย'));
}
