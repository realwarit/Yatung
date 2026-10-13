import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TTS_ENV, TTS_STORAGE_KEY, TtsEnv, TtsService, isThaiLang } from './tts.service';

@Component({ template: '' })
class Dummy {}

interface FakeUtterance { text: string; lang: string; rate: number; voice: unknown; onend: (() => void) | null; onerror: ((e: unknown) => void) | null; }

function makeEnv(voices: Partial<SpeechSynthesisVoice>[], opts: { delayVoices?: boolean } = {}) {
  const spoken: FakeUtterance[] = [];
  const calls = { speak: 0, cancel: 0 };
  let listeners: (() => void)[] = [];
  let ready = !opts.delayVoices;
  let speaking = false;
  const synth = {
    getVoices: () => (ready ? (voices as SpeechSynthesisVoice[]) : []),
    speak: (u: FakeUtterance) => { calls.speak++; spoken.push(u); speaking = true; },
    cancel: () => { calls.cancel++; speaking = false; },
    get speaking() { return speaking; },
    addEventListener: (_: string, fn: () => void) => { listeners.push(fn); },
    removeEventListener: () => { listeners = []; },
  } as unknown as SpeechSynthesis;
  const env: TtsEnv = {
    synth,
    makeUtterance: (text) => ({ text, lang: '', rate: 1, voice: null, onend: null, onerror: null } as unknown as SpeechSynthesisUtterance),
  };
  return { env, spoken, calls, release: () => { ready = true; listeners.forEach((l) => l()); } };
}

const TH = { name: 'Kanya', voiceURI: 'th1', lang: 'th-TH' };
const TH2 = { name: 'Narisa', voiceURI: 'th2', lang: 'tha-THA' };
const EN = { name: 'Samantha', voiceURI: 'en1', lang: 'en-US' };

function setup(env: TtsEnv) {
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: 'a', component: Dummy }, { path: 'b', component: Dummy }]), { provide: TTS_ENV, useValue: env }],
  });
  return TestBed.inject(TtsService);
}

describe('TtsService', () => {
  beforeEach(() => { try { localStorage.removeItem(TTS_STORAGE_KEY); } catch { /* ignore */ } });

  it('isThaiLang รับ th-TH / th_TH / tha-THA / th', () => {
    for (const l of ['th-TH', 'th_TH', 'tha-THA', 'th', 'TH-th']) expect(isThaiLang(l)).toBe(true);
    for (const l of ['en-US', 'the', '', undefined]) expect(isThaiLang(l as string)).toBe(false);
  });

  it('รายการเสียงมีแต่ไม่มีเสียงไทย → hasThai/canSpeak = false (ซ่อนปุ่ม) ; ถ้าสั่ง speak ก็ใช้ lang th-TH ไม่ตั้ง voice', () => {
    const f = makeEnv([EN]);
    const s = setup(f.env);
    expect(s.supported()).toBe(true);
    expect(s.hasThai()).toBe(false);
    expect(s.canSpeak()).toBe(false);
    expect(s.speak(['สวัสดี'])).toBe(true);
    expect(f.spoken[0].lang).toBe('th-TH');
    expect(f.spoken[0].voice).toBeNull();
  });

  it('รายการเสียงยังว่าง (iOS ส่งช้า) → canSpeak = true และพูดได้ทันทีด้วย lang th-TH อย่างเดียว ไม่รอ', () => {
    const f = makeEnv([TH], { delayVoices: true });
    const s = setup(f.env);
    expect(s.hasThai()).toBe(false);
    expect(s.canSpeak()).toBe(true);
    expect(s.speak(['สวัสดี'])).toBe(true);
    expect(f.calls.speak).toBe(1);
    expect(f.spoken[0].lang).toBe('th-TH');
    expect(f.spoken[0].voice).toBeNull();
    f.release();
    s.speak(['อีกครั้ง']);
    expect((f.spoken[f.spoken.length - 1].voice as { voiceURI: string }).voiceURI).toBe('th1');
  });

  it('เบราว์เซอร์ไม่รองรับ → supported = false', () => {
    const s = setup({ synth: null, makeUtterance: () => ({}) as SpeechSynthesisUtterance });
    expect(s.supported()).toBe(false);
    expect(s.hasThai()).toBe(false);
    expect(s.speak(['x'])).toBe(false);
  });

  it('มีเสียงไทย → hasThai และเลือก th-TH เป็นค่าเริ่มต้น', () => {
    const s = setup(makeEnv([EN, TH2, TH]).env);
    expect(s.hasThai()).toBe(true);
    expect(s.thaiVoices().length).toBe(2);
    expect(s.selectedVoice()?.voiceURI).toBe('th1');
  });

  it('speak: cancel ก่อน, จัดคิวทุกท่อนทันที (synchronous), lang th-TH, ความเร็วเริ่มต้น 0.8', () => {
    const f = makeEnv([TH2]);
    const s = setup(f.env);
    expect(s.speak(['ท่อนหนึ่ง', 'ท่อนสอง'], 'k')).toBe(true);
    expect(f.calls.cancel).toBe(1);
    expect(f.spoken.map((u) => u.text)).toEqual(['ท่อนหนึ่ง', 'ท่อนสอง']);
    expect(f.spoken[0].lang).toBe('th-TH');   // ตั้ง th-TH เสมอ ไม่ว่าเสียงที่เลือกจะรายงาน lang แบบไหน
    expect(f.spoken[0].rate).toBe(0.8);
    expect(s.speaking()).toBe(true);
    expect(s.speakingKey()).toBe('k');
    f.spoken[0].onend?.();
    expect(s.speaking()).toBe(true);        // ยังไม่ใช่ท่อนสุดท้าย
    f.spoken[1].onend?.();
    expect(s.speaking()).toBe(false);
  });

  it('toggle: กดซ้ำปุ่มเดิม = หยุด, ปุ่มอื่น = เปลี่ยนไปอ่านอันใหม่', () => {
    const f = makeEnv([TH]);
    const s = setup(f.env);
    s.toggle('a', ['ก']);
    expect(s.speakingKey()).toBe('a');
    s.toggle('b', ['ข']);
    expect(s.speakingKey()).toBe('b');
    s.toggle('b', ['ข']);
    expect(s.speaking()).toBe(false);
  });

  it('เหตุการณ์ของเสียงที่ถูกยกเลิก (interrupted) ไม่ทำให้สถานะของอันใหม่ถูกล้าง', () => {
    const f = makeEnv([TH]);
    const s = setup(f.env);
    s.speak(['เก่า'], 'a');
    const old = f.spoken[0];
    s.speak(['ใหม่'], 'b');
    old.onerror?.({ error: 'interrupted' });
    old.onend?.();
    expect(s.speaking()).toBe(true);
    expect(s.speakingKey()).toBe('b');
  });

  it('ไม่มีการพูดเองโดยอัตโนมัติ: สร้าง service / โหลดเสียง / เปลี่ยนหน้า ต้องไม่เรียก speak', async () => {
    const f = makeEnv([TH], { delayVoices: true });
    const s = setup(f.env);
    f.release();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/a');
    await router.navigateByUrl('/b#take=abc');
    expect(s.hasThai()).toBe(true);
    expect(f.calls.speak).toBe(0);
  });

  it('รอเสียงที่มาทีหลัง (voiceschanged)', () => {
    const f = makeEnv([TH], { delayVoices: true });
    const s = setup(f.env);
    expect(s.hasThai()).toBe(false);
    f.release();
    expect(s.hasThai()).toBe(true);
  });

  it('เปลี่ยนหน้า (NavigationStart) → หยุดอ่าน', async () => {
    const f = makeEnv([TH]);
    const s = setup(f.env);
    s.speak(['ก'], 'a');
    await TestBed.inject(Router).navigateByUrl('/a');
    expect(s.speaking()).toBe(false);
  });

  it('visibilitychange เป็น hidden → หยุดอ่าน', () => {
    const f = makeEnv([TH]);
    const s = setup(f.env);
    s.speak(['ก'], 'a');
    const stub = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(s.speaking()).toBe(false);
    stub.mockRestore();
  });

  it('เก็บเสียง/ความเร็วใน localStorage และใช้ตอนอ่าน', () => {
    const f = makeEnv([TH, TH2]);
    const s = setup(f.env);
    s.setVoice('th2');
    s.setRate(1.0);
    expect(JSON.parse(localStorage.getItem(TTS_STORAGE_KEY) as string)).toEqual({ voiceURI: 'th2', rate: 1 });
    s.speak(['ก']);
    expect(f.spoken[0].rate).toBe(1);
    expect((f.spoken[0].voice as SpeechSynthesisVoice).voiceURI).toBe('th2');
  });

  it('ค่าที่เก็บไว้เสีย/ใช้ไม่ได้ → ใช้ค่าเริ่มต้น', () => {
    localStorage.setItem(TTS_STORAGE_KEY, '{"voiceURI":"zzz","rate":9}');
    const s = setup(makeEnv([TH]).env);
    expect(s.rate()).toBe(0.8);
    expect(s.selectedVoice()?.voiceURI).toBe('th1');
  });
});
