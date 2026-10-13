import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConnectionService } from '../../../core/network/connection.service';
import { IconComponent } from '../../icon.component';

/** แถบ "การเชื่อมต่อหมดอายุ" — อยู่ที่ App root จึงแสดงได้แม้ API/หน้าอื่นพังทั้งหมด */
@Component({
  selector: 'app-connection-banner',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (conn.expired()) {
      <div class="bar" role="alert">
        <button type="button" class="btn" (click)="conn.reconnect()">
          <app-icon name="alert" />
          <span class="txt"><strong>การเชื่อมต่อหมดอายุ</strong> <span>แตะเพื่อเชื่อมต่อใหม่</span></span>
        </button>
      </div>
    }
  `,
  styleUrl: './connection-banner.component.scss',
})
export class ConnectionBannerComponent {
  protected readonly conn = inject(ConnectionService);
}
