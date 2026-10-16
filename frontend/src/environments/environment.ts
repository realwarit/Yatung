/**
 * ค่าตอน build — เว็บ/PWA: `apiBase` ว่าง = ยิง /api แบบ relative เหมือนเดิม
 * แอป Android (`ng build -c production,native`) : angular.json สลับเป็น environment.native.ts
 * ที่ `npm run cap:env` สร้างจาก .env (git-ignored ห้าม commit เพราะมีโดเมน)
 */
export const environment = { native: false, apiBase: '' };
