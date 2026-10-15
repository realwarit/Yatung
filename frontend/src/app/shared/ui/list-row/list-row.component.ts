import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../../icon.component';

/**
 * แถวรายการ (yt-list-row): สูง ≥ 56px · ซ้าย [lead] · กลาง หัวเรื่อง 16/500 + รอง 14 · ขวา [trail] หรือ chevron
 * ใช้เป็น attribute บน <button> / <a> / <div> : <button appListRow title="…" sub="…"><app-icon lead …/> <chip trail/></button>
 * เส้นคั่นระหว่างแถวมาจาก :host + :host (อยู่ใน app-section) ; แถวที่แตะได้ (button/a) มี focus/active
 */
@Component({
  selector: 'button[appListRow], a[appListRow], div[appListRow]',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="lead"><ng-content select="[lead]" /></span>
    <span class="body">
      <span class="t">{{ title() }}</span>
      @if (sub()) { <span class="s">{{ sub() }}</span> }
      <ng-content />
    </span>
    <span class="trail"><ng-content select="[trail]" /></span>
    @if (chevron()) { <app-icon class="chev" name="chevron-right" /> }
  `,
  styleUrl: './list-row.component.scss',
  host: { class: 'yt-row' },
})
export class ListRowComponent {
  readonly title = input.required<string>();
  readonly sub = input<string | null>(null);
  /** true = chevron › ท้ายแถว (เปิดอะไรต่อ) */
  readonly chevron = input(false);
}
