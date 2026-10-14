import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../../icon.component';

export const ADD_MED_STEPS = ['ถ่ายรูป', 'ตรวจ', 'บันทึก'] as const;

/**
 * ตัวบอกขั้นตอนแบบวงกลม ① — ② — ③ (ใช้ทั้งหน้า Scan / Review / บันทึกสำเร็จ)
 * ป้ายสั้น 1 บรรทัดไม่ตัดคำ · ขั้นปัจจุบัน = วงทึบ primary · ขั้นที่ผ่านแล้ว = ✓ · ไม่ใช้สีอย่างเดียว (มีเลข/✓/aria-current)
 */
@Component({
  selector: 'app-step-dots',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <ol class="steps" aria-label="ขั้นตอนการเพิ่มยา">
      @for (l of labels(); track l; let i = $index) {
        @if (i > 0) { <li class="line" aria-hidden="true"></li> }
        <li class="s" [attr.data-state]="i < current() ? 'done' : i === current() ? 'now' : 'next'"
            [attr.aria-current]="i === current() ? 'step' : null">
          <span class="dot num" aria-hidden="true">@if (i < current()) { <app-icon name="check" /> } @else { {{ i + 1 }} }</span>
          <span class="t">{{ l }}</span>
          <span class="sr-only">{{ i < current() ? ' เสร็จแล้ว' : i === current() ? ' ขั้นตอนปัจจุบัน' : '' }}</span>
        </li>
      }
    </ol>
  `,
  styles: `
    :host { display: block; container: steps / inline-size; }
    .steps { display: flex; align-items: center; margin: 0; padding: 0; list-style: none; }
    .s { display: flex; flex: none; align-items: center; gap: var(--yt-space-2); color: var(--yt-text-muted); font-size: var(--yt-text-sm); font-weight: 500; line-height: var(--yt-line-height-tight); white-space: nowrap; }
    /* G6: เส้นเชื่อมยาว ≥ 12px (0.75rem) ห่างวงกลมทั้งสองข้าง ≥ 8px ; ยืดตามที่ว่าง แต่ไม่เกิน 120px (จอกว้าง) */
    .line { flex: 1 1 0; min-width: 0.75rem; max-width: 7.5rem; height: 2px; margin: 0 var(--yt-space-2); background: var(--yt-border-strong); opacity: 0.5; }
    .dot {
      --icon-optical-offset: 0;
      display: grid; place-items: center; flex: none; width: 1.75rem; height: 1.75rem; box-sizing: border-box;
      border: 2px solid var(--yt-border-strong); border-radius: 50%; background: var(--yt-surface); font-size: var(--yt-text-sm); line-height: 1;
    }
    .s[data-state='now'] { color: var(--yt-primary-deep); font-weight: 600; }
    .s[data-state='now'] .dot { border-color: var(--yt-primary); background: var(--yt-primary); color: var(--yt-on-primary); }
    .s[data-state='done'] { color: var(--yt-primary-deep); }
    .s[data-state='done'] .dot { border-color: var(--yt-primary); background: var(--yt-primary-soft); color: var(--yt-primary-deep); }
    /* แคบ (มือถือ 320 / ก++): เหลือป้ายเฉพาะขั้นปัจจุบัน ที่เหลือเป็นวงกลมเลข — ข้อความยังอยู่ให้ screen reader */
    @container steps (max-width: 19rem) {
      .s:not([data-state='now']) .t { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
      .s:not([data-state='now']) { gap: 0; }
    }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
})
export class StepDotsComponent {
  readonly labels = input<readonly string[]>(ADD_MED_STEPS);
  /** ลำดับขั้นปัจจุบัน เริ่มที่ 0 (3 = ครบทุกขั้น) */
  readonly current = input(0);
}
