import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { InstallService } from '../../../core/pwa/install.service';
import { IconComponent } from '../../icon.component';

/** การ์ด "ติดตั้งยาตรงไว้บนหน้าจอ" — Android: ปุ่มติดตั้ง · iPhone Safari: สอนแชร์ → เพิ่มไปยังหน้าจอโฮม ; ซ่อนเมื่อติดตั้งแล้ว/ใน Capacitor */
@Component({
  selector: 'app-install-card',
  imports: [MatButton, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (mode(); as m) {
      <section class="card yt-card" aria-labelledby="inst-h">
        <h2 id="inst-h"><app-icon name="phone" /> ติดตั้งยาตรงไว้บนหน้าจอ</h2>
        @if (m === 'native') {
          <p>เปิดแอปได้ในแตะเดียว เหมือนแอปทั่วไป และรับการแจ้งเตือนได้ง่ายขึ้นค่ะ</p>
          <div class="actions">
            <button mat-flat-button type="button" class="go" (click)="install()"><app-icon name="download" /> ติดตั้งแอป</button>
            <button mat-button type="button" class="later" (click)="svc.dismiss()">ไว้ทีหลัง</button>
          </div>
        } @else {
          <p>iPhone จะรับการแจ้งเตือนได้ <strong>ต่อเมื่อเพิ่มแอปลงหน้าจอโฮมก่อน</strong> ทำตามนี้ค่ะ</p>
          <ol class="steps">
            <li><span class="n num">1</span><span>แตะปุ่มแชร์ <span class="chip"><app-icon name="share" /> แชร์</span> ที่แถบด้านล่างของ Safari</span></li>
            <li><span class="n num">2</span><span>เลื่อนลงแล้วแตะ <span class="chip"><app-icon name="add-square" /> เพิ่มไปยังหน้าจอโฮม</span> แล้วแตะ "เพิ่ม"</span></li>
            <li><span class="n num">3</span><span>เปิดยาตรงจากไอคอนบนหน้าจอโฮม</span></li>
          </ol>
          <div class="actions"><button mat-button type="button" class="later" (click)="svc.dismiss()">ไว้ทีหลัง</button></div>
        }
      </section>
    }
  `,
  styleUrl: './install-card.component.scss',
})
export class InstallCardComponent {
  protected readonly svc = inject(InstallService);
  /** today = ครั้งเดียวหลัง login · settings = แสดงเสมอจนกว่าจะติดตั้ง */
  readonly placement = input.required<'today' | 'settings'>();
  /** หน้าวันนี้: เริ่มแสดงแล้วค้างไว้จนกดปิด/ติดตั้ง (ไม่หายเอง) แต่ไม่โผล่ซ้ำเมื่อกลับมาหน้านี้ในรอบ login เดียวกัน */
  private readonly latched = signal(false);
  protected readonly mode = () => (this.placement() === 'settings' ? this.svc.settingsMode() : this.latched() ? this.svc.todayModeNow() : null);

  constructor() {
    effect(() => {
      if (this.placement() === 'today' && !this.latched() && this.svc.todayMode()) { this.latched.set(true); this.svc.markTodayShown(); }
    });
  }

  protected async install(): Promise<void> { await this.svc.install(); }
}
