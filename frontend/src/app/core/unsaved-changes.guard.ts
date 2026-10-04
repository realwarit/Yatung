import { CanDeactivateFn } from '@angular/router';
import { Observable } from 'rxjs';

export interface HasUnsavedChanges { canLeave(): boolean | Observable<boolean>; }

/** ออกจากหน้าฟอร์มโดยยังไม่บันทึก → ถามยืนยัน */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (page) => page.canLeave();
