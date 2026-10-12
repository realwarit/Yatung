import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';

/** ตัวห่อ Web Speech API — ทดสอบด้วยของจำลองได้ ; synth = null เมื่อเบราว์เซอร์ไม่รองรับ */
export interface TtsEnv {
  synth: SpeechSynthesis | null;
  makeUtterance: (text: string) => SpeechSynthesisUtterance;
}

export const TTS_ENV = new InjectionToken<TtsEnv>('TTS_ENV', {
  providedIn: 'root',
  factory: (): TtsEnv => ({
    synth: typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined' ? speechSynthesis : null,
    makeUtterance: (text) => new SpeechSynthesisUtterance(text),
  }),
});

export const TTS_STORAGE_KEY = 'yatung_tts';
export const TTS_RATES = [{ value: 0.8, label: 'ช้า' }, { value: 1.0, label: 'ปกติ' }] as const;
export const DEFAULT_RATE = 0.8;
export const TRY_PHRASE = 'สวัสดีค่ะ น้องยาตรงเองค่ะ';

/** th-TH / th_TH / tha-THA / th → เป็นเสียงไทย */
export const isThaiLang = (lang: string | undefined): boolean => /^(th|tha)([-_]|$)/i.test((lang ?? '').trim());

interface Prefs { voiceURI: string | null; rate: number; }

function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(TTS_STORAGE_KEY) ?? 'null') as Partial<Prefs> | null;
    const rate = raw && typeof raw.rate === 'number' && raw.rate >= 0.5 && raw.rate <= 1.5 ? raw.rate : DEFAULT_RATE;
    return { voiceURI: raw && typeof raw.voiceURI === 'string' ? raw.voiceURI : null, rate };
  } catch { return { voiceURI: null, rate: DEFAULT_RATE }; }
}

const VOICE_RETRIES = 10;
const VOICE_RETRY_MS = 250;

/**
 * อ่านออกเสียงด้วย Web Speech API ของเบราว์เซอร์ (ไม่มี backend)
 * กติกา: ไม่มี API พูดอัตโนมัติ — `speak()` เรียกได้จาก click handler เท่านั้น และต้องเรียกแบบ synchronous
 * (iOS Safari ปฏิเสธเสียงที่ไม่ได้เริ่มจากการแตะโดยตรง → ห้ามมี await/setTimeout คั่นระหว่างการแตะกับ speak)
 */
@Injectable({ providedIn: 'root' })
export class TtsService {
  private readonly env = inject(TTS_ENV);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly supported = signal(!!this.env.synth);
  private readonly voices = signal<SpeechSynthesisVoice[]>([]);
  readonly thaiVoices = computed(() => this.voices().filter((v) => isThaiLang(v.lang)));
  /** มีเสียงไทยให้ใช้ = แสดงปุ่ม 🔊 ได้ ; ไม่มี = ซ่อนทุกปุ่ม */
  readonly hasThai = computed(() => this.supported() && this.thaiVoices().length > 0);
  private readonly prefs = signal<Prefs>(readPrefs());
  readonly rate = computed(() => this.prefs().rate);
  readonly selectedVoice = computed<SpeechSynthesisVoice | null>(() => {
    const list = this.thaiVoices();
    const uri = this.prefs().voiceURI;
    return list.find((v) => v.voiceURI === uri) ?? list.find((v) => /^th-th$/i.test(v.lang.replace('_', '-'))) ?? list[0] ?? null;
  });
  readonly speaking = signal(false);
  /** key ของปุ่มที่กำลังอ่าน (ปุ่มอื่นแสดงปกติ) */
  readonly speakingKey = signal<string | null>(null);

  private token = 0;

  constructor() {
    const synth = this.env.synth;
    if (!synth) return;
    this.loadVoices();
    const onChange = () => this.loadVoices();
    synth.addEventListener?.('voiceschanged', onChange);
    this.destroyRef.onDestroy(() => synth.removeEventListener?.('voiceschanged', onChange));
    // iOS/Android บางเครื่องส่งรายการเสียงช้า (หรือไม่ส่ง voiceschanged เลย) → ลองถามซ้ำช่วงสั้นๆ
    let tries = 0;
    const timer = setInterval(() => {
      this.loadVoices();
      if (this.voices().length > 0 || ++tries >= VOICE_RETRIES) clearInterval(timer);
    }, VOICE_RETRY_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));

    // หยุดเมื่อเปลี่ยนหน้า / ซ่อนแอป
    this.router.events.pipe(filter((e) => e instanceof NavigationStart)).subscribe(() => this.stop());
    const onVis = () => { if (document.visibilityState === 'hidden') this.stop(); };
    document.addEventListener('visibilitychange', onVis);
    this.destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', onVis));
  }

  private loadVoices(): void {
    const list = this.env.synth?.getVoices() ?? [];
    if (list.length !== this.voices().length) this.voices.set([...list]);
  }

  /**
   * เริ่มอ่าน (หยุดของเดิมก่อน) — ต้องเรียกแบบ synchronous จาก click handler ; คืน false ถ้าอ่านไม่ได้
   * ท่อนทั้งหมดถูกจัดคิวให้ synth ทันที (ไม่รอ onend เพราะ iOS ไม่ยอมให้ speak จาก callback)
   */
  speak(chunks: string[], key: string | null = null): boolean {
    const synth = this.env.synth;
    const voice = this.selectedVoice();
    const parts = chunks.map((c) => c.trim()).filter(Boolean);
    if (!synth || !voice || !parts.length) return false;
    synth.cancel();
    const mine = ++this.token;
    this.speaking.set(true);
    this.speakingKey.set(key);
    parts.forEach((text, i) => {
      const u = this.env.makeUtterance(text);
      u.lang = voice.lang.replace('_', '-');
      u.voice = voice;
      u.rate = this.rate();
      const done = () => { if (mine === this.token && i === parts.length - 1) this.finish(); };
      u.onend = done;
      u.onerror = (e) => {
        // 'interrupted'/'canceled' = เราสั่งหยุดเอง (หรือเริ่มอันใหม่) ไม่ใช่ข้อผิดพลาด
        if (mine === this.token && !['interrupted', 'canceled'].includes((e as SpeechSynthesisErrorEvent).error)) this.finish();
      };
      synth.speak(u);
    });
    return true;
  }

  /** กดปุ่มเดิมซ้ำ = หยุด ; กดปุ่มอื่น = เปลี่ยนไปอ่านอันใหม่ */
  toggle(key: string, chunks: string[]): void {
    if (this.speaking() && this.speakingKey() === key) this.stop();
    else this.speak(chunks, key);
  }

  stop(): void {
    if (!this.speaking() && !this.env.synth?.speaking) return;
    this.token++;
    this.env.synth?.cancel();
    this.finish();
  }

  private finish(): void {
    this.speaking.set(false);
    this.speakingKey.set(null);
  }

  setVoice(voiceURI: string): void { this.savePrefs({ ...this.prefs(), voiceURI }); }
  setRate(rate: number): void { this.savePrefs({ ...this.prefs(), rate }); }

  private savePrefs(p: Prefs): void {
    this.prefs.set(p);
    try { localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify(p)); } catch { /* โหมดส่วนตัว/ปิดที่เก็บข้อมูล — ใช้ค่าในหน่วยความจำต่อไป */ }
  }
}
