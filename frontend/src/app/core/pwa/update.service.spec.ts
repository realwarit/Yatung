import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { signal } from '@angular/core';
import { OnlineService } from '../offline/online.service';
import { FAILED_AUTOHIDE_MS, RECHECK_MIN_MS, UpdateService } from './update.service';

type Ev = { type: string; latestVersion?: { hash: string } };

describe('UpdateService — แถบอัปเดต + เช็กตอนแอปกลับมาเปิด', () => {
  let offline = signal(false);
  let vis: DocumentVisibilityState = 'visible';

  function setup(enabled = true) {
    offline = signal(false);
    const versions = new Subject<Ev>();
    const unrecoverable = new Subject<unknown>();
    const sw = { isEnabled: enabled, versionUpdates: versions, unrecoverable, activateUpdate: vi.fn(() => Promise.resolve(true)), checkForUpdate: vi.fn(() => Promise.resolve(false)) };
    TestBed.configureTestingModule({ providers: [{ provide: SwUpdate, useValue: sw }, { provide: OnlineService, useValue: { offline } }] });
    const svc = TestBed.inject(UpdateService);
    let t = 1_000_000;
    svc.now = () => t;
    (svc as unknown as { lastCheckAt: number }).lastCheckAt = t;
    svc.reload = vi.fn();
    svc.watch();
    return { svc, sw, versions, unrecoverable, advance: (ms: number) => { t += ms; } };
  }
  const resume = () => document.dispatchEvent(new Event('visibilitychange'));

  beforeEach(() => {
    vi.useFakeTimers();
    vis = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vis });
  });
  afterEach(() => { vi.useRealTimers(); TestBed.resetTestingModule(); });

  describe('VERSION_INSTALLATION_FAILED', () => {
    it('ขึ้นแถบ failed แล้วหายเองใน 10 วินาที', () => {
      const { svc, versions } = setup();
      versions.next({ type: 'VERSION_INSTALLATION_FAILED' });
      expect(svc.state()).toBe('failed');
      expect(svc.bannerState()).toBe('failed');
      vi.advanceTimersByTime(FAILED_AUTOHIDE_MS - 1);
      expect(svc.state()).toBe('failed');
      vi.advanceTimersByTime(2);
      expect(svc.state()).toBe('none');
    });

    it('ขึ้นไม่เกิน 1 ครั้งต่อการเปิดแอป (หายเองแล้วล้มเหลวอีกก็ไม่ขึ้นซ้ำ)', () => {
      const { svc, versions } = setup();
      versions.next({ type: 'VERSION_INSTALLATION_FAILED' });
      vi.advanceTimersByTime(FAILED_AUTOHIDE_MS + 1);
      versions.next({ type: 'VERSION_INSTALLATION_FAILED' });
      expect(svc.state()).toBe('none');
    });

    it('กดปิดแล้วล้มเหลวอีกก็ไม่ขึ้นซ้ำ', () => {
      const { svc, versions } = setup();
      versions.next({ type: 'VERSION_INSTALLATION_FAILED' });
      svc.dismiss();
      expect(svc.state()).toBe('none');
      versions.next({ type: 'VERSION_INSTALLATION_FAILED' });
      expect(svc.state()).toBe('none');
    });

    it('ออฟไลน์อยู่ = ไม่ขึ้นและไม่นับเป็นครั้งที่ขึ้นแล้ว (กลับมาออนไลน์แล้วล้มเหลวอีกครั้งจึงขึ้น)', () => {
      const { svc, versions } = setup();
      offline.set(true);
      versions.next({ type: 'VERSION_INSTALLATION_FAILED' });
      expect(svc.state()).toBe('none');
      offline.set(false);
      versions.next({ type: 'VERSION_INSTALLATION_FAILED' });
      expect(svc.state()).toBe('failed');
    });

    it('มี ready อยู่แล้ว = ไม่ทับ', () => {
      const { svc, versions } = setup();
      versions.next({ type: 'VERSION_READY', latestVersion: { hash: 'h1' } });
      versions.next({ type: 'VERSION_INSTALLATION_FAILED' });
      expect(svc.state()).toBe('ready');
    });

    it('มี broken อยู่แล้ว = ไม่ทับ', () => {
      const { svc, versions, unrecoverable } = setup();
      unrecoverable.next({ reason: 'x' });
      versions.next({ type: 'VERSION_INSTALLATION_FAILED' });
      expect(svc.state()).toBe('broken');
    });

    it('ระหว่างแถบ failed ถ้าเวอร์ชันพร้อม → เป็น ready และตัวจับเวลาไม่ล้างทับ', () => {
      const { svc, versions } = setup();
      versions.next({ type: 'VERSION_INSTALLATION_FAILED' });
      versions.next({ type: 'VERSION_READY', latestVersion: { hash: 'h1' } });
      expect(svc.state()).toBe('ready');
      vi.advanceTimersByTime(FAILED_AUTOHIDE_MS + 1);
      expect(svc.state()).toBe('ready');
    });

    it('กดปิดแถบ failed → หายทันที', () => {
      const { svc, versions } = setup();
      versions.next({ type: 'VERSION_INSTALLATION_FAILED' });
      svc.dismiss();
      expect(svc.state()).toBe('none');
    });
  });

  describe('แถบ "มีเวอร์ชันใหม่" ปิดได้ (จำในหน่วยความจำรอบเปิดแอป)', () => {
    it('ปิดแล้ว ready ของเวอร์ชันเดิมซ้ำไม่ขึ้นอีก ; เวอร์ชันที่ใหม่กว่า (hash ต่าง) ขึ้นได้', () => {
      const { svc, versions } = setup();
      versions.next({ type: 'VERSION_READY', latestVersion: { hash: 'h1' } });
      expect(svc.bannerState()).toBe('ready');
      svc.dismiss();
      expect(svc.bannerState()).toBe('none');
      expect(svc.state()).toBe('ready');   // ยังพร้อมอัปเดตอยู่ แค่ไม่แสดงแถบ
      versions.next({ type: 'VERSION_READY', latestVersion: { hash: 'h1' } });
      expect(svc.bannerState()).toBe('none');
      versions.next({ type: 'VERSION_READY', latestVersion: { hash: 'h2' } });
      expect(svc.bannerState()).toBe('ready');
    });

    it('สลับแอปกลับมา (resume) หลังปิดแถบ → ไม่ขึ้นซ้ำ และไม่เช็กซ้ำเพราะมีเวอร์ชันรออยู่แล้ว', () => {
      const { svc, sw, versions, advance } = setup();
      versions.next({ type: 'VERSION_READY', latestVersion: { hash: 'h1' } });
      svc.dismiss();
      advance(RECHECK_MIN_MS * 3);
      resume();
      expect(sw.checkForUpdate).not.toHaveBeenCalled();
      expect(svc.bannerState()).toBe('none');
    });

    it('สถานะปิดแถบอยู่ในหน่วยความจำเท่านั้น: ไม่เขียน localStorage/sessionStorage ; เปิดแอปรอบใหม่ (service ใหม่) ขึ้นแถบเวอร์ชันเดิมได้อีก', () => {
      const ls = vi.spyOn(Storage.prototype, 'setItem');
      const { svc, versions } = setup();
      versions.next({ type: 'VERSION_READY', latestVersion: { hash: 'h1' } });
      svc.dismiss();
      versions.next({ type: 'VERSION_INSTALLATION_FAILED' });
      svc.dismiss();
      expect(ls).not.toHaveBeenCalled();
      ls.mockRestore();
      TestBed.resetTestingModule();   // = ปิดแอปแล้วเปิดใหม่
      const again = setup();
      again.versions.next({ type: 'VERSION_READY', latestVersion: { hash: 'h1' } });
      expect(again.svc.bannerState()).toBe('ready');
    });

    it('apply() หลังปิดแถบยังใช้ได้ (activateUpdate + reload)', async () => {
      const { svc, sw, versions } = setup();
      versions.next({ type: 'VERSION_READY', latestVersion: { hash: 'h1' } });
      svc.dismiss();
      svc.apply();
      await vi.advanceTimersByTimeAsync(0);
      expect(sw.activateUpdate).toHaveBeenCalled();
      expect(svc.reload).toHaveBeenCalled();
    });
  });

  describe('เช็กอัปเดตเมื่อแอปกลับมาเปิด', () => {
    it('เว้น ≥ 5 นาที : ก่อนครบไม่เช็ก, ครบแล้วเช็ก 1 ครั้ง, รอบถัดไปต้องรออีก 5 นาที', async () => {
      const { sw, advance } = setup();
      advance(RECHECK_MIN_MS - 1);
      resume();
      expect(sw.checkForUpdate).not.toHaveBeenCalled();
      advance(1);
      resume();
      expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(0);   // เช็กรอบแรกเสร็จ
      advance(RECHECK_MIN_MS - 1);
      resume();
      expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
      advance(1);
      resume();
      expect(sw.checkForUpdate).toHaveBeenCalledTimes(2);
    });

    it('เช็กเฉพาะตอนมองเห็น (hidden ไม่เช็ก)', () => {
      const { sw, advance } = setup();
      advance(RECHECK_MIN_MS);
      vis = 'hidden';
      resume();
      expect(sw.checkForUpdate).not.toHaveBeenCalled();
    });

    it('ไม่เช็กตอนออฟไลน์', () => {
      const { sw, advance } = setup();
      advance(RECHECK_MIN_MS);
      offline.set(true);
      resume();
      expect(sw.checkForUpdate).not.toHaveBeenCalled();
    });

    it('ไม่เช็กเมื่อมี ready รออยู่', () => {
      const { sw, versions, advance } = setup();
      versions.next({ type: 'VERSION_READY', latestVersion: { hash: 'h' } });
      advance(RECHECK_MIN_MS);
      resume();
      expect(sw.checkForUpdate).not.toHaveBeenCalled();
    });

    it('ไม่เช็กเมื่อ broken', () => {
      const { sw, unrecoverable, advance } = setup();
      unrecoverable.next({});
      advance(RECHECK_MIN_MS);
      resume();
      expect(sw.checkForUpdate).not.toHaveBeenCalled();
    });

    it('กำลังเช็กอยู่ไม่เช็กซ้อน ; checkForUpdate ล้มเหลวไม่ทำให้พัง และยังนับระยะเว้น (ไม่ยิงถี่)', async () => {
      const { sw, advance } = setup();
      let rejectIt: (e: Error) => void = () => undefined;
      sw.checkForUpdate.mockImplementationOnce(() => new Promise<boolean>((_, rej) => { rejectIt = rej; }));
      advance(RECHECK_MIN_MS);
      resume();
      resume();
      expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);   // ซ้อนตอนยังไม่เสร็จ = ไม่เรียกซ้ำ
      rejectIt(new Error('net'));
      await vi.advanceTimersByTimeAsync(0);
      resume();   // เพิ่งเช็กไป (ล้มเหลวก็นับ) ยังไม่ครบ 5 นาที
      expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
      advance(RECHECK_MIN_MS);
      resume();
      expect(sw.checkForUpdate).toHaveBeenCalledTimes(2);
    });

    it('pageshow: กู้จาก bfcache (persisted) เช็ก · โหลดปกติไม่เช็ก', () => {
      const { sw, advance } = setup();
      advance(RECHECK_MIN_MS);
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
      expect(sw.checkForUpdate).not.toHaveBeenCalled();
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
      expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
    });

    it('ไม่มี service worker (แอป Android / dev / http) = ไม่ฟังอะไร ไม่เรียก checkForUpdate', () => {
      const { sw, advance } = setup(false);
      advance(RECHECK_MIN_MS * 2);
      resume();
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
      expect(sw.checkForUpdate).not.toHaveBeenCalled();
    });

    it('เลิกฟังเมื่อ service ถูกทำลาย', () => {
      const { sw, advance } = setup();
      advance(RECHECK_MIN_MS);
      TestBed.resetTestingModule();
      resume();
      expect(sw.checkForUpdate).not.toHaveBeenCalled();
    });
  });
});
