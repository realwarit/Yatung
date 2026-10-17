import { ChangeDetectionStrategy, Component, ElementRef, effect, inject } from '@angular/core';
import { BannerService } from '../../../core/banner/banner.service';
import { IconComponent } from '../../icon.component';

/**
 * yt-banner: แถบบางบรรทัดเดียวด้านบน แสดงครั้งละ 1 แถบ (เลือกโดย BannerService) — อยู่ที่ App root จึงทำงานได้แม้ API/หน้าอื่นพัง
 * ความสูงที่แสดงจริงถูกเผยเป็น --yt-banner-h บน <html> ให้ Shell/หน้า auth ขยับลงตาม (ไม่บังเนื้อหา)
 * ปิดได้เฉพาะชนิดที่ dismissible
 */
@Component({
  selector: 'app-banner-host',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (svc.banner(); as b) {
      <div [class]="'bar tone-' + b.tone" [attr.data-banner]="b.kind" [attr.role]="b.kind === 'expired' ? 'alert' : 'status'">
        <app-icon [name]="b.icon" />
        <span class="txt">{{ b.text }}</span>
        @if (b.action) { <button type="button" class="yt-compact act" (click)="svc.act()">{{ b.action }}</button> }
        @if (b.dismissible) { <button type="button" class="x" [attr.aria-label]="b.closeLabel" (click)="svc.dismiss()"><app-icon name="close" /></button> }
      </div>
    }
  `,
  styleUrl: './banner-host.component.scss',
})
export class BannerHostComponent {
  protected readonly svc = inject(BannerService);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    let ro: ResizeObserver | null = null;
    const root = document.documentElement;
    const publish = () => {
      const on = !!this.svc.banner();
      root.style.setProperty('--yt-banner-h', on ? `${this.el.nativeElement.offsetHeight}px` : '0px');
      root.classList.toggle('has-banner', on);   // ให้หน้าที่ต้องลดความสูงส่วนหัวตอนมีแถบ (เช่น หัววันนี้บนจอเตี้ย) เลือกสไตล์ได้
    };
    effect((onCleanup) => {
      this.svc.banner();
      queueMicrotask(publish);
      if (typeof ResizeObserver !== 'undefined') { ro?.disconnect(); ro = new ResizeObserver(publish); ro.observe(this.el.nativeElement); }
      onCleanup(() => ro?.disconnect());
    });
  }
}
