import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type MascotMood = 'wave' | 'happy' | 'thinking' | 'reminder' | 'celebrate' | 'sleepy' | 'worried';

export const MASCOT_MOODS: readonly MascotMood[] = ['wave', 'happy', 'thinking', 'reminder', 'celebrate', 'sleepy', 'worried'];

/** ข้อความสำหรับโปรแกรมอ่านหน้าจอ เมื่อมาสคอตสื่อความหมาย (decorative = false) */
export const MASCOT_LABELS: Record<MascotMood, string> = {
  wave: 'น้องยาตรงโบกมือทักทาย',
  happy: 'น้องยาตรงยิ้ม',
  thinking: 'น้องยาตรงกำลังคิด',
  reminder: 'น้องยาตรงถือกระดิ่งเตือน',
  celebrate: 'น้องยาตรงดีใจ',
  sleepy: 'น้องยาตรงง่วงนอน',
  worried: 'น้องยาตรงเป็นห่วง',
};

// แขนซ้าย/ขวา (เส้นโค้งจากไหล่) — ที่เหลือใช้ร่างกายชุดเดียวกัน
const ARM_DOWN = ['M56 120Q42 130 44 148', 'M144 120Q158 130 156 148'];
const ARMS: Record<MascotMood, readonly [string, string]> = {
  wave: [ARM_DOWN[0], 'M144 118Q168 110 166 82'],
  happy: [ARM_DOWN[0], ARM_DOWN[1]],
  thinking: [ARM_DOWN[0], 'M144 120Q154 142 128 150'],
  reminder: [ARM_DOWN[0], 'M144 118Q168 112 166 90'],
  celebrate: ['M56 116Q30 108 34 78', 'M144 116Q170 108 166 78'],
  sleepy: [ARM_DOWN[0], ARM_DOWN[1]],
  worried: ['M56 122Q56 148 78 156', 'M144 122Q144 148 122 156'],
};

/**
 * น้องยาตรง — มาสคอตแคปซูลตั้งตรง (วาดเองทั้งหมด) เป็น inline SVG ชุดเดียว
 * ร่างกายใช้ร่วมกัน เปลี่ยนเฉพาะหน้า แขน และของประกอบตาม mood
 * สีอ้างอิง token `--yt-mascot-*`; animation ปิดเมื่อ prefers-reduced-motion
 */
@Component({
  selector: 'app-mascot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mascot.component.html',
  styleUrl: './mascot.component.scss',
  host: { '[class.celebrate]': 'mood() === "celebrate"' },
})
export class MascotComponent {
  readonly mood = input<MascotMood>('happy');
  /** ความกว้างเป็นพิกเซล (ความสูง = 1.08 เท่า) */
  readonly size = input(160);
  /** true = ของตกแต่ง (aria-hidden) · false = สื่อความหมาย (role="img" + aria-label ภาษาไทย) */
  readonly decorative = input(true);
  /** ข้อความแทนค่าเริ่มต้นของ mood เมื่อ decorative = false */
  readonly label = input<string | null>(null);

  protected readonly height = computed(() => Math.round(this.size() * 1.08));
  protected readonly ariaLabel = computed(() => this.label() ?? MASCOT_LABELS[this.mood()]);
  protected readonly arms = computed(() => ARMS[this.mood()]);

  protected readonly sleepZ = ['M148 58h13l-13 15h13', 'M166 34h10l-10 11h10', 'M182 16h7l-7 8h7'];
  protected readonly bellRing = ['M144 52Q139 62 144 72', 'M188 52Q193 62 188 72'];
  // ตำแหน่งดาว (x, y, สเกล) และ confetti (x, y, หมุน, สี) ของ celebrate
  protected readonly stars = [[22, 52, 1.2], [176, 44, 1], [14, 118, 0.8], [188, 118, 0.8]];
  protected readonly confetti = [
    [58, 20, 25, 'cheek'], [148, 16, -20, 'top'], [100, 8, 60, 'sweat'], [190, 82, 40, 'cheek'], [8, 84, -35, 'sweat'],
  ];
}
