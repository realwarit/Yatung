import { DestroyRef, inject, signal } from '@angular/core';
import { MascotMood } from '../../shared/components/mascot/mascot.component';

/** คำทักทายตามช่วงเวลา (เช้า 5–11, บ่าย 12–16, เย็น 17–20, ที่เหลือ = กลางคืน) */
export function greetingFor(date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'อรุณสวัสดิ์ค่ะ! กินยาเช้าหรือยังเอ่ย';
  if (h >= 12 && h < 17) return 'สวัสดีตอนบ่ายค่ะ';
  if (h >= 17 && h < 21) return 'สวัสดีตอนเย็นค่ะ อย่าลืมยาหลังอาหารนะ';
  return 'ก่อนนอนอย่าลืมยานะคะ';
}

export type AuthFocus = 'email' | 'secret' | 'other' | null;

/** จาก event focusin ของฟอร์ม → ช่องที่กำลังโฟกัส (secret = ช่องรหัสผ่านทุกช่อง) */
export function focusKind(el: EventTarget | null): AuthFocus {
  const id = (el as HTMLElement | null)?.id;
  if (!id) return null;
  if (id === 'email') return 'email';
  if (id === 'password' || id === 'confirm' || id === 'toggle-password') return 'secret';
  return 'other';
}

/** mood เริ่มต้น: โบกมือแล้วกลับเป็น happy (โบก 3 รอบ ≈ 3.3 วินาที) */
export function useIntroMood() {
  const mood = signal<MascotMood>('wave');
  const timer = setTimeout(() => mood.set('happy'), 3500);
  inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  return mood.asReadonly();
}
