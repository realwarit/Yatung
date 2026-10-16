import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { TtsEngine } from './tts-engine';
import { TTS_ENV, TtsEnv, TtsService } from './tts.service';

@Component({ template: '' })
class Dummy {}

/** เครื่องยนต์ native จำลอง: แต่ละท่อนค้างจนกว่าเทสสั่งจบ (เหมือนปลั๊กอินที่รออ่านจบ) */
function makeEngine(thai: boolean) {
  const log: string[] = [];
  const pending: (() => void)[] = [];
  const engine: TtsEngine = {
    probe: async () => thai,
    speak: (text, rate) => { log.push(`speak:${text}@${rate}`); return new Promise<void>((r) => pending.push(r)); },
    stop: async () => { log.push('stop'); },
  };
  const finishOne = async () => { pending.shift()?.(); await tick(); };
  return { engine, log, finishOne, pendingCount: () => pending.length };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

async function setup(thai: boolean) {
  const e = makeEngine(thai);
  const env: TtsEnv = { synth: null, makeUtterance: () => { throw new Error('ไม่ควรใช้ Web Speech ในแอป native'); }, native: async () => e.engine };
  TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'a', component: Dummy }]), { provide: TTS_ENV, useValue: env }] });
  const s = TestBed.inject(TtsService);
  await tick();
  return { s, ...e };
}

describe('TtsService แอป Android: ตรวจเสียงไทยซ้ำ', () => {
  it('ตอนแรกไม่มี แล้วผู้ใช้เปลี่ยน engine แล้วกลับเข้าแอป → ตรวจใหม่และแสดงปุ่ม', async () => {
    let thai = false;
    const engine: TtsEngine = { probe: async () => thai, speak: async () => {}, stop: async () => {}, diag: () => ({ engineLoaded: true, languageCount: 3, voiceCount: 0, hasThai: thai, via: thai ? 'languages' : null, error: null, stage: 'x' }) };
    const env: TtsEnv = { synth: null, makeUtterance: () => { throw new Error('x'); }, native: async () => engine };
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'a', component: Dummy }]), { provide: TTS_ENV, useValue: env }] });
    const s = TestBed.inject(TtsService);
    await tick();
    expect(s.canSpeak()).toBe(false);
    expect(s.nativeDiag()?.hasThai).toBe(false);
    thai = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await tick();
    expect(s.canSpeak()).toBe(true);
    expect(s.nativeDiag()).toEqual({ engineLoaded: true, languageCount: 3, voiceCount: 0, hasThai: true, via: 'languages', error: null, stage: 'x' });
  });
});

describe('TtsService แอป Android (เครื่องยนต์ native)', () => {
  it('เครื่องมีเสียงไทย → canSpeak และ supported เป็นจริง ไม่ผ่าน speechSynthesis', async () => {
    const { s } = await setup(true);
    expect(s.supported()).toBe(true);
    expect(s.canSpeak()).toBe(true);
  });

  it('เครื่องไม่มีเสียงไทย → canSpeak = false (ซ่อนปุ่ม) และ speak ไม่ทำอะไร', async () => {
    const { s, log } = await setup(false);
    expect(s.canSpeak()).toBe(false);
    expect(s.speak(['สวัสดี'])).toBe(false);
    expect(log).toEqual([]);
  });

  it('ยังตรวจเสียงไม่เสร็จ → canSpeak = false ไว้ก่อน (ไม่แสดงปุ่มที่อาจพูดไม่ได้)', async () => {
    const env: TtsEnv = { synth: null, makeUtterance: () => { throw new Error('x'); }, native: () => new Promise(() => undefined) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: TTS_ENV, useValue: env }] });
    expect(TestBed.inject(TtsService).canSpeak()).toBe(false);
  });

  it('โหลดเครื่องยนต์ไม่ได้ → canSpeak = false', async () => {
    const env: TtsEnv = { synth: null, makeUtterance: () => { throw new Error('x'); }, native: () => Promise.reject(new Error('load')) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: TTS_ENV, useValue: env }] });
    const s = TestBed.inject(TtsService);
    await tick();
    expect(s.canSpeak()).toBe(false);
  });

  it('อ่านทีละท่อน: ท่อนถัดไปเริ่มหลังท่อนก่อนหน้าจบ แล้วสถานะกลับเป็นไม่ได้อ่าน', async () => {
    const { s, log, finishOne } = await setup(true);
    expect(s.speak(['หนึ่ง', ' ', 'สอง'], 'k')).toBe(true);
    await tick();
    expect(s.speaking()).toBe(true);
    expect(s.speakingKey()).toBe('k');
    expect(log).toEqual(['speak:หนึ่ง@0.8']);
    await finishOne();
    expect(log).toEqual(['speak:หนึ่ง@0.8', 'speak:สอง@0.8']);
    await finishOne();
    expect(s.speaking()).toBe(false);
    expect(s.speakingKey()).toBeNull();
  });

  it('กดปุ่มเดิมซ้ำระหว่างอ่าน = หยุด และไม่อ่านท่อนที่เหลือ', async () => {
    const { s, log, finishOne } = await setup(true);
    s.toggle('k', ['หนึ่ง', 'สอง']);
    await tick();
    s.toggle('k', ['หนึ่ง', 'สอง']);
    expect(s.speaking()).toBe(false);
    expect(log).toContain('stop');
    await finishOne();   // ท่อนเก่าจบทีหลังกดหยุด ต้องไม่ลามไปอ่านท่อนสอง
    expect(log.filter((l) => l.startsWith('speak:'))).toEqual(['speak:หนึ่ง@0.8']);
    expect(s.speaking()).toBe(false);
  });

  it('เริ่มอ่านอันใหม่ขณะอ่านอันเก่า: อันเก่าที่จบทีหลังต้องไม่ล้างสถานะอันใหม่และไม่อ่านต่อ', async () => {
    const { s, log, finishOne } = await setup(true);
    s.speak(['เก่า1', 'เก่า2'], 'a');
    await tick();
    s.speak(['ใหม่'], 'b');
    await tick();
    await finishOne();   // ท่อน "เก่า1" จบ (ปลั๊กอินจริงจะไม่ resolve แต่กันไว้)
    expect(s.speakingKey()).toBe('b');
    expect(s.speaking()).toBe(true);
    expect(log.filter((l) => l === 'speak:เก่า2@0.8')).toEqual([]);
  });

  it('ท่อนอ่านล้มเหลว → จบการอ่าน ไม่ค้างสถานะ', async () => {
    const e = makeEngine(true);
    e.engine.speak = () => Promise.reject(new Error('tts'));
    const env: TtsEnv = { synth: null, makeUtterance: () => { throw new Error('x'); }, native: async () => e.engine };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: TTS_ENV, useValue: env }] });
    const s = TestBed.inject(TtsService);
    await tick();
    s.speak(['ก']);
    await tick();
    expect(s.speaking()).toBe(false);
  });

  it('ไม่มี API พูดเอง: สร้าง service และตรวจเสียงแล้วต้องไม่เรียก speak', async () => {
    const { log } = await setup(true);
    expect(log).toEqual([]);
  });
});
