import { insertAtCursor } from './text-insert';

describe('insertAtCursor', () => {
  it('ช่องว่าง → เติมตรงๆ', () => {
    expect(insertAtCursor('', 0, 0, 'เช้า')).toEqual({ text: 'เช้า', caret: 4 });
  });

  it('ต่อท้าย → เว้นวรรคนำหน้า', () => {
    expect(insertAtCursor('Metformin', 9, 9, 'วันละ 2 ครั้ง').text).toBe('Metformin วันละ 2 ครั้ง');
  });

  it('กลางข้อความ → เว้นวรรคทั้งสองข้าง และ cursor อยู่หลังคำที่เติม', () => {
    const r = insertAtCursor('AB', 1, 1, 'x');
    expect(r.text).toBe('A x B');
    expect(r.caret).toBe(3);
  });

  it('มีช่องว่างอยู่แล้ว → ไม่เว้นซ้ำ', () => {
    expect(insertAtCursor('A ', 2, 2, 'x').text).toBe('A x');
  });

  it('เกิน max → ไม่เติม', () => {
    expect(insertAtCursor('abc', 3, 3, 'defgh', 5)).toEqual({ text: 'abc', caret: 3 });
  });
});
