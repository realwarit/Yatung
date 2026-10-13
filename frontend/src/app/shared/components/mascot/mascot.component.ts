import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type MascotMood =
  | 'wave' | 'happy' | 'thinking' | 'reminder' | 'celebrate' | 'sleepy' | 'worried'
  | 'watching' | 'shy';

export const MASCOT_MOODS: readonly MascotMood[] = ['wave', 'happy', 'thinking', 'reminder', 'celebrate', 'sleepy', 'worried', 'watching', 'shy'];

/** ข้อความสำหรับโปรแกรมอ่านหน้าจอ เมื่อมาสคอตสื่อความหมาย (decorative = false) */
export const MASCOT_LABELS: Record<MascotMood, string> = {
  wave: 'น้องยาตรงโบกมือทักทาย',
  happy: 'น้องยาตรงยิ้ม',
  thinking: 'น้องยาตรงกำลังคิด',
  reminder: 'น้องยาตรงถือกระดิ่งเตือน',
  celebrate: 'น้องยาตรงดีใจ',
  sleepy: 'น้องยาตรงง่วงนอน',
  worried: 'น้องยาตรงเป็นห่วง',
  watching: 'น้องยาตรงเหลือบมอง',
  shy: 'น้องยาตรงเขินอาย',
};

// แขนซ้าย/ขวา (เส้นโค้งจากไหล่) — ที่เหลือใช้ร่างกายชุดเดียวกัน
/** ขนาดมาตรฐาน 8D (px): S = ผู้พูดในแถบ/หัวการ์ด · M = Login/Register/การ์ดหลักสรุป · L = ช่วงพิเศษเท่านั้น (กินครบวัน, หน้าว่าง, บันทึกสำเร็จ) */
export const MASCOT_SIZES = { s: 36, m: 56, l: 112 } as const;
export type MascotSize = keyof typeof MASCOT_SIZES;

/** ท่าที่อ่านออกที่ 36px (ตรวจภาพแล้ว: มีของประกอบ/สีหน้าต่างชัด) — wave/watching/shy แยกจาก happy ไม่ออก ใช้ที่ M ขึ้นไปเท่านั้น */
export const MASCOT_S_MOODS: readonly MascotMood[] = ['happy', 'worried', 'thinking', 'reminder', 'celebrate', 'sleepy'];

const ARM_DOWN = ['M56 120Q42 130 44 148', 'M144 120Q158 130 156 148'];
const ARMS: Record<MascotMood, readonly [string, string]> = {
  wave: [ARM_DOWN[0], 'M144 118Q168 110 166 82'],
  happy: [ARM_DOWN[0], ARM_DOWN[1]],
  thinking: [ARM_DOWN[0], 'M144 120Q154 142 128 150'],
  reminder: [ARM_DOWN[0], 'M144 118Q168 112 166 90'],
  celebrate: ['M56 116Q30 108 34 78', 'M144 116Q170 108 166 78'],
  sleepy: [ARM_DOWN[0], ARM_DOWN[1]],
  worried: ['M56 122Q56 148 78 156', 'M144 122Q144 148 122 156'],
  watching: [ARM_DOWN[0], ARM_DOWN[1]],
  shy: ['M54 126Q60 140 82 123', 'M146 126Q140 140 118 123'],   // มือปิดตา
};
// shy + peek: มือยกสูงขึ้น เหลือตาโผล่ใต้นิ้ว
const SHY_PEEK: readonly [string, string] = ['M54 124Q62 128 82 112', 'M146 124Q138 128 118 112'];
// grip: มือเกาะขอบการ์ด (ใช้ตอนน้องโผล่หน้าจากหลังการ์ดบนมือถือ) — ปลายแขนอยู่ที่ y≈146 ใกล้เส้นตัดของ wrapper
const GRIP: readonly [string, string] = ['M56 118Q34 118 36 146', 'M144 118Q166 118 164 146'];
const GRIP_RIGHT_MOODS: readonly MascotMood[] = ['happy', 'watching', 'sleepy', 'worried'];
// ตาเหลือบไปทาง (x, y) ในหน่วยพิกัด SVG
const LOOK: Partial<Record<MascotMood, readonly [number, number]>> = { thinking: [3, -5], watching: [5, 2] };
// ที่ขนาดเล็ก (≤ 64px) ตาที่เหลือบ 5 หน่วยเหลือแค่ ~1.4px จนดูเหมือน happy → ขยายระยะเหลือบ (ตรวจภาพที่ 56px แล้ว: tools/auth-mascot-check.mjs)
const SMALL_LOOK_PX = 64;
const SMALL_LOOK_GAIN = 2.2;

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
  host: { '[class.celebrate]': 'mood() === "celebrate"', '[class.fluid]': 'fluid()', '[attr.data-mood]': 'mood()' },
})
export class MascotComponent {
  readonly mood = input<MascotMood>('happy');
  /** ความกว้างเป็นพิกเซล (ความสูง = 1.08 เท่า) หรือขนาดมาตรฐาน 's' | 'm' | 'l' (36/56/112) */
  readonly size = input<number | MascotSize>(160);
  /** true = ขยายเต็มความกว้างของกล่องที่ครอบ (ใช้ขนาดจาก CSS แทน size) */
  readonly fluid = input(false);
  /** mood shy: true = แง้มนิ้วแอบมอง */
  readonly peek = input(false);
  /** true = มือสองข้างเกาะขอบด้านล่าง (ใช้คู่กับ wrapper ที่ตัดภาพ) */
  readonly grip = input(false);
  /** true = ของตกแต่ง (aria-hidden) · false = สื่อความหมาย (role="img" + aria-label ภาษาไทย) */
  readonly decorative = input(true);
  /** ข้อความแทนค่าเริ่มต้นของ mood เมื่อ decorative = false */
  readonly label = input<string | null>(null);

  protected readonly px = computed(() => { const s = this.size(); return typeof s === 'number' ? s : MASCOT_SIZES[s]; });
  protected readonly height = computed(() => Math.round(this.px() * 1.08));
  protected readonly ariaLabel = computed(() => this.label() ?? MASCOT_LABELS[this.mood()]);
  protected readonly look = computed(() => {
    const v = LOOK[this.mood()];
    if (!v) return 'none';
    const g = this.px() <= SMALL_LOOK_PX ? SMALL_LOOK_GAIN : 1;
    return `translate(${v[0] * g}px, ${v[1] * g}px)`;
  });
  protected readonly showEyes = computed(() => this.mood() !== 'shy' || this.peek());
  protected readonly arms = computed<readonly [string, string]>(() => {
    const m = this.mood();
    if (m === 'shy') return this.peek() ? SHY_PEEK : ARMS.shy;
    const [l, r] = ARMS[m];
    if (!this.grip()) return [l, r];
    return [m === 'celebrate' ? l : GRIP[0], GRIP_RIGHT_MOODS.includes(m) ? GRIP[1] : r];
  });
  protected path(d: string): string { return `path("${d}")`; }

  protected readonly sleepZ = ['M148 58h13l-13 15h13', 'M166 34h10l-10 11h10', 'M182 16h7l-7 8h7'];
  protected readonly bellRing = ['M144 52Q139 62 144 72', 'M188 52Q193 62 188 72'];
  // ตำแหน่งดาว (x, y, สเกล) และ confetti (x, y, หมุน, สี) ของ celebrate
  protected readonly stars = [[22, 52, 1.2], [176, 44, 1], [14, 118, 0.8], [188, 118, 0.8]];
  protected readonly confetti = [
    [58, 20, 25, 'cheek'], [148, 16, -20, 'top'], [100, 8, 60, 'sweat'], [190, 82, 40, 'cheek'], [8, 84, -35, 'sweat'],
  ];
}
