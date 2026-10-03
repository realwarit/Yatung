import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/auth/auth.service';
import { IconComponent } from '../../shared/icon.component';
import { MascotMood } from '../../shared/components/mascot/mascot.component';
import { AuthShellComponent } from './auth-shell.component';
import { AuthFocus, focusKind, useIntroMood } from './auth-mascot';

const STRENGTH_LABELS = ['', 'อ่อนมาก', 'พอใช้', 'ดี', 'แข็งแรง'] as const;

/** 1–4: นับเกณฑ์ ยาว ≥ 8 / ≥ 12 / มีตัวพิมพ์เล็กใหญ่หรือตัวเลข / มีสัญลักษณ์ (แนะนำเท่านั้น server บังคับแค่ 8 ตัว) */
function passwordLevel(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  let n = 0;
  if (pw.length >= 8) n++;
  if (pw.length >= 12) n++;
  if ((/[a-z]/.test(pw) && /[A-Z]/.test(pw)) || (/[A-Za-z]/.test(pw) && /\d/.test(pw))) n++;
  if (/[^A-Za-z0-9]/.test(pw)) n++;
  if (pw.length < 8) return 1;
  return Math.max(1, Math.min(4, n)) as 1 | 2 | 3 | 4;
}

function matchPasswords(group: AbstractControl): ValidationErrors | null {
  return group.get('password')?.value === group.get('confirm')?.value ? null : { mismatch: true };
}

@Component({
  selector: 'app-register-page',
  imports: [
    ReactiveFormsModule, RouterLink, MatButtonModule, MatProgressSpinnerModule,
    AuthShellComponent, IconComponent,
  ],
  templateUrl: './register.page.html',
  styleUrl: './auth.scss',
})
export class RegisterPage {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    display_name: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirm: ['', [Validators.required]],
  }, { validators: matchPasswords });
  private readonly pw = toSignal(this.form.controls.password.valueChanges, { initialValue: '' });
  readonly strength = computed(() => {
    const level = passwordLevel(this.pw());
    return level ? { level, label: STRENGTH_LABELS[level] } : null;
  });
  readonly busy = signal(false);
  readonly error = signal('');
  readonly showPassword = signal(false);

  // ---------- น้องยาตรงตอบสนองต่อฟอร์ม ----------
  readonly focus = signal<AuthFocus>(null);
  readonly success = signal(false);
  private readonly errorFresh = signal(false);
  private readonly intro = useIntroMood();

  readonly mood = computed<MascotMood>(() => {
    if (this.success()) return 'celebrate';
    if (this.busy()) return 'thinking';
    if (this.error() && this.errorFresh()) return 'worried';
    const f = this.focus();
    if (f === 'secret') {
      const s = this.strength();
      // พิมพ์รหัสแล้ว → ท่าทางบอกความแข็งแรง; ยังไม่พิมพ์ → เขินปิดตา
      return s ? (s.level <= 2 ? 'worried' : 'happy') : 'shy';
    }
    if (f) return 'watching';
    return this.intro();
  });
  /** กดมาสคอตเพื่อสุ่มประโยคได้เฉพาะตอนฟอร์มสงบ (ไม่ error/ไม่กำลังส่ง) */
  readonly chatty = computed(() => !this.success() && !this.busy() && !(this.error() && this.errorFresh()));
  readonly message = computed(() => {
    if (this.success()) return 'ยินดีต้อนรับค่ะ!';
    if (this.busy()) return 'รอสักครู่นะคะ…';
    if (this.error() && this.errorFresh()) return 'อุ๊ย สมัครไม่สำเร็จค่ะ ดูข้อความในฟอร์มนะคะ';
    const s = this.focus() === 'secret' ? this.strength() : null;
    if (s) return s.level <= 2 ? 'รหัสยังอ่อนอยู่นะคะ ลองเพิ่มความยาวหรือตัวเลข' : 'รหัสแข็งแรงเลยค่ะ!';
    return 'ยินดีที่ได้รู้จักค่ะ! มาเริ่มกันเลย';
  });

  constructor() {
    this.form.valueChanges.subscribe(() => this.errorFresh.set(false));
  }

  onFocusIn(e: FocusEvent): void { this.focus.set(focusKind(e.target)); }
  onFocusOut(e: FocusEvent): void {
    if (!(e.relatedTarget instanceof HTMLElement && e.relatedTarget.closest('form'))) this.focus.set(null);
  }

  /** แสดง error ยืนยันรหัสผ่านเมื่อช่องนี้ถูกแตะแล้ว และไม่ตรงหรือว่าง */
  confirmInvalid(): boolean {
    const c = this.form.controls.confirm;
    return c.touched && (c.invalid || this.form.hasError('mismatch'));
  }

  submit(): void {
    if (this.busy()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set('');
    const v = this.form.getRawValue();
    this.auth.register({ display_name: v.display_name.trim(), email: v.email.trim(), password: v.password }).subscribe({
      next: () => {
        this.success.set(true);   // น้องฉลอง 600ms ก่อนเปลี่ยนหน้า
        setTimeout(() => this.router.navigateByUrl('/scan'), 600);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(AuthService.errorMessage(err));
        this.errorFresh.set(true);
      },
    });
  }
}
