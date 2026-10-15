import { medDisplayName } from './text';

describe('medDisplayName', () => {
  it('ตัวใหญ่ล้วนยาว ≥ 4 → Title Case', () => {
    expect(medDisplayName('METFORMIN')).toBe('Metformin');
    expect(medDisplayName('AMOXICILLIN-CLAVULANATE 500 mg')).toBe('Amoxicillin-Clavulanate 500 mg');
  });
  it('ตัวย่อสั้น ≤ 3 ตัวคงเดิม', () => {
    expect(medDisplayName('ORS')).toBe('ORS');
    expect(medDisplayName('ASA')).toBe('ASA');
  });
  it('ชื่อที่ผสมตัวพิมพ์/ภาษาไทย/ว่าง ไม่เปลี่ยน', () => {
    expect(medDisplayName('Metformin')).toBe('Metformin');
    expect(medDisplayName('พาราเซตามอล')).toBe('พาราเซตามอล');
    expect(medDisplayName(null)).toBe('');
  });
});
