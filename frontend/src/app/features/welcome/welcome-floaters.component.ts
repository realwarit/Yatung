import { ChangeDetectionStrategy, Component } from '@angular/core';

/** ของลอย: ตำแหน่ง x (% ของความกว้างฉาก) · dy = ระยะลงจากขอบบนของกล่องน้องยาตรง (หน่วยของกล่อง 200px — ยึดกับตัวน้องไม่ยึดกับ % ของจอ จึงไม่ทับชื่อ/คำโปรยที่อยู่เหนือน้อง) · ชนิด · หน่วงตอนเด้งเข้า · ท่าลอยต่อเนื่อง (วินาที) */
interface Floater { x: number; dy: number; y?: number; kind: 'cap-pink' | 'cap-mint' | 'pill' | 'heart' | 'star'; pop: number; loop: 'bob' | 'orbit' | 'orbit-rev'; dur: number; delay: number }

/** ของลอย 5 ชิ้นของหน้าต้อนรับ (ตกแต่งล้วน) — ยึดกับตัวน้องยาตรง (`--hill-h`/`--mw` จากหน้า) ไม่ยึดกับ % ของจอ */
@Component({
  selector: 'app-welcome-floaters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
  @for (f of floaters; track $index) {
    <div class="fl" [class.strip]="f.y != null" [style.left.%]="f.x" [style.--dy]="f.dy" [style.top.%]="f.y" [style.bottom]="f.y == null ? null : 'auto'" [style.animation-delay.s]="f.pop">
      <div [class]="'lp ' + f.loop" [style.animation-duration.s]="f.dur" [style.animation-delay.s]="f.delay">
        @switch (f.kind) {
          @case ('cap-pink') { <svg class="cap rot-l" width="46" height="22" viewBox="-1 -1 46 22"><path class="c1" d="M10 0H22V20H10A10 10 0 0 1 10 0Z"/><path class="c2" d="M22 0H34A10 10 0 0 1 34 20H22Z"/><rect x="0" y="0" width="44" height="20" rx="10"/></svg> }
          @case ('cap-mint') { <svg class="cap rot-r mint" width="30" height="20" viewBox="-1 -1 46 22"><path class="c1" d="M10 0H22V20H10A10 10 0 0 1 10 0Z"/><path class="c2" d="M22 0H34A10 10 0 0 1 34 20H22Z"/><rect x="0" y="0" width="44" height="20" rx="10"/></svg> }
          @case ('pill') { <svg class="pill" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="12"/><path class="shine" d="M8.5 13Q9.5 9.5 13 8.2"/></svg> }
          @case ('heart') { <svg class="heart" width="30" height="28" viewBox="2 2 20 20"><path d="M12 20s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 5.8-8 11-8 11z"/></svg> }
          @case ('star') { <svg class="fstar" width="24" height="24" viewBox="-14 -14 28 28"><path d="M0-11L3.5-3.5L11 0L3.5 3.5L0 11L-3.5 3.5L-11 0L-3.5-3.5Z"/></svg> }
        }
      </div>
    </div>
  }
  `,
  styleUrl: './welcome-floaters.component.scss',
})
export class WelcomeFloatersComponent {
  protected readonly floaters: Floater[] = [
    { x: 6.3, dy: 4, kind: 'cap-pink', pop: 2.2, loop: 'bob', dur: 6, delay: 2.8 },
    { x: 84, dy: 50, kind: 'pill', pop: 2.35, loop: 'orbit', dur: 5, delay: 2.9 },
    { x: 8.9, dy: 84, kind: 'heart', pop: 2.5, loop: 'bob', dur: 5.5, delay: 3.1 },
    { x: 80, dy: 104, kind: 'cap-mint', pop: 2.65, loop: 'bob', dur: 6.5, delay: 3.3 },
    { x: 33, dy: 0, y: 10, kind: 'star', pop: 2.8, loop: 'orbit-rev', dur: 7, delay: 3.4 },   // y = % จากบน (แถบเหนือชื่อ)
  ];
}
