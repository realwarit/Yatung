import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FontScaleService } from '../../shared/font-scale.service';
import { ScreenMetrics, screenLines } from '../../core/diagnostics/screen-info';

/** "ข้อมูลจอ" (ส่วนผู้พัฒนาในหน้าตั้งค่า) — แสดงบนจอเท่านั้น ไม่ส่งเข้าเซิร์ฟเวอร์ ไม่ log ; กดค้างเพื่อเลือก/คัดลอกได้ */
@Component({
  selector: 'app-screen-info',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3 class="h">ข้อมูลจอ</h3>
    <p class="hint">ไว้เทียบเครื่องจริงกับภาพจำลอง — แสดงบนหน้าจอเท่านั้น ไม่ถูกส่งไปที่ใด กดค้างที่ข้อความเพื่อคัดลอกได้</p>
    <dl class="rows" aria-label="ข้อมูลจอของเครื่องนี้">
      @for (l of lines(); track l.label) {
        <div class="row"><dt>{{ l.label }}</dt><dd class="num">{{ l.value }}</dd></div>
      }
    </dl>
  `,
  styles: `
    :host { display: block; margin-bottom: var(--yt-space-4); padding-bottom: var(--yt-space-3); border-bottom: 1px solid var(--yt-border); }
    .h { margin: 0 0 var(--yt-space-2); font-size: var(--yt-text-body); }
    .hint { margin: 0 0 var(--yt-space-3); color: var(--yt-text-muted); }
    .rows { margin: 0; user-select: all; -webkit-user-select: all; }
    .row { display: flex; flex-wrap: wrap; gap: 0 var(--yt-space-2); justify-content: space-between; padding: var(--yt-space-2) 0; border-bottom: 1px solid var(--yt-border); }
    dt { flex: 1 1 14rem; }
    dd { margin: 0; font-weight: 600; }
  `,
})
export class ScreenInfoComponent implements OnInit {
  private readonly scale = inject(FontScaleService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly lines = signal(screenLines(this.read()));

  ngOnInit(): void {
    const upd = () => this.lines.set(screenLines(this.read()));
    window.addEventListener('resize', upd);
    window.visualViewport?.addEventListener('resize', upd);
    this.destroyRef.onDestroy(() => { window.removeEventListener('resize', upd); window.visualViewport?.removeEventListener('resize', upd); });
    queueMicrotask(upd);   // ปุ่มหลักของหน้าเรนเดอร์เสร็จแล้วค่อยวัด
    setTimeout(upd, 400);
  }

  private read(): ScreenMetrics {
    const primary = document.querySelector<HTMLElement>('.mat-mdc-unelevated-button, ion-button.yt-btn:not([fill="outline"])');
    return {
      innerWidth: window.innerWidth,
      visualViewportWidth: window.visualViewport?.width ?? null,
      devicePixelRatio: window.devicePixelRatio,
      rootFontPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
      fontScale: this.scale.scale(),
      primaryButtonPx: primary ? parseFloat(getComputedStyle(primary).fontSize) : null,
      userAgent: navigator.userAgent,
    };
  }
}
