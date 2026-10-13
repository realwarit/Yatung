import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { splitRef } from '../../../core/api/error-ref';

/** ข้อความ error + รหัสอ้างอิง "(E-304)" ต่อท้ายแบบตัวเล็กสีจาง (ไม่ให้ดูน่ากลัว แต่ยังอ่านออกเมื่อต้องแจ้ง) */
@Component({
  selector: 'app-err-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ parts().text }}@if (parts().ref; as r) { <small class="ref"> ({{ r }})</small> }`,
  styles: `.ref { font-size: 0.8em; opacity: 0.8; white-space: nowrap; }`,
})
export class ErrTextComponent {
  readonly text = input.required<string>();
  protected readonly parts = computed(() => splitRef(this.text()));
}
