import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SegmentedComponent, SegmentedOption } from '../../shared/components/segmented/segmented.component';
import { TtsButtonComponent } from '../../shared/components/tts-button/tts-button.component';
import { IconComponent } from '../../shared/icon.component';
import { TRY_PHRASE, TTS_RATES, TtsService } from '../../core/tts/tts.service';

/** ส่วน "เสียงอ่าน" (8B): เลือกเสียง (ถ้ามีหลายเสียง) · ความเร็ว · ทดลองฟัง ; เครื่องที่ไม่มีเสียงไทย = อธิบายวิธีเพิ่มเสียง
 *  ค่าที่ตั้งเก็บในเครื่องนี้เท่านั้น (localStorage) เพราะแต่ละเครื่องมีเสียงไม่เหมือนกัน */
@Component({
  selector: 'app-tts-section',
  imports: [SegmentedComponent, TtsButtonComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tts.canSpeak()) {
      <p class="hint">ให้แอปอ่านรายการยาออกเสียงให้ฟัง กดปุ่ม <app-icon name="volume" /> ในหน้า "วันนี้" และ "สรุป" (แอปไม่พูดเองโดยอัตโนมัติ)</p>
      <p class="hint">ตั้งค่านี้ใช้เฉพาะเครื่องนี้ เพราะแต่ละเครื่องมีเสียงไม่เหมือนกัน</p>

      <p class="hint voice-now" id="tts-voice-now">เสียงที่ใช้: @if (tts.selectedVoice(); as v) { <strong>{{ v.name }} ({{ v.lang }})</strong> } @else { <strong>เสียงเริ่มต้นของเครื่อง (th-TH)</strong> }</p>

      @if (tts.thaiVoices().length > 1) {
        <div class="field">
          <label class="yt-label" for="tts-voice">เสียงที่ใช้อ่าน</label>
          <div class="yt-control">
            <select id="tts-voice" [value]="tts.selectedVoice()?.voiceURI ?? ''" (change)="tts.setVoice($any($event.target).value)">
              @for (v of tts.thaiVoices(); track v.voiceURI) { <option [value]="v.voiceURI">{{ v.name }}</option> }
            </select>
          </div>
        </div>
      }

      <div class="field">
        <p class="yt-label" id="tts-rate-label">ความเร็วในการอ่าน</p>
        <app-segmented [options]="rates" [value]="rateValue()" (valueChange)="tts.setRate(+$event)" label="ความเร็วในการอ่าน" />
      </div>

      <app-tts-button variant="inline" label="ทดลองฟัง" ttsKey="settings-try" [build]="tryPhrase" />
    } @else if (!tts.supported()) {
      <p class="yt-alert" role="status"><app-icon name="info" /> <span>เบราว์เซอร์นี้ยังอ่านออกเสียงไม่ได้ค่ะ ไม่เป็นไร — ยังดูตารางยาและรับการเตือนได้ตามปกติ ถ้าอยากฟังลองเปิดด้วย Chrome หรือ Safari รุ่นใหม่</span></p>
    } @else {
      <p class="yt-alert" role="status"><app-icon name="info" /> <span>เครื่องนี้ยังไม่มีเสียงภาษาไทย จึงยังไม่มีปุ่มอ่านออกเสียงค่ะ เพิ่มเสียงไทยได้ตามนี้</span></p>
      <ul class="how">
        <li><strong>Android</strong> ติดตั้งแอป "Speech Services by Google" จาก Play Store แล้วไปที่ ตั้งค่า → ระบบ → ภาษาและการป้อนข้อมูล → เอาต์พุตการอ่านออกเสียง → ติดตั้งข้อมูลเสียงภาษาไทย</li>
        <li><strong>Windows</strong> ตั้งค่า → เวลาและภาษา → เสียงพูด → เพิ่มเสียง → เลือก ไทย</li>
        <li><strong>iPhone/iPad</strong> ตั้งค่า → การเข้าถึง → เนื้อหาที่พูด → เสียง → ไทย แล้วดาวน์โหลดเสียงที่ต้องการ</li>
      </ul>
      <p class="hint">เมื่อเพิ่มเสียงแล้ว ปิดแล้วเปิดแอปใหม่ ปุ่มอ่านออกเสียงจะปรากฏเองค่ะ</p>
    }
  `,
  styles: `
    :host { display: block; }
    .hint { margin: 0 0 var(--yt-space-3); color: var(--yt-text-muted); }
    .field { margin-bottom: var(--yt-space-4); }
    .how { margin: 0 0 var(--yt-space-3); padding-left: 1.2em; display: flex; flex-direction: column; gap: var(--yt-space-2); }
    .yt-alert { margin: 0 0 var(--yt-space-3); }
    select { width: 100%; min-height: var(--yt-tap); font: inherit; background: transparent; border: 0; color: inherit; }
  `,
})
export class TtsSectionComponent {
  protected readonly tts = inject(TtsService);
  protected readonly rates: SegmentedOption[] = TTS_RATES.map((r) => ({ value: String(r.value), label: r.label }));
  protected readonly rateValue = computed(() => String(this.tts.rate()));
  protected readonly tryPhrase = (): string[] => [TRY_PHRASE];
}
