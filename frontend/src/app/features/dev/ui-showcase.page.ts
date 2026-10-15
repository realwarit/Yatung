import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MascotComponent } from '../../shared/components/mascot/mascot.component';
import { IconComponent } from '../../shared/icon.component';
import { FontSizeToggleComponent } from '../../shared/font-size-toggle.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { ListRowComponent } from '../../shared/ui/list-row/list-row.component';
import { SectionComponent } from '../../shared/ui/section/section.component';
import { SheetFrameComponent } from '../../shared/ui/sheet/sheet-frame.component';
import { SheetService } from '../../shared/ui/sheet/sheet.service';

@Component({
  selector: 'app-demo-sheet',
  imports: [SheetFrameComponent, ListRowComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet-frame title="เช้า · 08:00">
      <p>ตัวอย่างเนื้อหาใน yt-sheet (แผ่นล่างบนมือถือ / แผงขวาบนจอกว้าง)</p>
      <div appListRow title="แก้ไขข้อมูลยา" [chevron]="true"></div>
    </app-sheet-frame>
  `,
})
export class DemoSheet {}

/** หน้าตรวจคอมโพเนนต์พื้นฐาน 8D (เปิดเฉพาะ dev — ดู app.routes.ts) */
@Component({
  selector: 'app-ui-showcase',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, ListRowComponent, SectionComponent, IconComponent, MascotComponent, FontSizeToggleComponent],
  template: `
    <div class="yt-page" id="ui-demo">
      <app-page-header title="ยาของฉัน">
        <a action class="yt-compact yt-compact--primary" href="#"><app-icon name="plus" /> เพิ่มยา</a>
      </app-page-header>
      <app-font-size-toggle />

      <app-section label="เวลากินยาแต่ละมื้อ" id="s1">
        <button appListRow title="เช้า" sub="ก่อนอาหาร" [chevron]="true"><app-icon lead name="sunrise" /><span trail class="num">08:00</span></button>
        <button appListRow title="กลางวัน" [chevron]="true"><app-icon lead name="sun" /><span trail class="num">12:00</span></button>
        <button appListRow title="Metformin 500 mg" sub="1 เม็ด · หลังอาหาร · เช้า เย็น" [chevron]="true">
          <app-mascot lead size="s" mood="worried" />
          <span trail class="yt-chip yt-chip--warn">เหลือ 4 วัน</span>
        </button>
        <div appListRow title="ซิมวาสแตติน" sub="กินแล้ว"><span trail class="yt-chip yt-chip--ok"><app-icon name="check" /> 08:05</span></div>
        <div appListRow title="Amlodipine"><span trail class="yt-chip yt-chip--late">เลยเวลา 7 ชม.</span><button trail class="yt-compact yt-compact--primary"><app-icon name="check" /> กินแล้ว</button></div>
      </app-section>

      <p>
        <span class="yt-chip yt-chip--info">ข้อมูล</span> <button class="yt-compact">ฟัง</button>
        <button class="yt-compact yt-compact--danger">หยุดใช้ยา</button>
      </p>
      <input class="yt-demo-in" placeholder="ช่องกรอก" />
    </div>
  `,
  styles: `
    .yt-page { padding: var(--yt-gutter); max-width: 28rem; }
    .yt-demo-in { min-height: var(--yt-tap); width: 100%; font-size: 1rem; padding: 0 var(--yt-space-3); }
  `,
})
export class UiShowcasePage {
  readonly sheet = inject(SheetService);
}
