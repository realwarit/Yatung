import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SlotTimes } from './models';

@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private http = inject(HttpClient);

  slotTimes(): Observable<SlotTimes> { return this.http.get<SlotTimes>('/api/settings/slot-times'); }
  saveSlotTimes(times: SlotTimes): Observable<SlotTimes> { return this.http.put<SlotTimes>('/api/settings/slot-times', times); }
}
