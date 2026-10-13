import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../icon.component';

/**
 * หัวหน้า 1 แถว สูง ≈ 56px: [ย้อน] ชื่อหน้า ........ [action 1 อย่าง]
 * action = <button slot="action"> / <a slot="action"> ใส่ใน content ด้วย attribute `action`
 * ไม่มีโลโก้ (โลโก้อยู่ที่ Login/Register และ sidebar จอกว้างเท่านั้น)
 */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (back(); as to) {
      <a class="back" [routerLink]="to" [attr.aria-label]="backLabel()"><app-icon name="arrow-left" /></a>
    }
    <h1 class="yt-page-title">{{ title() }}</h1>
    <div class="action"><ng-content select="[action]" /></div>
  `,
  styleUrl: './page-header.component.scss',
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  /** ลิงก์ย้อนกลับ (ไม่ใส่ = ไม่มีปุ่มย้อน) */
  readonly back = input<string | null>(null);
  readonly backLabel = input('ย้อนกลับ');
}
