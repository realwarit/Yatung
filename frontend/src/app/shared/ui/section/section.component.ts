import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** กลุ่มรายการ (yt-section): ป้ายกลุ่ม 13px สี muted เหนือการ์ดที่รวมแถว (appListRow) ไว้ด้วยกัน — การ์ด 16px เส้น 1px ไม่มีเงา */
@Component({
  selector: 'app-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (label()) { <h2 class="label" [id]="id()">{{ label() }}</h2> }
    <div class="card" role="group" [attr.aria-labelledby]="label() ? id() : null"><ng-content /></div>
  `,
  styleUrl: './section.component.scss',
})
export class SectionComponent {
  readonly label = input<string | null>(null);
  /** id ของป้าย (ผูก aria-labelledby ; ตั้งให้ไม่ซ้ำเมื่อมีหลายกลุ่ม) */
  readonly id = input('sec');
}
