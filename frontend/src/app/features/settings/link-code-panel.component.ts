import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { timer } from 'rxjs';
import { LinkCode } from '../../core/api/line.api';
import { IconComponent } from '../../shared/icon.component';

/**
 * แสดงรหัสเชื่อม LINE 6 หลัก + นับถอยหลัง + ปุ่มเปิด LINE + QR + ขั้นตอน 1-2-3
 * ใช้ซ้ำทั้งตอนเชื่อมของผู้ป่วยและตอนส่งรหัสให้ญาติ (`inviteText` มี = มีปุ่มคัดลอกข้อความเชิญ)
 */
@Component({
  selector: 'app-link-code-panel',
  imports: [MatButton, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (remaining() > 0) {
      <p class="lbl" id="code-lbl">รหัสเชื่อม LINE ของคุณ</p>
      <p class="code num" aria-labelledby="code-lbl">{{ spaced() }}</p>
      <p class="left" role="timer"><app-icon name="clock" /> หมดอายุใน <span class="num">{{ mmss() }}</span> นาที</p>

      @if (link().oa_message_url; as url) {
        <a mat-flat-button class="open" [href]="url" target="_blank" rel="noopener"><app-icon name="chat" /> เปิด LINE แล้วกดส่ง</a>
        @if (qr(); as src) {
          <figure class="qr">
            <img [src]="src" width="200" height="200" alt="คิวอาร์โค้ดสำหรับเปิด LINE พร้อมรหัสเชื่อมบัญชี" />
            <figcaption>หรือสแกน QR ด้วยมือถือเครื่องที่มี LINE</figcaption>
          </figure>
        }
      }
      @if (inviteText(); as t) {
        <button mat-stroked-button type="button" class="copy" (click)="copy(t)">
          <app-icon [name]="copied() ? 'check' : 'layers'" /> {{ copied() ? 'คัดลอกแล้ว' : 'คัดลอกข้อความเชิญส่งให้ญาติ' }}
        </button>
      }

      <ol class="steps">
        <li>@if (friendUrl(); as f) { <a [href]="f" target="_blank" rel="noopener">เพิ่มเพื่อน “ยาตรง” ใน LINE</a> } @else { เพิ่มเพื่อน “ยาตรง” ใน LINE }
          (ถ้าเพิ่มแล้วข้ามได้)</li>
        <li>เปิดแชทของน้องยาตรง แล้วกดส่งเลข 6 หลักข้างบน</li>
        <li>รอสักครู่ หน้านี้จะแจ้งว่าเชื่อมสำเร็จ</li>
      </ol>
    } @else {
      <p class="yt-alert yt-alert--danger" role="alert"><app-icon name="alert" /> <span>รหัสหมดอายุแล้ว กรุณาขอรหัสใหม่</span></p>
    }
  `,
  styles: `
    :host { display: block; }
    .lbl { margin: 0; color: var(--yt-text-muted); font-weight: 600; }
    .code { margin: var(--yt-space-1) 0; font-size: 3rem; line-height: 1.3; letter-spacing: 0.08em; color: var(--yt-primary-dark); }
    .left { display: flex; align-items: center; gap: var(--yt-space-2); margin: 0 0 var(--yt-space-4); color: var(--yt-text-muted); }
    .open, .copy { width: 100%; margin-bottom: var(--yt-space-3); }
    .qr { margin: var(--yt-space-3) 0; text-align: center; }
    .qr img { border-radius: var(--yt-radius-sm); border: 2px solid var(--yt-border); background: #fff; padding: var(--yt-space-2); }
    .qr figcaption { margin-top: var(--yt-space-2); font-size: var(--yt-text-sm); color: var(--yt-text-muted); }
    .steps { margin: var(--yt-space-3) 0 0; padding-left: 1.4em; }
    .steps li { margin-bottom: var(--yt-space-2); }
    .steps a { color: var(--yt-primary-dark); font-weight: 600; }
  `,
})
export class LinkCodePanelComponent {
  readonly link = input.required<LinkCode>();
  /** ข้อความเชิญที่คัดลอกได้ (เฉพาะส่งให้ญาติ) */
  readonly inviteText = input<string | null>(null);
  readonly expired = output<void>();

  private readonly endsAt = signal(0);
  private readonly tick = toSignal(timer(0, 1000), { initialValue: 0 });
  protected readonly remaining = computed(() => { this.tick(); return Math.max(0, Math.ceil((this.endsAt() - Date.now()) / 1000)); });
  protected readonly mmss = computed(() => { const r = this.remaining(); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; });
  protected readonly spaced = computed(() => { const c = this.link().code; return `${c.slice(0, 3)} ${c.slice(3)}`; });
  /** ลิงก์เพิ่มเพื่อนของ OA (แปลงจาก oaMessage) */
  protected readonly friendUrl = computed(() => this.link().oa_message_url?.replace('/oaMessage/', '/ti/p/').replace(/\/\?.*$/, '') ?? null);
  protected readonly qr = signal<string | null>(null);
  protected readonly copied = signal(false);

  constructor() {
    effect(() => { this.endsAt.set(Date.now() + this.link().expires_in * 1000); });
    effect(() => {
      const url = this.link().oa_message_url;
      this.qr.set(null);
      if (!url) return;
      import('qrcode').then((m) => m.toDataURL(url, { margin: 1, width: 400, errorCorrectionLevel: 'M' })).then((d) => this.qr.set(d)).catch(() => this.qr.set(null));
    });
    let fired = false;
    effect(() => {
      if (this.remaining() === 0 && this.endsAt() > 0 && !fired) { fired = true; this.expired.emit(); }
      if (this.remaining() > 0) fired = false;
    });
  }

  protected async copy(text: string): Promise<void> {
    try { await navigator.clipboard.writeText(text); this.copied.set(true); setTimeout(() => this.copied.set(false), 3000); } catch { /* ผู้ใช้เลือกคัดลอกเองได้ */ }
  }
}
