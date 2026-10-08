import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

export type IconName =
  | 'mail' | 'lock' | 'user' | 'eye' | 'eye-off' | 'camera' | 'chat' | 'heart'
  | 'alert' | 'check' | 'info' | 'pill'
  | 'sunrise' | 'sun' | 'sunset' | 'moon' | 'today' | 'chart' | 'sliders' | 'plus' | 'minus'
  | 'chevron-down' | 'logout' | 'clock' | 'undo' | 'edit' | 'ban' | 'bell' | 'dots' | 'thermometer'
  | 'layers' | 'level' | 'bulb' | 'type' | 'trash' | 'image' | 'close' | 'arrow-right' | 'search';

// เส้นไอคอนแบบ inline SVG (ไม่พึ่งฟอนต์ภายนอก ใช้ได้ออฟไลน์) — markup เป็นค่าคงที่ในไฟล์นี้เท่านั้น
const PATHS: Record<IconName, string> = {
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 8 8 5 8-5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  chat: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 10h8M8 13h5"/>',
  heart: '<path d="M12 20s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.2-8 11-8 11z"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.6v.4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.4"/>',
  sunrise: '<path d="M6 16a6 6 0 0 1 12 0M3 16h18M12 3v5M9.5 5.5 12 3l2.5 2.5M4.8 10.2l1.5 1.5M19.2 10.2l-1.5 1.5M8 20h8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  sunset: '<path d="M7 14.5a5 5 0 0 1 10 0M3 14.5h18M12 2v4M9.5 4 12 6.5 14.5 4M6 18h12M9 21.5h6"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  today: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M8.5 15.5l2.5 2.5 4.5-5"/>',
  chart: '<path d="M5 20V11M11 20V4M17 20v-6M3 20h18"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  logout: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  thermometer: '<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/><path d="M12 10v6"/>',
  dots: '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
  bell: '<path d="M6 17v-6a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21h4"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  level: '<rect x="3" y="8" width="18" height="8" rx="2"/><path d="M7 8v3M12 8v4M17 8v3"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  type: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-8 8"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  pill: '<g transform="rotate(-40 12 12)"><rect x="2" y="7.5" width="20" height="9" rx="4.5"/><path d="M12 7.5v9"/></g>',
};

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"
                  [innerHTML]="markup()"></svg>`,
  styles: `
    :host { display: inline-flex; width: 1.25em; height: 1.25em; flex-shrink: 0; transform: translateY(var(--icon-optical-offset, 0)); }
    svg { display: block; width: 100%; height: 100%; }
  `,
})
export class IconComponent {
  private sanitizer = inject(DomSanitizer);
  readonly name = input.required<IconName>();
  protected readonly markup = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(PATHS[this.name()]),
  );
}
