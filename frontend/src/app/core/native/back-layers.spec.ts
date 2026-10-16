import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { BackLayers, useBackLayer } from './back-layers';

describe('BackLayers', () => {
  it('ชั้นบนสุดปิดก่อน และถอนแล้วชั้นถัดไปขึ้นมา', () => {
    const l = TestBed.inject(BackLayers);
    const calls: string[] = [];
    const offA = l.push('page', () => calls.push('page'));
    const offB = l.push('overlay', () => calls.push('overlay'));
    expect(l.topScope()).toBe('overlay');
    expect(l.closeTop()).toBe(true);
    expect(calls).toEqual(['overlay']);
    offB();
    expect(l.topScope()).toBe('page');
    offA();
    expect(l.topScope()).toBeNull();
    expect(l.closeTop()).toBe(false);
  });

  it('useBackLayer: ลงทะเบียนเมื่อ open เป็น true และถอนเมื่อเป็น false / ถูกทำลาย', () => {
    const open = signal(false);
    let closed = 0;
    @Component({ selector: 'app-t', template: '' })
    class T { constructor() { useBackLayer(open, () => { closed++; open.set(false); }, 'page'); } }
    const f = TestBed.createComponent(T);
    const l = TestBed.inject(BackLayers);
    f.detectChanges();
    expect(l.topScope()).toBeNull();

    open.set(true); f.detectChanges();
    expect(l.topScope()).toBe('page');
    l.closeTop(); f.detectChanges();
    expect(closed).toBe(1);
    expect(l.topScope()).toBeNull();

    open.set(true); f.detectChanges();
    expect(l.topScope()).toBe('page');
    f.destroy();
    expect(l.topScope()).toBeNull();
  });
});
