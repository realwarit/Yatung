import type { TtsEngine } from './tts-engine';
import { TtsDiag, findThaiTag, toLanguageTag } from './tts-lang';

/**
 * เครื่องยนต์อ่านออกเสียงของแอป Android — ห่อ `@capacitor-community/text-to-speech` (Android TextToSpeech ของระบบ)
 * ไฟล์นี้ถูก import() แบบ lazy เฉพาะ build native เท่านั้น (ดู TTS_ENV) ปลั๊กอินจึงไม่อยู่ใน initial bundle
 */
const DEFAULT_LANG = 'th-TH';
/** ลองถามตรงๆ ทีละรหัส (Java Locale อ่านได้เฉพาะรูปแบบขีดกลาง) */
const DIRECT_TAGS = ['th-TH', 'th', 'tha'];
const PROBE_TRIES = 4;
/** ปลั๊กอินบางครั้งไม่ตอบเลย (ระบบ TTS ยังไม่ init) — กันค้างตลอดไป */
const CALL_TIMEOUT_MS = 2500;
const PROBE_GAP_MS = 500;

export class NativeTtsEngine implements TtsEngine {
  /** ห่อไว้ในอ็อบเจ็กต์เสมอ : ปลั๊กอินของ Capacitor เป็น Proxy ที่ตอบทุกชื่อ (รวม `then`) เป็นเมธอด native —
   *  ถ้าคืนตัวปลั๊กอินตรงๆ จาก async function/await JS จะเรียก `.then()` ของมันแล้วรอตลอดไป (บั๊กที่ทำให้ปุ่ม 🔊 ไม่ขึ้นบน Android) */
  private plugin: { tts: typeof import('@capacitor-community/text-to-speech').TextToSpeech } | null = null;
  /** รหัสที่ engine ยอมรับจริง (ใช้ตอน speak — ปลั๊กอินปฏิเสธถ้ารหัสที่ส่งไม่ผ่าน isLanguageSupported) */
  private lang = DEFAULT_LANG;
  private diagValue: TtsDiag = { engineLoaded: false, languageCount: null, voiceCount: null, hasThai: false, via: null, error: null, stage: 'new' };
  onDiag?: (d: TtsDiag) => void;

  private async load() {
    if (!this.plugin) this.plugin = { tts: (await import('@capacitor-community/text-to-speech')).TextToSpeech };
    return this.plugin;
  }

  diag(): TtsDiag { return { ...this.diagValue }; }

  private stage(s: string): void { this.diagValue.stage = s; this.onDiag?.(this.diag()); }

  private async call<T>(name: string, fn: () => Promise<T>): Promise<T> {
    this.stage(name);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([fn(), new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`timeout:${name}`)), CALL_TIMEOUT_MS); })]);
    } finally { clearTimeout(timer); }
  }

  /**
   * เครื่องมีเสียงไทยไหม — TextToSpeech ของระบบเริ่มทำงานแบบ async จึงถามซ้ำสั้นๆ ก่อนสรุปว่าไม่มี ;
   * ลำดับ: isLanguageSupported (th-TH, th, tha) → getSupportedLanguages → getSupportedVoices (ทนรหัส th/th-TH/th_TH/tha)
   */
  async probe(): Promise<boolean> {
    let tts: NonNullable<typeof this.plugin>['tts'];
    try {
      tts = (await this.call('load', () => this.load())).tts;
      this.diagValue.engineLoaded = true;
      this.stage('loaded');
    } catch (e) { this.note(e); return false; }  /* โหลดปลั๊กอินไม่ได้ */

    for (let i = 0; i < PROBE_TRIES; i++) {
      for (const tag of DIRECT_TAGS) {
        try {
          if ((await this.call(`isLang:${tag}`, () => tts.isLanguageSupported({ lang: tag }))).supported) return this.found(tag, 'isLanguageSupported');
        } catch (e) { this.note(e); /* ระบบ TTS ยังไม่พร้อม — ลองต่อ */ }
      }
      try {
        const { languages } = await this.call('languages', () => tts.getSupportedLanguages());
        this.diagValue.languageCount = Array.isArray(languages) ? languages.length : null;
        const tag = findThaiTag(languages);
        if (tag) return this.found(tag, 'languages');
      } catch (e) { this.note(e); }
      try {
        const { voices } = await this.call('voices', () => tts.getSupportedVoices());
        this.diagValue.voiceCount = Array.isArray(voices) ? voices.length : null;
        const tag = findThaiTag(voices);
        if (tag) return this.found(tag, 'voices');
      } catch (e) { this.note(e); }
      await new Promise((r) => setTimeout(r, PROBE_GAP_MS));
    }
    this.diagValue.hasThai = false;
    this.diagValue.via = null;
    this.stage('done:none');
    return false;
  }

  private note(e: unknown): void {
    if (this.diagValue.error) return;
    const m = e instanceof Error ? e.message : typeof e === 'string' ? e : (e as { message?: unknown } | null)?.message;
    this.diagValue.error = String(m ?? 'unknown').slice(0, 80);
    this.onDiag?.(this.diag());
  }

  private found(tag: string, via: NonNullable<TtsDiag['via']>): true {
    this.lang = toLanguageTag(tag);
    this.diagValue.hasThai = true;
    this.diagValue.via = via;
    this.stage('done:found');
    return true;
  }

  /** อ่าน 1 ท่อน จบเมื่ออ่านเสร็จ ; เรียก stop() ระหว่างอ่าน = promise นี้ไม่จบเอง (ปลั๊กอินล้างคิว) ผู้เรียกต้องใช้ token ตัดสิน */
  async speak(text: string, rate: number): Promise<void> {
    const { tts } = await this.load();
    await tts.speak({ text, lang: this.lang, rate, pitch: 1, volume: 1, category: 'ambient' });
  }

  async stop(): Promise<void> {
    try { await (await this.load()).tts.stop(); } catch { /* ไม่มีอะไรให้หยุด */ }
  }
}
