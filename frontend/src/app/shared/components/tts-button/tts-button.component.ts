import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TtsService } from '../../../core/tts/tts.service';
import { IconComponent } from '../../icon.component';

/**
 * ปุ่ม 🔊 อ่านออกเสียง — ตัวเดียวของทั้งแอป (Today, สรุป, ฟอร์มยา, ตั้งค่า)
 * - ไม่มีเสียงไทยในเครื่อง → ไม่แสดงเลย (ซ่อนทุกปุ่ม)
 * - กดแล้วเรียก `build()` + `speak()` แบบ synchronous ใน click handler เดียว (iOS ไม่ยอมให้มี await/setTimeout คั่น)
 * - กดซ้ำขณะกำลังอ่านปุ่มนี้ = หยุด ; ห้ามเล่นอัตโนมัติ (ไม่มีทางเรียกจากที่อื่นนอกจากการกด)
 */
@Component({
  selector: 'app-tts-button',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.big]': 'variant() === "big"', '[class.small]': 'variant() === "small"', '[class.inline]': 'variant() === "inline"' },
  template: `
    @if (tts.hasThai()) {
      <button type="button" class="btn" [class.on]="active()" [attr.aria-pressed]="active()" [attr.aria-label]="aria()" (click)="press()">
        <app-icon [name]="active() ? 'stop' : 'volume'" />
        <span>{{ active() ? 'หยุดอ่าน' : label() }}</span>
      </button>
    }
  `,
  styleUrl: './tts-button.component.scss',
})
export class TtsButtonComponent {
  protected readonly tts = inject(TtsService);

  /** ข้อความบนปุ่มตอนปกติ เช่น "ฟังยาที่ต้องกินวันนี้" */
  readonly label = input.required<string>();
  /** ประโยคเต็มสำหรับโปรแกรมอ่านหน้าจอ (ไม่ใส่ = ใช้ label) */
  readonly ariaLabel = input<string | null>(null);
  /** รหัสปุ่ม — ใช้ตัดสินว่า "ปุ่มนี้" กำลังอ่านอยู่ไหม */
  readonly ttsKey = input.required<string>();
  /** สร้างท่อนข้อความตอนกด (ไม่คำนวณล่วงหน้า) */
  readonly build = input.required<() => string[]>();
  readonly variant = input<'big' | 'small' | 'inline'>('small');

  protected readonly active = computed(() => this.tts.speaking() && this.tts.speakingKey() === this.ttsKey());
  protected readonly aria = computed(() => (this.active() ? 'หยุดอ่านออกเสียง' : (this.ariaLabel() ?? this.label())));

  protected press(): void {
    this.tts.toggle(this.ttsKey(), this.build()());   // synchronous ทั้งหมด — ห้ามเพิ่ม await/setTimeout ตรงนี้
  }
}
