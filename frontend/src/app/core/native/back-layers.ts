import { Injectable, Signal, effect, inject } from '@angular/core';

/** ชั้นที่ปุ่ม back ของ Android ต้องปิดก่อนออกจากหน้า: กล่องยืนยันแบบ inline (ไม่ใช่ dialog) */
export type BackLayerScope = 'page' | 'overlay';

interface Layer { scope: BackLayerScope; close: () => void; }

/** ทะเบียนชั้น inline เรียงตามลำดับที่เปิด (บนสุดอยู่ท้าย) ; ไม่ import ปลั๊กอิน — ใช้ได้บนเว็บโดยไม่มีผล */
@Injectable({ providedIn: 'root' })
export class BackLayers {
  private readonly stack: Layer[] = [];

  /** คืนฟังก์ชันถอนชั้นออก */
  push(scope: BackLayerScope, close: () => void): () => void {
    const layer: Layer = { scope, close };
    this.stack.push(layer);
    return () => { const i = this.stack.indexOf(layer); if (i >= 0) this.stack.splice(i, 1); };
  }

  topScope(): BackLayerScope | null {
    return this.stack.length ? this.stack[this.stack.length - 1].scope : null;
  }

  /** ปิดชั้นบนสุด ; คืน true ถ้ามีชั้นให้ปิด */
  closeTop(): boolean {
    const top = this.stack[this.stack.length - 1];
    if (!top) return false;
    top.close();
    return true;
  }
}

/**
 * ผูกกล่องยืนยัน inline กับปุ่ม back : `open()` เป็น true = ลงทะเบียน, false/ถูกทำลาย = ถอน
 * `scope`: 'overlay' = อยู่ใน sheet/dialog (back ปิดกล่องนี้ก่อนปิด sheet) · 'page' = อยู่ในหน้า (ปิดหลัง sheet ที่ซ้อนบนหน้า)
 * เรียกใน injection context (constructor / field initializer)
 */
export function useBackLayer(open: Signal<boolean>, close: () => void, scope: BackLayerScope): void {
  const layers = inject(BackLayers);
  effect((onCleanup) => {
    if (open()) onCleanup(layers.push(scope, close));
  });
}
