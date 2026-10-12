import { AdherenceDay, AdherenceMeal, AdherenceResponse, AdherenceSources } from '../../core/api/stats.api';
import { MascotMood } from '../../shared/components/mascot/mascot.component';

/** ระดับอัตราการกินยา → ท่าน้องยาตรง + ข้อความ (ห้ามใช้คำตำหนิ) ; ตารางข้อความตรงกับ backend lib/adherence-level.js (เทสเทียบกัน) */
export type LevelKey = 'none' | 'perfect' | 'good' | 'ok' | 'low';
export interface Level { key: LevelKey; mood: MascotMood; text: string; }

export function levelOf(rate: number | null): Level {
  if (rate === null) return { key: 'none', mood: 'wave', text: 'ยังไม่มีข้อมูลยาในช่วงนี้ค่ะ' };
  if (rate >= 100) return { key: 'perfect', mood: 'celebrate', text: 'เยี่ยมมากค่ะ กินครบทุกมื้อเลย' };
  if (rate >= 80) return { key: 'good', mood: 'celebrate', text: 'เก่งมากค่ะ' };
  if (rate >= 50) return { key: 'ok', mood: 'wave', text: 'ค่อยๆ เพิ่มขึ้นได้นะคะ' };
  return { key: 'low', mood: 'wave', text: 'ให้น้องยาตรงช่วยเตือนใน LINE นะคะ' };
}

/** รายวัน: ครบ (ไอคอน ✓) / ต่ำกว่า 50% (ไอคอน !) / กลางๆ / ไม่มียา — ใช้เลือกไอคอน+สี ไม่ใช้สีอย่างเดียว */
export type DayKind = 'none' | 'perfect' | 'ok' | 'low';
export function dayKind(d: Pick<AdherenceDay, 'rate'>): DayKind {
  if (d.rate === null) return 'none';
  return d.rate >= 100 ? 'perfect' : d.rate >= 50 ? 'ok' : 'low';
}

/** ความสูงแท่ง (0–100 → 0–1) ; มียาแต่กินไม่ได้เลย (0%) ยังเห็นแท่งเตี้ยๆ ให้รู้ว่ามีข้อมูล */
export function barFraction(rate: number | null): number {
  return rate === null ? 0 : Math.max(0.05, Math.min(1, rate / 100));
}

/** แยกกลุ่มช่องทางที่แสดง: "แอป" = app + push, "LINE", "ญาติยืนยัน" ; other ไม่แสดง */
export interface SourceGroup { key: 'app' | 'line' | 'caregiver'; label: string; count: number; }
export function sourceGroups(s: AdherenceSources): SourceGroup[] {
  return [
    { key: 'app', label: 'แอป', count: s.app + s.push },
    { key: 'line', label: 'LINE', count: s.line },
    { key: 'caregiver', label: 'ญาติยืนยัน', count: s.caregiver },
  ];
}

/** มื้อที่กินครบน้อยที่สุด: ต้อง rate < 100 และ due ≥ 2 ; เสมอกัน = มื้อที่เช้ากว่า (ลำดับของ by_meal) */
export function worstMeal(meals: AdherenceMeal[]): AdherenceMeal | null {
  let worst: AdherenceMeal | null = null;
  for (const m of meals) {
    if (m.rate === null || m.rate >= 100 || m.due < 2) continue;
    if (!worst || m.rate < (worst.rate as number)) worst = m;
  }
  return worst;
}

/** ประโยคสำหรับ aria-label ของกราฟ และสำหรับ TTS (8B) */
export function chartSummary(days: AdherenceDay[]): string {
  const part = (d: AdherenceDay) => `${d.is_today ? 'วันนี้ ' : ''}${d.label_th} ${d.rate === null ? 'ไม่มียา' : d.rate + ' เปอร์เซ็นต์'}`;
  return `กราฟอัตราการกินยา ${days.length} วัน: ${days.map(part).join(', ')}`;
}

/** รายละเอียดวันที่เลือก: "จ. 12 ต.ค. · กินแล้ว 3 · ลืม 1 · ยังไม่กิน 0 · ยังไม่ถึงเวลา 1" */
export function dayDetail(d: AdherenceDay): string {
  return `${d.label_th} · กินแล้ว ${d.taken} · ลืม ${d.missed} · ยังไม่กิน ${d.pending_due} · ยังไม่ถึงเวลา ${d.upcoming}`;
}

export const hasData = (r: AdherenceResponse | null): boolean => !!r && r.overall.rate !== null;
