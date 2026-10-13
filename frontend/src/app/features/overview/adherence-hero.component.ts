import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MascotComponent } from '../../shared/components/mascot/mascot.component';
import { levelOf, toneOf } from './adherence-level';

const R = 52;
const C = 2 * Math.PI * R;

/** แถวบนของการ์ดภาพรวม: วงแหวนอัตรา 7 วัน (SVG, สีตามสเกลเดียวทั้งหน้า) + ข้อความน้องยาตรง + "กินแล้ว n จาก n ครั้ง" + น้องยาตรง */
@Component({
  selector: 'app-adherence-hero',
  imports: [MascotComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './adherence-hero.component.html',
  styleUrl: './adherence-hero.component.scss',
})
export class AdherenceHeroComponent {
  readonly rate = input.required<number | null>();
  readonly taken = input(0);
  readonly due = input(0);
  readonly days = input(7);
  /** กินครบติดกันกี่วัน — แสดงบรรทัดเล็กเมื่อ ≥ 2 */
  readonly streak = input(0);
  /** เชื่อม LINE แล้วหรือยัง (null = ไม่ทราบ) — มีผลกับข้อความเมื่ออัตราต่ำกว่า 50 */
  readonly linked = input<boolean | null>(null);

  protected readonly r = R;
  protected readonly level = computed(() => levelOf(this.rate(), this.linked()));
  protected readonly tone = computed(() => toneOf(this.rate()));
  protected readonly dash = computed(() => `${((this.rate() ?? 0) / 100) * C} ${C}`);
  protected readonly ringLabel = computed(() =>
    this.rate() === null ? `ยังไม่มีข้อมูลยาใน ${this.days()} วัน` : `กินครบ ${this.rate()} เปอร์เซ็นต์ ใน ${this.days()} วัน`);
}
