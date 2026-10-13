import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MascotComponent, MascotMood } from '../../../shared/components/mascot/mascot.component';

/** ข้อความของน้องยาตรง S ตอนอ่านซองไม่สำเร็จ (worried) — ใช้เฉพาะสถานะ error ; สถานะอื่นไม่มีกล่องคำพูดซ้ำกับคำแนะนำ */
@Component({
  selector: 'app-scan-coach',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MascotComponent],
  template: `
    <app-mascot [mood]="mood()" size="s" />
    <p role="alert">{{ text() }}</p>
  `,
  styles: `
    :host { display: flex; align-items: center; gap: var(--yt-space-3); padding: var(--yt-space-3); border-radius: var(--yt-radius-sm); background: var(--yt-danger-soft); color: var(--yt-on-danger-soft); }
    app-mascot { flex: none; }
    p { flex: 1; min-width: 0; margin: 0; font-weight: 500; line-height: var(--yt-line-height-tight); }
  `,
})
export class ScanCoachComponent {
  readonly mood = input<MascotMood>('worried');
  readonly text = input.required<string>();
}
