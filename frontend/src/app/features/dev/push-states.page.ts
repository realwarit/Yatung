import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, inject, signal } from '@angular/core';
import { PushService, PushState } from '../../core/push/push.service';
import { IconComponent } from '../../shared/icon.component';
import { PushSectionComponent } from '../settings/push-section.component';

/** PushService จำลอง (ไม่แตะ SwPush/เครือข่าย) ให้ส่วน "แจ้งเตือนบนเครื่องนี้" แสดงครบ 5 สถานะ — เฉพาะ ng serve (/dev/push-states) */
function stub(state: PushState, extra: Partial<{ info: string; error: string; busy: boolean; notConfigured: boolean }> = {}) {
  return {
    state: signal<PushState>(state),
    busy: signal(extra.busy ?? false),
    error: signal<string | null>(extra.error ?? null),
    info: signal<string | null>(extra.info ?? null),
    publicKey: signal<string | null>(extra.notConfigured ? null : 'KEY'),
    notConfigured: signal(extra.notConfigured ?? false),
    refresh: async () => undefined, enable: async () => undefined, disable: async () => undefined, sendTest: async () => undefined,
  };
}

interface Demo { title: string; svc: ReturnType<typeof stub> }

@Component({
  selector: 'app-push-states-page',
  imports: [NgComponentOutlet, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="yt-page wrap">
      <h1 class="yt-page-title">สถานะแจ้งเตือนบนเครื่อง (จำลอง)</h1>
      @for (d of demos; track d.title) {
        <section class="card yt-card" [attr.data-state]="d.svc.state()">
          <p class="cap">{{ d.title }}</p>
          <h2><app-icon name="bell" /> แจ้งเตือนบนเครื่องนี้</h2>
          <ng-container *ngComponentOutlet="section; injector: injectorFor(d)" />
        </section>
      }
    </div>
  `,
  styles: `
    :host { position: fixed; inset: 0; overflow-y: auto; }   /* body ถูก Ionic ตั้ง overflow:hidden → หน้านี้เป็น scroll container เอง */
    .wrap { max-width: 44rem; display: flex; flex-direction: column; gap: var(--yt-space-4); }
    .card { padding: var(--yt-space-4); }
    .card h2 { display: flex; align-items: center; gap: var(--yt-space-2); margin-bottom: var(--yt-space-2); font-size: 1.35rem; }
    .cap { margin: 0 0 var(--yt-space-2); color: var(--yt-text-muted); font-weight: 600; }
  `,
})
export class PushStatesPage {
  private parent = inject(Injector);
  protected readonly section = PushSectionComponent;
  protected readonly demos: Demo[] = [
    { title: '1. ไม่รองรับ', svc: stub('unsupported') },
    { title: '2. iPhone — ต้องเพิ่มลงหน้าจอโฮมก่อน', svc: stub('needs-install') },
    { title: '3. ยังไม่เปิด', svc: stub('off') },
    { title: '3b. ยังไม่เปิด — ระบบยังไม่ตั้ง VAPID', svc: stub('off', { notConfigured: true }) },
    { title: '4. เปิดแล้ว (ส่งทดลองแล้ว)', svc: stub('enabled', { info: 'ส่งแล้วค่ะ รอสักครู่จะเห็นแจ้งเตือนบนเครื่องนี้' }) },
    { title: '4b. เปิดแล้ว — มี error', svc: stub('enabled', { error: 'ส่งแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่ หรือปิดแล้วเปิดการแจ้งเตือนอีกครั้งค่ะ' }) },
    { title: '5. ถูกบล็อก', svc: stub('blocked') },
  ];
  private readonly cache = new Map<Demo, Injector>();
  protected injectorFor(d: Demo): Injector {
    let i = this.cache.get(d);
    if (!i) { i = Injector.create({ providers: [{ provide: PushService, useValue: d.svc }], parent: this.parent }); this.cache.set(d, i); }
    return i;
  }
}
