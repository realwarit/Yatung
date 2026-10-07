import { ChangeDetectionStrategy, Component, input, output, viewChild } from '@angular/core';
import { IonButton, IonChip, IonIcon, IonTextarea } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { sparklesOutline } from 'ionicons/icons';
import { insertAtCursor } from '../text-insert';

export const MAX_TEXT = 1000;
const PHRASES = [
  'ครั้งละ 1 เม็ด', 'ครั้งละ ½ เม็ด', 'วันละ 2 ครั้ง', 'วันละ 3 ครั้ง', 'ก่อนอาหาร', 'หลังอาหาร',
  'เช้า', 'กลางวัน', 'เย็น', 'ก่อนนอน', 'เมื่อมีอาการ',
];
const EXAMPLE = 'Metformin 500 mg ครั้งละ 1 เม็ด วันละ 2 ครั้ง หลังอาหาร เช้า-เย็น';

/**
 * โหมดพิมพ์เอง — ใช้ Ionic: ion-textarea, ion-chip, ion-button, ion-icon
 * chip กดแล้วเติมคำที่ตำแหน่ง cursor (เว้นวรรคให้อัตโนมัติ)
 */
@Component({
  selector: 'app-scan-text-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonTextarea, IonChip, IonButton, IonIcon],
  template: `
    <p class="yt-label" aria-hidden="true">ข้อความบนซองยา</p>
    <ion-textarea
      #ta
      class="manual"
      fill="outline"
      aria-label="ข้อความบนซองยา"
      placeholder="เช่น Metformin 500 mg ครั้งละ 1 เม็ด วันละ 2 ครั้ง หลังอาหาร เช้า-เย็น"
      [autoGrow]="true"
      [rows]="6"
      [maxlength]="max"
      [disabled]="disabled()"
      [value]="text()"
      (ionInput)="textChange.emit($any($event.detail.value) ?? '')"
    ></ion-textarea>
    <div class="meta">
      @if (!text() && !disabled()) {
        <ion-button class="example" fill="clear" size="small" (click)="useExample()">
          <ion-icon slot="start" name="sparkles-outline"></ion-icon>ใส่ตัวอย่าง
        </ion-button>
      }
      <span class="count num" [class.near]="text().length > max - 50">{{ text().length }} / {{ max }}</span>
    </div>
    @if (!disabled()) {
      <p class="chips-title">คำที่ใช้บ่อย — กดเพื่อเติม</p>
      <div class="chips" role="group" aria-label="คำที่ใช้บ่อย">
        @for (p of phrases; track p) {
          <ion-chip role="button" tabindex="0" (click)="add(p)"
                    (keydown.enter)="add(p)" (keydown.space)="$event.preventDefault(); add(p)">{{ p }}</ion-chip>
        }
      </div>
    }
  `,
  styleUrl: './scan-text-input.component.scss',
})
export class ScanTextInputComponent {
  readonly text = input('');
  readonly disabled = input(false);
  readonly textChange = output<string>();

  protected readonly max = MAX_TEXT;
  protected readonly phrases = PHRASES;
  private readonly ta = viewChild.required<IonTextarea>('ta');

  constructor() { addIcons({ sparklesOutline }); }

  protected useExample(): void {
    this.textChange.emit(EXAMPLE);
  }

  /** เติมคำที่ตำแหน่ง cursor ปัจจุบัน แล้วคืน cursor ไว้หลังคำที่เติม */
  protected async add(phrase: string): Promise<void> {
    const el = await this.ta().getInputElement();
    const cur = this.text();
    const r = insertAtCursor(cur, el.selectionStart ?? cur.length, el.selectionEnd ?? cur.length, phrase, MAX_TEXT);
    if (r.text === cur) return;
    this.textChange.emit(r.text);
    await this.ta().setFocus();
    setTimeout(() => el.setSelectionRange(r.caret, r.caret));   // รอ Ionic เขียนค่าใหม่ลง textarea ก่อน
  }
}
