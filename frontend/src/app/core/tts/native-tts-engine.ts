import type { TtsEngine } from './tts-engine';

/**
 * เครื่องยนต์อ่านออกเสียงของแอป Android — ห่อ `@capacitor-community/text-to-speech` (Android TextToSpeech ของระบบ)
 * ไฟล์นี้ถูก import() แบบ lazy เฉพาะ build native เท่านั้น (ดู TTS_ENV) ปลั๊กอินจึงไม่อยู่ใน initial bundle
 */
const LANG = 'th-TH';
const PROBE_TRIES = 6;
const PROBE_GAP_MS = 500;

export class NativeTtsEngine implements TtsEngine {
  private plugin: typeof import('@capacitor-community/text-to-speech').TextToSpeech | null = null;

  private async load() {
    if (!this.plugin) this.plugin = (await import('@capacitor-community/text-to-speech')).TextToSpeech;
    return this.plugin;
  }

  /** เครื่องมีเสียงไทยไหม — TextToSpeech ของระบบเริ่มทำงานแบบ async จึงถามซ้ำสั้นๆ ก่อนสรุปว่าไม่มี */
  async probe(): Promise<boolean> {
    try {
      const tts = await this.load();
      for (let i = 0; i < PROBE_TRIES; i++) {
        try {
          if ((await tts.isLanguageSupported({ lang: LANG })).supported) return true;
        } catch { /* ระบบ TTS ยังไม่พร้อม — ลองใหม่ */ }
        await new Promise((r) => setTimeout(r, PROBE_GAP_MS));
      }
    } catch { /* โหลดปลั๊กอินไม่ได้ */ }
    return false;
  }

  /** อ่าน 1 ท่อน จบเมื่ออ่านเสร็จ ; เรียก stop() ระหว่างอ่าน = promise นี้ไม่จบเอง (ปลั๊กอินล้างคิว) ผู้เรียกต้องใช้ token ตัดสิน */
  async speak(text: string, rate: number): Promise<void> {
    const tts = await this.load();
    await tts.speak({ text, lang: LANG, rate, pitch: 1, volume: 1, category: 'ambient' });
  }

  async stop(): Promise<void> {
    try { await (await this.load()).stop(); } catch { /* ไม่มีอะไรให้หยุด */ }
  }
}
