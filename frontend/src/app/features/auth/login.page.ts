import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/auth/auth.service';
import { IconComponent } from '../../shared/icon.component';
import { WaveHandComponent } from '../../shared/components/wave-hand/wave-hand.component';
import { MascotMood } from '../../shared/components/mascot/mascot.component';
import { AuthShellComponent } from './auth-shell.component';
import { AuthFocus, focusKind, greetingFor, useIntroMood } from './auth-mascot';

@Component({
  selector: 'app-login-page',
  imports: [
    ReactiveFormsModule, RouterLink, MatButtonModule, MatProgressSpinnerModule,
    AuthShellComponent, IconComponent, WaveHandComponent,
  ],
  templateUrl: './login.page.html',
  styleUrl: './auth.scss',
})
export class LoginPage {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });
  readonly busy = signal(false);
  readonly error = signal('');
  readonly showPassword = signal(false);

  // ---------- น้องยาตรงตอบสนองต่อฟอร์ม ----------
  readonly focus = signal<AuthFocus>(null);
  readonly success = signal(false);
  /** error ที่ยังใหม่ (ผู้ใช้ยังไม่ได้แก้อะไร) — ให้น้องทำหน้าเป็นห่วงจนกว่าจะเริ่มพิมพ์ใหม่ */
  private readonly errorFresh = signal(false);
  private readonly rejected = signal(false);
  private readonly intro = useIntroMood();
  private readonly greeting = greetingFor();

  readonly mood = computed<MascotMood>(() => {
    if (this.success()) return 'celebrate';
    if (this.busy()) return 'thinking';
    if (this.error() && this.errorFresh()) return 'worried';
    const f = this.focus();
    if (f === 'secret') return 'shy';
    if (f === 'email') return 'watching';
    return this.intro();
  });
  /** กดมาสคอตเพื่อสุ่มประโยคได้เฉพาะตอนฟอร์มสงบ (ไม่ error/ไม่กำลังส่ง) */
  readonly chatty = computed(() => !this.success() && !this.busy() && !(this.error() && this.errorFresh()));
  readonly message = computed(() => {
    if (this.success()) return 'ยินดีต้อนรับกลับมาค่ะ!';
    if (this.busy()) return 'รอสักครู่นะคะ…';
    if (this.error() && this.errorFresh()) {
      return this.rejected() ? 'อุ๊ย อีเมลหรือรหัสไม่ถูกนะคะ ลองใหม่อีกครั้ง' : 'อุ๊ย มีบางอย่างผิดพลาดค่ะ ลองใหม่อีกครั้งนะคะ';
    }
    return this.greeting;
  });

  constructor() {
    this.form.valueChanges.subscribe(() => this.errorFresh.set(false));
  }

  onFocusIn(e: FocusEvent): void { this.focus.set(focusKind(e.target)); }
  onFocusOut(e: FocusEvent): void {
    // ย้ายโฟกัสไปช่องอื่นในฟอร์มเดียวกัน → ปล่อยให้ focusin ตั้งค่าใหม่
    if (!(e.relatedTarget instanceof HTMLElement && e.relatedTarget.closest('form'))) this.focus.set(null);
  }

  submit(): void {
    if (this.busy()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set('');
    const { email, password } = this.form.getRawValue();
    this.auth.login(email.trim(), password).subscribe({
      next: () => {
        // ให้น้องฉลอง 600ms ก่อนเปลี่ยนหน้า (busy ค้างไว้กันกดซ้ำ)
        this.success.set(true);
        setTimeout(() => this.navigateAfterLogin(), 600);
      },
      error: (err) => {
        this.busy.set(false);
        this.rejected.set(err instanceof HttpErrorResponse && err.status === 401);
        this.error.set(AuthService.errorMessage(err));
        this.errorFresh.set(true);
      },
    });
  }

  private navigateAfterLogin(): void {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    // รับเฉพาะ path ภายในแอป กัน open redirect
    const safe = returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/scan';
    this.router.navigateByUrl(safe);
  }
}
