import { BACK_DEBOUNCE_MS, BackState, decideBack, normalizePath, parentOf, shouldHandleBack } from './back-decision';

const base: BackState = { inline: null, overlayOpen: false, path: '/today', navigating: false, hasHistory: true };
const at = (over: Partial<BackState>) => decideBack({ ...base, ...over });

describe('decideBack (ปุ่ม back ของ Android)', () => {
  it('1) กล่องยืนยัน inline ใน sheet → ปิดกล่องนั้นก่อน (sheet ยังอยู่)', () => {
    expect(at({ overlayOpen: true, inline: 'overlay', path: '/medications' })).toBe('close-inline');
  });

  it('2) sheet/dialog เปิดอยู่ (ไม่มีกล่อง inline ใน sheet) → ปิด sheet แม้หน้ามีกล่อง inline ของหน้า', () => {
    expect(at({ overlayOpen: true, path: '/settings' })).toBe('close-overlay');
    expect(at({ overlayOpen: true, inline: 'page', path: '/settings' })).toBe('close-overlay');
  });

  it('3) กล่องยืนยัน inline ของหน้า (ออกจากระบบ) → ปิดกล่อง ไม่เปลี่ยนหน้า', () => {
    expect(at({ inline: 'page', path: '/settings' })).toBe('close-inline');
  });

  it('4) หน้าย่อย → ย้อนตามประวัติ ; ไม่มีประวัติในแอป → ไปแท็บแม่', () => {
    for (const path of ['/settings/line', '/settings/caregivers', '/medications/new', '/medications/5/edit', '/review/12', '/scan']) {
      expect(at({ path })).toBe('history-back');
      expect(at({ path, hasHistory: false })).toBe('go-parent');
    }
  });

  it('5) แท็บหลักที่ไม่ใช่ /today → ไป /today (ไม่ย้อนข้ามแท็บ)', () => {
    for (const path of ['/medications', '/overview', '/settings']) expect(at({ path })).toBe('go-today');
  });

  it('6) /today, /login, /register → ออกจากแอป', () => {
    for (const path of ['/today', '/login', '/register', '/', '/welcome']) expect(at({ path })).toBe('exit');
  });

  it('7) /login ที่มาจากหน้าต้อนรับ → กลับ /welcome ; เข้า /login ทางอื่น → ออก ; /register ใช้กฎเดิม', () => {
    expect(at({ path: '/login', cameFromWelcome: true })).toBe('go-welcome');
    expect(at({ path: '/login', cameFromWelcome: false })).toBe('exit');
    expect(at({ path: '/login?returnUrl=%2Ftoday' })).toBe('exit');
    expect(at({ path: '/register', cameFromWelcome: true })).toBe('exit');
    expect(at({ path: '/welcome', cameFromWelcome: true })).toBe('exit');
  });

  it('sheet/กล่องยืนยันยังมาก่อนเสมอแม้มาจากหน้าต้อนรับ', () => {
    expect(at({ path: '/login', cameFromWelcome: true, overlayOpen: true })).toBe('close-overlay');
  });

  it('query/fragment/ทับท้ายไม่มีผลต่อการตัดสิน', () => {
    expect(at({ path: '/today?x=1' })).toBe('exit');
    expect(at({ path: '/settings/#a' })).toBe('go-today');
    expect(at({ path: '/medications?open=1' })).toBe('go-today');
    expect(normalizePath('/settings/line/')).toBe('/settings/line');
  });

  it('กำลังเปลี่ยนหน้า → ไม่ทำอะไร (กดซ้ำเร็วๆ ไม่ถอยซ้อน) แต่ปิด dialog ของ canDeactivate ได้', () => {
    expect(at({ navigating: true, path: '/medications/new' })).toBe('ignore');
    expect(at({ navigating: true, path: '/today' })).toBe('ignore');
    expect(at({ navigating: true, overlayOpen: true, path: '/medications/new' })).toBe('close-overlay');
  });

  it('parentOf', () => {
    expect(parentOf('/settings/line')).toBe('/settings');
    expect(parentOf('/medications/new')).toBe('/medications');
    expect(parentOf('/medications/3/edit')).toBe('/medications');
    expect(parentOf('/review/9')).toBe('/today');
    expect(parentOf('/scan')).toBe('/today');
  });

  it('กดซ้ำภายใน debounce นับครั้งเดียว', () => {
    expect(shouldHandleBack(1000, 0)).toBe(true);
    expect(shouldHandleBack(1000 + BACK_DEBOUNCE_MS - 1, 1000)).toBe(false);
    expect(shouldHandleBack(1000 + BACK_DEBOUNCE_MS, 1000)).toBe(true);
  });
});
