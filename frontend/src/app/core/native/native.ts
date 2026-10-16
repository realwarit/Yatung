import { environment } from '../../../environments/environment';

/** true เฉพาะ build ของแอป Android (`ng build -c production,native`) — ค่าตายตัวตอน build ไม่ import ปลั๊กอินใด */
export function isNative(): boolean {
  return environment.native === true;
}
