import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MascotComponent } from '../../../shared/components/mascot/mascot.component';

/** แถบแจ้งเตือนเรื่อง AI (โทนฟ้า info — ข้อมูลทั่วไป ไม่ใช่เหลือง/แดง) : น้องยาตรง S เป็นผู้พูด อยู่ใต้ขั้นตอนเสมอ ไม่ใช่ท้ายหน้า */
@Component({
  selector: 'app-scan-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MascotComponent],
  template: `
    <app-mascot mood="happy" size="s" />
    <p>น้องยาตรงช่วยอ่านซองยาให้นะคะ แต่อาจอ่านผิดได้ ตรวจทุกช่องก่อนบันทึกนะคะ</p>
  `,
  styles: `
    :host {
      display: flex; align-items: center; gap: var(--yt-space-3); padding: var(--yt-space-2) var(--yt-space-3);
      border-radius: var(--yt-radius-sm); background: var(--yt-info-soft); color: var(--yt-on-info-soft);
    }
    app-mascot { flex: none; }
    p { margin: 0; font-size: var(--yt-text-sm); font-weight: 500; line-height: var(--yt-line-height-tight); }
  `,
  host: { 'data-first-screen': 'ai-notice', role: 'note' },
})
export class ScanNoticeComponent {}
