import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/auth/auth.service';
import { IconComponent } from '../../shared/icon.component';
import { AuthShellComponent } from './auth-shell.component';

@Component({
  selector: 'app-login-page',
  imports: [
    ReactiveFormsModule, RouterLink, MatButtonModule, MatProgressSpinnerModule,
    AuthShellComponent, IconComponent,
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
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        // รับเฉพาะ path ภายในแอป กัน open redirect
        const safe = returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/scan';
        this.router.navigateByUrl(safe);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(AuthService.errorMessage(err));
      },
    });
  }
}
