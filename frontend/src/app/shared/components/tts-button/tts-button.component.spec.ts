import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TTS_ENV, TtsEnv } from '../../../core/tts/tts.service';
import { fieldFromMessage, toMedicationInput, EMPTY_DRAFT } from '../med-fields/med-draft';
import { TtsButtonComponent } from './tts-button.component';

@Component({
  imports: [TtsButtonComponent],
  template: `<app-tts-button label="ฟัง" ttsKey="t" [build]="build" />`,
})
class Host { build = (): string[] => ['สวัสดี']; }

function envWith(langs: string[]) {
  const speak = vi.fn();
  const synth = {
    getVoices: () => langs.map((lang, i) => ({ lang, name: 'v' + i, voiceURI: 'v' + i })),
    speak, cancel: vi.fn(), speaking: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  } as unknown as SpeechSynthesis;
  const env: TtsEnv = { synth, makeUtterance: (text) => ({ text } as SpeechSynthesisUtterance) };
  return { env, speak };
}

function mount(env: TtsEnv) {
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: TTS_ENV, useValue: env }] });
  const f = TestBed.createComponent(Host);
  f.detectChanges();
  return f;
}

describe('TtsButtonComponent', () => {
  it('ไม่มีเสียงไทย → ไม่แสดงปุ่มเลย', () => {
    const f = mount(envWith(['en-US']).env);
    expect(f.nativeElement.querySelector('button')).toBeNull();
  });

  it('มีเสียงไทย → แสดงปุ่ม และกดแล้ว speak ถูกเรียกใน click เดียวกัน (synchronous)', () => {
    const { env, speak } = envWith(['th-TH']);
    const f = mount(env);
    const btn = f.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(speak).not.toHaveBeenCalled();     // ห้ามเล่นเอง
    btn.click();
    expect(speak).toHaveBeenCalledTimes(1);   // ไม่มี await/setTimeout คั่น
    f.detectChanges();
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.textContent).toContain('หยุดอ่าน');
  });
});

describe('ฟอร์มยา: tts_name', () => {
  it('map ข้อความ error ของ backend ไปที่ช่อง tts', () => {
    expect(fieldFromMessage('ชื่อที่ให้อ่านออกเสียง ต้องไม่เกิน 100 ตัวอักษร')).toBe('tts');
    expect(fieldFromMessage('รายการที่ 2: ชื่อที่ให้อ่านออกเสียง ต้องเป็นข้อความ')).toBe('tts');
    expect(fieldFromMessage('ชื่อยา ต้องมีความยาว 1–150 ตัวอักษร')).toBe('name');
  });
  it('toMedicationInput: ว่าง → null, มีค่า → trim', () => {
    expect(toMedicationInput({ ...EMPTY_DRAFT, name: 'A' }).tts_name).toBeNull();
    expect(toMedicationInput({ ...EMPTY_DRAFT, name: 'A', ttsName: ' ยาความดัน ' }).tts_name).toBe('ยาความดัน');
  });
});
