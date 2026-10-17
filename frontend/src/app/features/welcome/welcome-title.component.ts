import { ChangeDetectionStrategy, Component } from '@angular/core';

/** ชื่อแอป "ยาตรง" ตัวอักษรหล่นทีละตัว + คำโปรย ; h1 อ่านเป็น "ยาตรง" คำเดียว (ตัวอักษรย่อย aria-hidden) */
@Component({
  selector: 'app-welcome-title',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hero">
      <h1 aria-label="ยาตรง" class="title">
        @for (l of letters; track $index) {
          <span class="ch" aria-hidden="true" [style.--i]="$index"><span class="back">{{ l }}</span><span class="face">{{ l }}</span></span>
        }
      </h1>
      <p class="tag">กินยาตรงเวลา <span class="nw">น้องยาตรง</span>ช่วยเตือนเองนะคะ</p>
    </section>
  `,
  styleUrl: './welcome-title.component.scss',
})
export class WelcomeTitleComponent {
  protected readonly letters = ['ย', 'า', 'ต', 'ร', 'ง'];
}
