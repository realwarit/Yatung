import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FontSizeToggleComponent } from '../../shared/font-size-toggle.component';
import { MASCOT_LABELS, MASCOT_MOODS, MascotComponent, MascotMood } from '../../shared/components/mascot/mascot.component';

const USAGE: Record<MascotMood, string> = {
  wave: 'หน้า Login / Register',
  happy: 'หน้าว่าง เช่น "ยังไม่มียาในตาราง"',
  thinking: 'AI กำลังอ่านซองยา',
  reminder: 'ถึงเวลากินยา',
  celebrate: 'กดกินแล้ว / adherence 100%',
  sleepy: 'มื้อก่อนนอน',
  worried: 'error · ลืมกินยา · ยาใกล้หมด',
  watching: 'โฟกัสช่องอีเมล (Login)',
  shy: 'โฟกัสช่องรหัสผ่าน (ปิดตา · [peek] แง้มนิ้วเมื่อกด "แสดงรหัส")',
};

/** หน้าตรวจมาสคอตทุก mood ทุกขนาด (เปิดเฉพาะ dev — ดู app.routes.ts) */
@Component({
  selector: 'app-mascot-showcase',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MascotComponent, FontSizeToggleComponent],
  template: `
    <header class="head">
      <h1 class="yt-title">น้องยาตรง <small>/dev/mascot</small></h1>
      <app-font-size-toggle />
    </header>

    <div class="grid">
      @for (m of moods; track m) {
        <section class="card">
          <h2>{{ m }} <span>{{ usage[m] }}</span></h2>
          @for (bg of ['light', 'dark']; track bg) {
            <div class="band" [class.band--dark]="bg === 'dark'">
              @for (s of sizes; track s) {
                <app-mascot [mood]="m" [size]="s" [decorative]="false" [label]="labels[m]" />
              }
            </div>
          }
        </section>
      }
      <section class="card">
        <h2>shy + peek <span>กด "แสดงรหัส"</span></h2>
        <div class="band"><app-mascot mood="shy" [peek]="true" [size]="96" /><app-mascot mood="shy" [peek]="true" [size]="200" /></div>
      </section>
    </div>
    <p class="yt-disclaimer">ไม่ใช่คำแนะนำทางการแพทย์</p>
  `,
  styles: `
    :host { display: block; padding: var(--yt-space-5) var(--yt-space-4); max-width: 80rem; margin: 0 auto; }
    .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--yt-space-3); margin-bottom: var(--yt-space-5); }
    .head h1 { margin: 0; }
    small { font-family: var(--yt-font-body); font-size: var(--yt-text-sm); color: var(--yt-text-muted); font-weight: 400; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr)); gap: var(--yt-space-4); }
    .card { padding: var(--yt-space-4); background: var(--yt-surface); border-radius: var(--yt-radius-md); box-shadow: var(--yt-shadow-sm); }
    h2 { margin: 0 0 var(--yt-space-3); font-size: var(--yt-text-lg); }
    h2 span { display: block; font-family: var(--yt-font-body); font-size: var(--yt-text-sm); font-weight: 400; color: var(--yt-text-muted); }
    .band { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--yt-space-4); padding: var(--yt-space-3); margin-top: var(--yt-space-2);
      border: 1px solid var(--yt-border); border-radius: var(--yt-radius-sm); background: var(--yt-surface); }
    .band--dark { background: var(--yt-primary); border-color: var(--yt-primary); }
  `,
})
export class MascotShowcasePage {
  protected readonly moods = MASCOT_MOODS;
  protected readonly sizes = [48, 96, 200];
  protected readonly usage = USAGE;
  protected readonly labels = MASCOT_LABELS;
}
