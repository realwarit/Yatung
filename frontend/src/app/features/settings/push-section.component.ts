import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { errorText } from '../../core/api/api-error';
import { LineApi } from '../../core/api/line.api';
import { PushApi } from '../../core/api/push.api';
import { PushService } from '../../core/push/push.service';
import { Router } from '@angular/router';
import { MascotComponent } from '../../shared/components/mascot/mascot.component';
import { SegmentedComponent, SegmentedOption } from '../../shared/components/segmented/segmented.component';
import { SpeechBubbleComponent } from '../../shared/components/speech-bubble/speech-bubble.component';
import { injectSheetClose } from '../../shared/ui/sheet/sheet.service';
import { IconComponent } from '../../shared/icon.component';

/** ส่วน "แจ้งเตือนบนเครื่องนี้" (Web Push) : 5 สถานะ ไม่รองรับ / ต้องเพิ่มลงหน้าจอโฮมก่อน / ยังไม่เปิด / เปิดแล้ว / ถูกบล็อก */
@Component({
  selector: 'app-push-section',
  imports: [MatButton, SegmentedComponent, IconComponent, MascotComponent, SpeechBubbleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (push.state()) {
      @case ('native') {
        <!-- แอป Android: ไม่ใช้แจ้งเตือนบนเครื่อง การเตือนกินยาและแจ้งญาติมาทาง LINE -->
        <div class="perch">
          <app-mascot mood="happy" [size]="56" />
          <app-speech-bubble class="b" tail="left-low" [typing]="false" [live]="true" tone="info"
            text="แอปนี้ส่งเตือนกินยาทาง LINE นะคะ&#10;เชื่อม LINE ไว้ น้องจะเตือนให้ค่ะ" />
        </div>
        <button mat-flat-button type="button" class="full go" (click)="goLine()"><app-icon name="chat" /> ไปหน้าเชื่อม LINE</button>
      }
      @case ('unsupported') {
        <p class="yt-alert" role="status"><app-icon name="info" /> <span>เครื่องหรือเบราว์เซอร์นี้ยังรับการแจ้งเตือนจากแอปไม่ได้ค่ะ ไม่เป็นไร — ยังใช้แอปดูตารางยา และรับการเตือนทาง LINE ได้ตามปกติ</span></p>
        <p class="hint">ถ้าอยากได้การแจ้งเตือนบนเครื่อง ลองเปิดแอปนี้ด้วย Chrome (Android) หรือติดตั้งแอปลงหน้าจอโฮม</p>
      }
      @case ('needs-install') {
        <p class="hint">iPhone/iPad จะรับการแจ้งเตือนได้ต่อเมื่อเพิ่มแอปลงหน้าจอโฮมก่อน (ต้องเป็น iOS 16.4 ขึ้นไป) ทำตามนี้ค่ะ</p>
        <ol class="steps">
          <li><span class="n num">1</span><span>แตะปุ่มแชร์ <span class="chip"><app-icon name="share" /> แชร์</span> ที่แถบด้านล่างของ Safari</span></li>
          <li><span class="n num">2</span><span>เลื่อนลงแล้วแตะ <span class="chip"><app-icon name="add-square" /> เพิ่มลงหน้าจอโฮม</span> จากนั้นแตะ "เพิ่ม"</span></li>
          <li><span class="n num">3</span><span>เปิดแอป "ยาตรง" จากไอคอนบนหน้าจอโฮม แล้วกลับมาที่หน้านี้ เพื่อกด "เปิดการแจ้งเตือน"</span></li>
        </ol>
      }
      @case ('blocked') {
        <p class="yt-alert yt-alert--danger" role="alert"><app-icon name="alert" /> <span>การแจ้งเตือนของแอปนี้ถูกปิดกั้นไว้ในเครื่อง ต้องไปเปิดที่ตั้งค่าของเครื่องก่อนค่ะ</span></p>
        <ul class="how">
          <li><strong>Android (Chrome)</strong> แตะไอคอนข้างชื่อเว็บ → การอนุญาต → การแจ้งเตือน → อนุญาต</li>
          <li><strong>iPhone</strong> ตั้งค่า → การแจ้งเตือน → ยาตรง → เปิด "อนุญาตการแจ้งเตือน"</li>
        </ul>
        <button mat-stroked-button type="button" class="full" (click)="push.refresh()">ตรวจสอบอีกครั้ง</button>
      }
      @case ('off') {
        <p class="hint">รับการเตือนกินยาเป็นแจ้งเตือนบนเครื่องนี้ โดยไม่ต้องเปิดแอป แตะที่แจ้งเตือนเพื่อดูและบันทึกว่ากินแล้ว</p>
        @if (push.notConfigured()) {
          <p class="yt-alert yt-alert--danger" role="alert"><app-icon name="alert" /> <span>ระบบยังไม่ได้ตั้งค่าการแจ้งเตือนบนเครื่อง กรุณาแจ้งผู้ดูแลระบบค่ะ</span></p>
        } @else {
          <button mat-flat-button type="button" class="full" [disabled]="push.busy() || !push.publicKey()" (click)="push.enable()">
            <app-icon name="bell" /> {{ push.busy() ? 'กำลังเปิด…' : 'เปิดการแจ้งเตือน' }}
          </button>
        }
      }
      @case ('enabled') {
        <p class="ok" role="status"><app-icon name="check" /> <span>เปิดการแจ้งเตือนบนเครื่องนี้แล้ว</span></p>
        <button mat-flat-button type="button" class="full" [disabled]="push.busy()" (click)="push.sendTest()">
          <app-icon name="bell" /> {{ push.busy() ? 'กำลังส่ง…' : 'ทดลองส่งแจ้งเตือน' }}
        </button>
        @if (lineLinked()) {
          <div class="both" [class.busy]="notifyBusy()">
            <p class="both__t" id="push-mode-label">ช่องทางที่ให้เตือน</p>
            <app-segmented [options]="modes" [value]="notifyBoth() ? 'both' : 'line'" (valueChange)="setBoth($event === 'both')" label="ช่องทางที่ให้เตือน" />
            <p class="hint">เลือก "ทั้ง LINE และเครื่อง" ถ้าอยากได้ข้อความเตือนทั้งสองที่ (จะมาซ้ำกันสองที่)</p>
          </div>
        } @else {
          <p class="hint">ยังไม่ได้เชื่อม LINE — การเตือนจะมาทางแจ้งเตือนบนเครื่องนี้</p>
        }
        <button mat-stroked-button type="button" class="full off" [disabled]="push.busy()" (click)="push.disable()">ปิดการแจ้งเตือน</button>
      }
    }
    @if (push.info(); as i) { <p class="yt-alert" role="status"><app-icon name="check" /> <span>{{ i }}</span></p> }
    @if (push.error() ?? notifyError(); as e) { <p class="yt-alert yt-alert--danger" role="alert"><app-icon name="alert" /> <span>{{ e }}</span></p> }
  `,
  styles: `
    :host { display: block; }
    .hint { margin: 0 0 var(--yt-space-3); color: var(--yt-text-muted); }
    .full { width: 100%; }
    .perch { display: flex; align-items: flex-end; gap: var(--yt-space-3); margin-bottom: var(--yt-space-4); }
    .perch app-mascot { flex: none; }
    .perch .b { flex: 1; min-width: 0; }
    .off { margin-top: var(--yt-space-3); }
    .ok { display: flex; align-items: flex-start; gap: var(--yt-space-2); margin: 0 0 var(--yt-space-3); font-weight: 700; color: var(--yt-success); font-size: 1.15rem; text-wrap: balance; }
    .ok app-icon { margin-top: 0.3em; }
    .yt-alert { margin: var(--yt-space-3) 0 0; }
    .steps { list-style: none; margin: 0 0 var(--yt-space-2); padding: 0; display: flex; flex-direction: column; gap: var(--yt-space-3); }
    .steps li { display: flex; align-items: flex-start; gap: var(--yt-space-3); }
    .n { flex: none; width: 2.2rem; height: 2.2rem; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--yt-primary); color: #fff; font-size: 1.1rem; }
    .chip { display: inline-flex; align-items: center; gap: 0.3em; padding: 0 0.5em; border-radius: var(--yt-radius-pill); background: var(--yt-field-bg); border: 1px solid var(--yt-border-strong); font-weight: 600; white-space: nowrap; }
    .how { margin: 0 0 var(--yt-space-3); padding-left: 1.2em; display: flex; flex-direction: column; gap: var(--yt-space-2); }
    .both { margin: var(--yt-space-4) 0 var(--yt-space-2); padding: var(--yt-space-3); border-radius: var(--yt-radius-sm); background: var(--yt-field-bg); }
    .both.busy { opacity: 0.6; pointer-events: none; }
    .both__t { margin: 0 0 var(--yt-space-2); font-weight: 600; }
    .both .hint { margin: var(--yt-space-2) 0 0; }
  `,
})
export class PushSectionComponent implements OnInit {
  protected push = inject(PushService);
  private router = inject(Router);
  private closeSheet = injectSheetClose();
  private pushApi = inject(PushApi);
  private lineApi = inject(LineApi);

  protected readonly modes: SegmentedOption[] = [{ value: 'line', label: 'LINE อย่างเดียว' }, { value: 'both', label: 'ทั้ง LINE และเครื่อง' }];
  protected readonly lineLinked = signal(false);
  protected readonly notifyBoth = signal(false);
  protected readonly notifyBusy = signal(false);
  protected readonly notifyError = signal<string | null>(null);

  ngOnInit(): void {
    void this.push.refresh();
    this.lineApi.status().subscribe({ next: (s) => this.lineLinked.set(s.linked), error: () => this.lineLinked.set(false) });
    this.pushApi.notify().subscribe({ next: (n) => this.notifyBoth.set(n.notify_both === true), error: () => { /* ซ่อนสวิตช์ได้ ไม่ใช่เรื่องสำคัญ */ } });
  }

  /** ปิด sheet ก่อนแล้วค่อยเปลี่ยนหน้า (ห้ามเปลี่ยนหน้าทั้งที่ sheet ยังเปิด) */
  protected goLine(): void {
    this.closeSheet();
    void this.router.navigateByUrl('/settings/line');
  }

  protected setBoth(on: boolean): void {
    this.notifyBusy.set(true);
    this.notifyError.set(null);
    this.pushApi.setNotifyBoth(on).subscribe({
      next: (r) => { this.notifyBusy.set(false); this.notifyBoth.set(r.notify_both === true); },
      error: (e) => { this.notifyBusy.set(false); this.notifyBoth.set(!on); this.notifyError.set(errorText(e)); },
    });
  }
}
