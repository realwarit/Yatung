import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { InstallService } from '../../core/pwa/install.service';
import { FontSizeToggleComponent } from '../../shared/font-size-toggle.component';
import { InstallCardComponent } from '../../shared/components/install-card/install-card.component';
import { SheetFrameComponent } from '../../shared/ui/sheet/sheet-frame.component';
import { DemoSectionComponent } from './demo-section.component';
import { PushSectionComponent } from './push-section.component';
import { TtsSectionComponent } from './tts-section.component';

/** sheet สั้นๆ ของหน้าตั้งค่า : แต่ละอันครอบ component เดิมด้วยกรอบ yt-sheet (ห้ามมี dialog ซ้อนใน sheet) */

@Component({
  selector: 'app-push-sheet',
  imports: [SheetFrameComponent, PushSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-sheet-frame title="แจ้งเตือนบนเครื่องนี้"><app-push-section /></app-sheet-frame>`,
})
export class PushSheetComponent {}

@Component({
  selector: 'app-tts-sheet',
  imports: [SheetFrameComponent, TtsSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-sheet-frame title="เสียงอ่าน"><app-tts-section /></app-sheet-frame>`,
})
export class TtsSheetComponent {}

@Component({
  selector: 'app-install-sheet',
  imports: [SheetFrameComponent, InstallCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.how { margin: 0; line-height: var(--yt-line-height); } .how + .how { margin-top: var(--yt-space-3); }`,
  template: `
    <app-sheet-frame title="ติดตั้งแอป">
      @if (svc.settingsMode()) {
        <app-install-card placement="settings" />
      } @else {
        <!-- เบราว์เซอร์ที่ไม่ส่งปุ่มติดตั้งให้ (เดสก์ท็อป, Chrome บน iPhone ฯลฯ) : บอกวิธีทั่วไป -->
        <p class="how">เปิดเมนูของเบราว์เซอร์ (ปุ่ม <strong>⋮</strong> หรือ <strong>แชร์</strong>) แล้วเลือก <strong>ติดตั้งแอป</strong> หรือ <strong>เพิ่มไปยังหน้าจอโฮม</strong> ค่ะ</p>
        <p class="how">บน iPhone ต้องเปิดจาก Safari เท่านั้นนะคะ</p>
      }
    </app-sheet-frame>
  `,
})
export class InstallSheetComponent { protected readonly svc = inject(InstallService); }

@Component({
  selector: 'app-demo-sheet',
  imports: [SheetFrameComponent, DemoSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-sheet-frame title="ทดลองส่งเตือน (โหมดเดโม)"><app-demo-section /></app-sheet-frame>`,
})
export class DemoSheetComponent {}

@Component({
  selector: 'app-display-sheet',
  imports: [SheetFrameComponent, FontSizeToggleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .hint { margin: 0 0 var(--yt-space-3); color: var(--yt-text-muted); }
    .sample { margin: var(--yt-space-3) 0 0; padding: var(--yt-space-3) var(--yt-space-4); border-radius: var(--yt-radius-sm); background: var(--yt-field-bg); }
    .cap { color: var(--yt-text-muted); font-weight: 600; }
  `,
  template: `
    <app-sheet-frame title="การแสดงผล">
      <p class="hint">ขนาดตัวอักษร</p>
      <app-font-size-toggle />
      <p class="sample"><span class="cap">ตัวอย่าง:</span>&ngsp;<strong>Metformin</strong> ครั้งละ <span class="num">1</span>&nbsp;เม็ด หลังอาหาร</p>
    </app-sheet-frame>
  `,
})
export class DisplaySheetComponent {}
