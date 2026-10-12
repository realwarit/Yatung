import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MascotComponent } from '../../shared/components/mascot/mascot.component';
import { IconComponent } from '../../shared/icon.component';
import { levelOf } from './adherence-level';

const R = 52;
const C = 2 * Math.PI * R;

/** การ์ดหลักของหน้าสรุป: วงแหวนอัตรา 7 วัน (SVG) + น้องยาตรง + ข้อความตามระดับ + ชิป "กินครบติดกัน" */
@Component({
  selector: 'app-adherence-hero',
  imports: [IconComponent, MascotComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './adherence-hero.component.html',
  styleUrl: './adherence-hero.component.scss',
})
export class AdherenceHeroComponent {
  readonly rate = input.required<number | null>();
  readonly taken = input(0);
  readonly due = input(0);
  readonly streak = input(0);
  readonly days = input(7);

  protected readonly r = R;
  protected readonly level = computed(() => levelOf(this.rate()));
  protected readonly dash = computed(() => `${((this.rate() ?? 0) / 100) * C} ${C}`);
  protected readonly ringLabel = computed(() =>
    this.rate() === null ? `ยังไม่มีข้อมูลยาใน ${this.days()} วัน` : `กินครบ ${this.rate()} เปอร์เซ็นต์ ใน ${this.days()} วัน`);
}
