import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { ErrorLogService } from '../../core/diagnostics/error-log.service';
import { ScreenInfoComponent } from './screen-info.component';

/** "ข้อมูลสำหรับผู้พัฒนา" (แสดงเฉพาะ demoMode): error 20 รายการล่าสุดในเครื่องนี้ — เวลา, หน้า, รหัส, endpoint, status (ไม่มีข้อมูลผู้ใช้) */
@Component({
  selector: 'app-dev-info-section',
  imports: [MatButton, ScreenInfoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-screen-info />
    <p class="hint">error ที่เกิดในเครื่องนี้ล่าสุด 20 รายการ (เก็บเฉพาะเวลา หน้า รหัส และชื่อ endpoint ไม่มีข้อมูลยาหรือข้อมูลส่วนตัว) ล้างเมื่อออกจากระบบ</p>
    @if (log.entries().length === 0) {
      <p class="empty" role="status">ยังไม่มี error ค่ะ</p>
    } @else {
      <ol class="list" aria-label="error ล่าสุด">
        @for (e of reversed(); track $index) {
          <li>
            <span class="t num">{{ e.t.slice(5) }}</span>
            <strong class="code">{{ e.code }}</strong>
            <span class="where">{{ e.route }}@if (e.endpoint) { → {{ e.endpoint }} }@if (e.status !== null) { · {{ e.status }} }</span>
          </li>
        }
      </ol>
      <button mat-stroked-button type="button" (click)="log.clear()">ล้างรายการ</button>
    }
  `,
  styles: `
    :host { display: block; }
    .hint { margin: 0 0 var(--yt-space-3); color: var(--yt-text-muted); }
    .empty { margin: 0; }
    .list { list-style: none; margin: 0 0 var(--yt-space-3); padding: 0; display: flex; flex-direction: column; gap: var(--yt-space-2); }
    li { display: flex; flex-wrap: wrap; gap: 0 var(--yt-space-2); align-items: baseline; padding: var(--yt-space-2) 0; border-bottom: 1px solid var(--yt-border); }
    .code { color: var(--yt-on-danger-soft); }
    .where { overflow-wrap: anywhere; flex: 1 1 100%; }
  `,
})
export class DevInfoSectionComponent {
  protected readonly log = inject(ErrorLogService);
  protected readonly reversed = () => [...this.log.entries()].reverse();
  constructor() { this.log.reload(); }
}
