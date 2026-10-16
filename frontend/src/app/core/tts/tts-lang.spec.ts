import { findThaiTag, isThaiTag, toLanguageTag } from './tts-lang';

describe('tts-lang', () => {
  it('รับรหัสไทยทุกแบบที่ engine คืน', () => {
    for (const t of ['th', 'th-TH', 'th_TH', 'tha', 'tha-THA', 'tha_THA', 'TH-th', ' th-TH ']) expect(isThaiTag(t)).toBe(true);
  });
  it('ไม่รับภาษาอื่น/ค่าแปลก', () => {
    for (const t of ['en-US', 'ta-IN', 'the', 'tr-TR', '', null, undefined, 5]) expect(isThaiTag(t)).toBe(false);
  });
  it('toLanguageTag แปลง _ เป็น -', () => expect(toLanguageTag('th_TH')).toBe('th-TH'));
  it('findThaiTag: รายการภาษา', () => expect(findThaiTag(['en-US', 'th_TH'])).toBe('th-TH'));
  it('findThaiTag: รายการเสียง', () => expect(findThaiTag([{ lang: 'en-US' }, { lang: 'tha-THA' }])).toBe('tha-THA'));
  it('findThaiTag: ว่าง/ไม่ใช่อาเรย์/ไม่มีไทย = null', () => {
    expect(findThaiTag([])).toBeNull();
    expect(findThaiTag(undefined)).toBeNull();
    expect(findThaiTag([{ lang: 'en-US' }])).toBeNull();
  });
});
