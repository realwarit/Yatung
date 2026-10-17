import { BANNER_ORDER, BannerInputs, BannerKind, pickBanner } from './banner';

const none: BannerInputs = { expired: false, offline: false, offlineText: 'ออฟไลน์อยู่', update: 'none', install: null, font: false };
/** ใส่แหล่งตามชื่อ kind */
const on = (kinds: BannerKind[]): BannerInputs => ({
  ...none,
  expired: kinds.includes('expired'), offline: kinds.includes('offline'),
  update: kinds.includes('update') ? 'ready' : 'none', install: kinds.includes('install') ? 'native' : null, font: kinds.includes('font'),
});

describe('pickBanner', () => {
  it('ไม่มีแหล่งไหน = ไม่แสดง', () => expect(pickBanner(none)).toBeNull());

  it('ทุกชุดค่าผสมของ 5 แหล่ง (31 ชุด): แสดงอันเดียว = อันที่ลำดับสูงสุดในชุด', () => {
    let n = 0;
    for (let mask = 1; mask < 32; mask++) {
      const kinds = BANNER_ORDER.filter((_, i) => mask & (1 << i));
      const picked = pickBanner(on(kinds));
      expect(picked?.kind).toBe(kinds[0]);   // BANNER_ORDER เรียงจากสำคัญสุด
      n++;
    }
    expect(n).toBe(31);
  });

  it('ลำดับ: เชื่อมต่อหมดอายุ > ออฟไลน์ > เวอร์ชันใหม่ > ชวนติดตั้ง > แจ้งขนาดตัวอักษร', () => {
    expect([...BANNER_ORDER]).toEqual(['expired', 'offline', 'update', 'install', 'font']);
  });

  it('ออฟไลน์: โทน offline + ไอคอนเมฆขีดฆ่า + มีข้อความเสมอ (ไม่สื่อด้วยสีอย่างเดียว) และปิดไม่ได้', () => {
    const b = pickBanner(on(['offline']))!;
    expect(b.tone).toBe('offline');
    expect(b.icon).toBe('cloud-off');
    expect(b.text.length).toBeGreaterThan(0);
    expect(b.dismissible).toBe(false);
  });

  it('อัปเดต: ready = info + ปุ่มอัปเดต ปิดได้ · broken = warning + ปุ่มโหลดใหม่ ปิดไม่ได้', () => {
    expect(pickBanner({ ...none, update: 'ready' })).toMatchObject({ tone: 'info', action: 'อัปเดต', dismissible: true });
    expect(pickBanner({ ...none, update: 'broken' })).toMatchObject({ tone: 'warning', action: 'โหลดใหม่', dismissible: false });
  });

  it('อัปเดตไม่สำเร็จ: แถบสุภาพ (info ไม่ใช่ warning, ไม่มีปุ่ม, ปิดได้, ข้อความ "จะลองใหม่") ไม่มีคำว่าผิดพลาด/ล้มเหลว', () => {
    const b = pickBanner({ ...none, update: 'failed' })!;
    expect(b).toMatchObject({ kind: 'update', tone: 'info', icon: 'info', action: null, dismissible: true });
    expect(b.text).toContain('จะลองใหม่');
    expect(b.text).not.toMatch(/ผิดพลาด|ล้มเหลว|error/i);
  });

  it('ป้ายปุ่ม × : แถบอัปเดต (ready/failed) = "ปิดแจ้งเตือนเวอร์ชันใหม่" · ชนิดอื่น = "ปิดข้อความนี้"', () => {
    expect(pickBanner({ ...none, update: 'ready' })!.closeLabel).toBe('ปิดแจ้งเตือนเวอร์ชันใหม่');
    expect(pickBanner({ ...none, update: 'failed' })!.closeLabel).toBe('ปิดแจ้งเตือนเวอร์ชันใหม่');
    expect(pickBanner({ ...none, install: 'native' })!.closeLabel).toBe('ปิดข้อความนี้');
    expect(pickBanner({ ...none, font: true })!.closeLabel).toBe('ปิดข้อความนี้');
  });

  it('อัปเดตไม่สำเร็จ: เชื่อมต่อหมดอายุ/ออฟไลน์มาก่อน ; อยู่เหนือชวนติดตั้ง/ขนาดตัวอักษร', () => {
    expect(pickBanner({ ...none, update: 'failed', offline: true })!.kind).toBe('offline');
    expect(pickBanner({ ...none, update: 'failed', expired: true })!.kind).toBe('expired');
    expect(pickBanner({ ...none, update: 'failed', install: 'native', font: true })!.kind).toBe('update');
  });

  it('ชวนติดตั้ง: native/ios-guide ปิดได้ ; แจ้งขนาดตัวอักษรปิดได้และชี้ไปตั้งค่า', () => {
    expect(pickBanner({ ...none, install: 'native' })).toMatchObject({ kind: 'install', dismissible: true, action: 'ติดตั้ง' });
    expect(pickBanner({ ...none, install: 'ios-guide' })).toMatchObject({ kind: 'install', dismissible: true, action: 'ดูวิธี' });
    expect(pickBanner({ ...none, font: true })).toMatchObject({ kind: 'font', dismissible: true, text: 'ปรับขนาดตัวอักษรให้ใหญ่ขึ้นได้ที่ ตั้งค่า' });
  });
});
