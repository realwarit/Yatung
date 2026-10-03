import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/auth/auth.service';
import { IconComponent } from '../../shared/icon.component';
import { AuthShellComponent } from './auth-shell.component';

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
      next: () => this.router.navigateByUrl('/scan'),
      error: (err) => {
        this.busy.set(false);
        this.error.set(AuthService.errorMessage(err));
      },
    });
  }
}
