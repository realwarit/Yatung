import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MascotComponent, MascotMood } from '../../../shared/components/mascot/mascot.component';
import { SpeechBubbleComponent } from '../../../shared/components/speech-bubble/speech-bubble.component';

/** น้องยาตรง + กรอบคำพูด (คอลัมน์ขวาของหน้า Scan) */
@Component({
  selector: 'app-scan-coach',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MascotComponent, SpeechBubbleComponent],
  template: `
    <app-mascot class="mascot" [mood]="mood()" [size]="112" />
    <app-speech-bubble class="bubble" [text]="text()" tail="left" />
  `,
  styles: `
    :host { display: flex; align-items: center; gap: var(--yt-space-4); }
    .mascot { flex: none; }
    .bubble { flex: 1; min-width: 0; --pad-y: var(--yt-space-3); --pad-x: var(--yt-space-4); }
  `,
})
export class ScanCoachComponent {
  readonly mood = input<MascotMood>('happy');
  readonly text = input.required<string>();
}
