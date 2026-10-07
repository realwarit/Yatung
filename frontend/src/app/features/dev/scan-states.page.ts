import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ScanStageComponent } from '../scan/ui/scan-stage.component';
import { Mode, Phase } from '../scan/scan.types';

// ซองยาจำลอง (SVG วาดเอง) ใช้แทนรูปจริง — ไม่เรียก API
const MOCK_IMG = 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#e8ecea"/>` +
  `<rect x="120" y="90" width="560" height="420" rx="18" fill="#fff" stroke="#c9d3d0" stroke-width="4"/>` +
  `<rect x="120" y="90" width="560" height="70" rx="18" fill="#0f766e"/>` +
  `<g fill="#12302d"><rect x="160" y="200" width="340" height="18" rx="9"/><rect x="160" y="240" width="260" height="14" rx="7" opacity=".6"/>` +
  `<rect x="160" y="290" width="400" height="14" rx="7" opacity=".6"/><rect x="160" y="330" width="300" height="14" rx="7" opacity=".6"/>` +
  `<rect x="160" y="400" width="220" height="14" rx="7" opacity=".6"/></g></svg>`);

interface Demo {
  title: string;
  mode: Mode;
  phase: Phase;
  desktop: boolean;
  dragging?: boolean;
  img?: boolean;
  info?: string;
  warnings?: string[];
  text?: string;
  step?: number;
  error?: string;
}

const DEMOS: Demo[] = [
  { title: '1. ว่าง (มือถือ)', mode: 'photo', phase: 'idle', desktop: false },
  { title: '2. ว่าง (จอคอม)', mode: 'photo', phase: 'idle', desktop: true },
  { title: '3. ลากไฟล์เข้ามา', mode: 'photo', phase: 'idle', desktop: true, dragging: true },
  { title: '4. มีรูป', mode: 'photo', phase: 'idle', desktop: false, img: true, info: '1600×1200 · 312 KB' },
  {
    title: '5. มีรูป + คำเตือนรูปมืด', mode: 'photo', phase: 'idle', desktop: true, img: true, info: '1200×900 · 148 KB',
    warnings: ['รูปค่อนข้างมืด ลองถ่ายในที่สว่างขึ้นนะคะ', 'รูปเล็กไป ตัวหนังสืออาจอ่านไม่ออก'],
  },
  { title: '6. พิมพ์เอง (ยังไม่ได้พิมพ์)', mode: 'text', phase: 'idle', desktop: false },
  { title: '7. พิมพ์เอง (พิมพ์แล้ว)', mode: 'text', phase: 'idle', desktop: true, text: 'Metformin 500 mg ครั้งละ 1 เม็ด วันละ 2 ครั้ง หลังอาหาร' },
  { title: '8. กำลังอ่าน ขั้น 1', mode: 'photo', phase: 'reading', desktop: false, img: true, step: 1 },
  { title: '9. กำลังอ่าน ขั้น 2', mode: 'photo', phase: 'reading', desktop: true, img: true, step: 2 },
  { title: '10. กำลังอ่าน ขั้น 3', mode: 'photo', phase: 'reading', desktop: false, img: true, step: 3 },
  { title: '11. กำลังอ่าน (โหมดพิมพ์ ข้ามขั้น 1)', mode: 'text', phase: 'reading', desktop: true, text: 'Amlodipine 5 mg วันละ 1 ครั้ง หลังอาหารเช้า', step: 2 },
  {
    title: '12. อ่านไม่สำเร็จ', mode: 'photo', phase: 'error', desktop: false, img: true, info: '1600×1200 · 312 KB',
    error: 'AI อ่านซองยานี้ไม่ได้ ลองถ่ายให้ชัดขึ้น หรือพิมพ์เอง',
  },
];

/** หน้าตรวจทุก state ของหน้า Scan ด้วยข้อมูลจำลอง (เปิดเฉพาะ dev — ดู app.routes.ts) */
@Component({
  selector: 'app-scan-states',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ScanStageComponent],
  template: `
    <h1>/dev/scan-states</h1>
    @for (d of demos; track d.title) {
      <section [attr.data-state]="d.title">
        <h2>{{ d.title }}</h2>
        <app-scan-stage
          [mode]="d.mode" [phase]="d.phase" [desktop]="d.desktop" [dragging]="!!d.dragging"
          [previewUrl]="d.img ? img : null" [imageInfo]="d.info ?? ''" [warnings]="d.warnings ?? []"
          [text]="d.text ?? ''" [errorMessage]="d.error ?? null" [step]="d.step ?? 1" [stickyAction]="false" />
      </section>
    }
  `,
  styles: `
    :host { position: fixed; inset: 0; overflow-y: auto; padding: var(--yt-space-4); background: var(--yt-bg); }
    h1 { font-size: var(--yt-text-lg); }
    section { max-width: 1040px; margin: 0 auto var(--yt-space-6); }
    h2 { margin: 0 0 var(--yt-space-2); font-size: var(--yt-text-base); color: var(--yt-text-muted); }
  `,
})
export class ScanStatesPage {
  protected readonly demos = DEMOS;
  protected readonly img = MOCK_IMG;
}
