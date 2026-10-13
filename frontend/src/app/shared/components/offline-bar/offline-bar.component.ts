import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { OnlineService } from '../../../core/offline/online.service';
import { SnapshotService } from '../../../core/offline/snapshot.service';
import { offlineBarText } from '../../../core/offline/offline-text';
import { IconComponent } from '../../icon.component';

/** แถบ "ออฟไลน์อยู่ · ข้อมูลล่าสุดเมื่อ 20:15 น." (role=status) — แสดงเมื่อไม่มีเน็ตหรือคำขอ API ล้มเหลว */
@Component({
  selector: 'app-offline-bar',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (online.offline()) {
      <p class="bar" role="status"><app-icon name="alert" /> <span>{{ text() }}</span></p>
    }
  `,
  styleUrl: './offline-bar.component.scss',
})
export class OfflineBarComponent {
  protected readonly online = inject(OnlineService);
  private readonly snap = inject(SnapshotService);
  protected readonly text = computed(() => offlineBarText(this.snap.lastSavedAt()));
}
