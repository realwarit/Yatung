import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MascotComponent } from '../../components/mascot/mascot.component';
import { SpeechBubbleComponent } from '../../components/speech-bubble/speech-bubble.component';

/**
 * หน้าว่างแบบเดียวทั้งแอป (ยาของฉัน / วันนี้ที่ยังไม่มียา) : น้องยาตรง L (M เมื่อจอเตี้ย) + กล่องคำพูด (หางชี้ขึ้น) + ปุ่มคู่แถวเดียวกัน
 * ปุ่มส่งเข้ามาเป็น content (ใส่ `fitGroup`/`fitLabel` เองเพื่อให้ย่อเป็นป้ายสั้นเมื่อแคบ) ; จัดกลางพื้นที่ระหว่างหัวหน้ากับแถบเมนู
 */
@Component({
  selector: 'app-empty-state',
  imports: [MascotComponent, SpeechBubbleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'yt-enter', '[style.--yt-empty-reserve]': 'reserve()' },
  template: `
    <span class="mascot"><app-mascot mood="wave" [fluid]="true" /></span>
    <app-speech-bubble class="say" tail="up" [typing]="false" [live]="true" tone="info" [text]="text()" />
    <div class="yt-fitrow btns"><ng-content /></div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--yt-space-4);
      min-height: calc(100dvh - var(--yt-bottom-clearance) - var(--yt-empty-reserve, 11rem)); padding-bottom: var(--yt-space-4); }
    .mascot { width: 112px; flex: none; }
    .say, .btns { width: 100%; max-width: 22rem; }
    @media (max-height: 739.98px) { .mascot { width: 56px; } }
    @media (min-width: 1024px) { :host { min-height: 60dvh; } }
  `,
})
export class EmptyStateComponent {
  /** ข้อความในกล่องคำพูด (ประโยคละบรรทัดด้วย \n) */
  readonly text = input.required<string>();
  /** ความสูงที่เหลือเผื่อให้หัวหน้า (ค่าเริ่มต้น = หัวแบบมีปุ่มด้านขวา ยาของฉัน ; วันนี้ใช้หัวทักทายบรรทัดเดียว จึงเผื่อน้อยกว่า) เพื่อให้เนื้อหาอยู่กลางพื้นที่ที่เหลือ */
  readonly reserve = input('11rem');
}
