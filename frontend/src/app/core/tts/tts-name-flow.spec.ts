import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TodayResponse } from '../api/models';
import { pickTodayResponse } from '../offline/snapshot';
import { slotSpeech, todaySpeech } from './speech-text';
import { TTS_ENV, TTS_STORAGE_KEY, TtsService } from './tts.service';

/** จำลองเส้นทางจริง: backend คืน tts_name → (snapshot ออฟไลน์) → ข้อความที่ส่งให้ speechSynthesis ต้องมีคำใน tts_name */
const API_TODAY = {
  summary: { total: 1, taken: 0, pending: 1, missed: 0 },
  slots: [{ slot: 'morning', time: '08:00', doses: [{
    id: 1, medication_id: 7, name: 'Vitamin D', tts_name: 'วิตามินดี', strength: '1000 IU', dose_per_time: 1, unit: 'tablet', meal_relation: 'after',
    scheduled_at: '2026-10-13 08:00:00', status: 'pending', taken_at: null, source: null, is_overdue: false,
  }] }],
} as unknown as TodayResponse;

describe('tts_name ตั้งแต่ API ถึงเสียง', () => {
  const spoken: string[] = [];
  beforeEach(() => {
    spoken.length = 0;
    try { localStorage.removeItem(TTS_STORAGE_KEY); } catch { /* ignore */ }
    const synth = { getVoices: () => [], speak: (u: { text: string }) => spoken.push(u.text), cancel: () => {}, speaking: false, addEventListener: () => {}, removeEventListener: () => {} } as unknown as SpeechSynthesis;
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: TTS_ENV, useValue: { synth, makeUtterance: (text: string) => ({ text }) } }] });
  });

  it('ปุ่มใหญ่หน้า Today: todaySpeech จากคำตอบ API มี "วิตามินดี" และไม่มี "Vitamin"', () => {
    TestBed.inject(TtsService).speak(todaySpeech(API_TODAY.slots));
    expect(spoken.join(' ')).toContain('วิตามินดี');
    expect(spoken.join(' ')).not.toMatch(/Vitamin/i);
  });
  it('ปุ่มต่อมื้อ: slotSpeech มี "วิตามินดี"', () => {
    TestBed.inject(TtsService).speak(slotSpeech(API_TODAY.slots[0]));
    expect(spoken.join(' ')).toContain('วิตามินดี');
  });
  it('snapshot ออฟไลน์ (C2) เก็บ tts_name และอ่านจาก snapshot ได้เหมือนกัน', () => {
    const snap = pickTodayResponse(API_TODAY);
    expect(snap.slots[0].doses[0].tts_name).toBe('วิตามินดี');
    TestBed.inject(TtsService).speak(todaySpeech(snap.slots));
    expect(spoken.join(' ')).toContain('วิตามินดี');
  });
  it('ไม่มี tts_name → ใช้พจนานุกรม "วิ ตา มิน ดี" (ไม่ใช่ Vitamin D)', () => {
    const slots = API_TODAY.slots.map((s) => ({ ...s, doses: s.doses.map((d) => ({ ...d, tts_name: null })) }));
    TestBed.inject(TtsService).speak(todaySpeech(slots));
    expect(spoken.join(' ')).toContain('วิ ตา มิน ดี');
  });
});
