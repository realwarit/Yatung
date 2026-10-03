import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../../shared/icon.component';
import { MascotComponent, MascotMood } from '../../shared/components/mascot/mascot.component';
import { SpeechBubbleComponent } from '../../shared/components/speech-bubble/speech-bubble.component';

type Floater = { kind: 'pill' | 'pill2' | 'clock' | 'heart' | 'star'; x: number; y: number; size: number; dur: number; delay: number };

/** "เวทีของน้องยาตรง" ฝั่งซ้ายของหน้า Login/Register บนจอกว้าง */
@Component({
  selector: 'app-auth-stage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, MascotComponent, SpeechBubbleComponent],
  templateUrl: './auth-stage.component.html',
  styleUrl: './auth-stage.component.scss',
})
export class AuthStageComponent {
  readonly mood = input<MascotMood>('happy');
  readonly message = input.required<string>();
  readonly peek = input(false);

  // ตำแหน่งเป็น % ของเวที; อยู่รอบนอกของ blob
  protected readonly floaters: Floater[] = [
    { kind: 'pill', x: 6, y: 10, size: 2.6, dur: 6, delay: 0 },
    { kind: 'clock', x: 90, y: 26, size: 2.6, dur: 7, delay: -2 },
    { kind: 'heart', x: 3, y: 52, size: 2.2, dur: 5.5, delay: -1 },
    { kind: 'star', x: 94, y: 56, size: 2.2, dur: 4.5, delay: -3 },
    { kind: 'pill2', x: 12, y: 86, size: 2.4, dur: 6.5, delay: -4 },
    { kind: 'star', x: 82, y: 88, size: 1.6, dur: 5, delay: -2.5 },
  ];
}
