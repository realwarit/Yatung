import { AdherenceDay, AdherenceMeal, AdherenceResponse, AdherenceSources } from '../../core/api/stats.api';
import { MascotMood } from '../../shared/components/mascot/mascot.component';

/** ระดับอัตราการกินยา → ท่าน้องยาตรง + ข้อความ (ห้ามใช้คำตำหนิ) ; ตารางข้อความตรงกับ backend lib/adherence-level.js (เทสเทียบกัน) */
export type LevelKey = 'none' | 'perfect' | 'good' | 'ok' | 'low';
export interface Level { key: LevelKey; mood: MascotMood; text: string; }

/** lineLinked: true = เชื่อม LINE แล้ว · false = ยังไม่เชื่อม · null = ไม่ทราบ (ใช้ข้อความกลาง ๆ ที่ถูกต้องทั้งสองกรณี)
 *  ระดับต่ำ (< 50): ยังไม่เชื่อมชวนเชื่อม LINE ; เชื่อมแล้วไม่ต้องชวนซ้ำ — ฝั่ง LINE (backend) ใช้ข้อความ "เชื่อมแล้ว" เสมอ */
export function levelOf(rate: number | null, lineLinked: boolean | null = null): Level {
  if (rate === null) return { key: 'none', mood: 'wave', text: 'ยังไม่มีข้อมูลยาในช่วงนี้ค่ะ' };
  if (rate >= 100) return { key: 'perfect', mood: 'celebrate', text: 'เยี่ยมมากค่ะ กินครบทุกมื้อเลย' };
  if (rate >= 80) return { key: 'good', mood: 'celebrate', text: 'เก่งมากค่ะ' };
  if (rate >= 50) return { key: 'ok', mood: 'wave', text: 'ค่อยๆ เพิ่มขึ้นได้นะคะ' };
  return { key: 'low', mood: 'wave', text: lineLinked === false ? 'ให้น้องยาตรงช่วยเตือนใน LINE นะคะ' : 'พรุ่งนี้ลองใหม่นะคะ' };
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

/** สเกลสีชุดเดียวทั้งหน้า (แท่งรายวัน แถบรายยา วงแหวน): ≥ 80 teal · 50–79 amber · < 50 coral · ไม่มีข้อมูล = เทา */
export type Tone = 'good' | 'mid' | 'low' | 'none';
export function toneOf(rate: number | null): Tone {
  return rate === null ? 'none' : rate >= 80 ? 'good' : rate >= 50 ? 'mid' : 'low';
}

/** วันนี้ที่ยังไม่จบ (ยังมีรอบที่ยังไม่ได้กิน/ยังไม่ถึงเวลา): แสดง "กินแล้ว/ทั้งหมดของวัน" แทน % — ไม่ใช่สีแดง ไม่ใช่ error */
export const isPartialToday = (d: AdherenceDay): boolean => d.is_today && (d.pending_due > 0 || d.upcoming > 0);

/** เลขบนแท่ง: วันนี้ที่ยังไม่จบ "0/5" · ไม่มีข้อมูล "–" · วันอื่น เลข % (ไม่ใส่เครื่องหมาย %) */
export function barLabel(d: AdherenceDay): string {
  if (isPartialToday(d)) return `${d.taken}/${d.due + d.upcoming}`;
  return d.rate === null ? '–' : String(d.rate);
}

/** ช่วงวันแบบย่อ: "อ. 6 – จ. 12 ต.ค." (เดือนเดียวกันตัดเดือนวันแรกออก) */
export function rangeText(days: AdherenceDay[]): string {
  if (!days.length) return '';
  const a = days[0].label_th.split(' '), b = days[days.length - 1].label_th.split(' ');
  return a[2] === b[2] ? `${a[0]} ${a[1]} – ${days[days.length - 1].label_th}` : `${days[0].label_th} – ${days[days.length - 1].label_th}`;
}

/** ชิปรายละเอียดของวันที่เลือก: เฉพาะค่าที่ไม่เป็นศูนย์ */
export function dayChips(d: AdherenceDay): string[] {
  return ([['กินแล้ว', d.taken], ['ลืม', d.missed], ['ยังไม่กิน', d.pending_due], ['ยังไม่ถึงเวลา', d.upcoming]] as [string, number][])
    .filter(([, n]) => n > 0).map(([t, n]) => `${t} ${n}`);
}

/** บรรทัดช่องทางท้ายการ์ด: "บันทึกผ่าน แอป 3 · LINE 1 · ญาติ 1" (เฉพาะช่องทางที่มี) ; ไม่มีเลย = '' */
export function sourceLine(s: AdherenceSources): string {
  const parts = sourceGroups(s).filter((g) => g.count > 0).map((g) => `${g.key === 'caregiver' ? 'ญาติ' : g.label} ${g.count}`);
  return parts.length ? `บันทึกผ่าน ${parts.join(' · ')}` : '';
}

/** ประโยคสำหรับ aria-label ของกราฟ และสำหรับ TTS (8B) */
export function chartSummary(days: AdherenceDay[]): string {
  const part = (d: AdherenceDay) => `${d.is_today ? 'วันนี้ ' : ''}${d.label_th} ${isPartialToday(d) ? `กินแล้ว ${d.taken} จาก ${d.due + d.upcoming} ครั้ง` : d.rate === null ? 'ไม่มียา' : d.rate + ' เปอร์เซ็นต์'}`;
  return `กราฟอัตราการกินยา ${days.length} วัน: ${days.map(part).join(', ')}`;
}

/** รายละเอียดวันที่เลือก (ข้อความสำหรับโปรแกรมอ่านหน้าจอ): "จ. 12 ต.ค. · กินแล้ว 3 · ลืม 1" เฉพาะค่าที่ไม่เป็นศูนย์ ; ไม่มีเลย = "ไม่มียา" */
export function dayDetail(d: AdherenceDay): string {
  const chips = dayChips(d);
  return `${d.label_th} · ${chips.length ? chips.join(' · ') : 'ไม่มียา'}`;
}

export const hasData = (r: AdherenceResponse | null): boolean => !!r && r.overall.rate !== null;
