// ตัวตรวจ "ลูกล้นพ่อ" (8D-FIX 4-5) + ตัวช่วยของเกณฑ์ใหม่ — ใช้ร่วมโดย overflow-check.mjs และ first-screen-check.mjs
// เดิมตรวจแค่ scrollWidth ของ html/body/.main ซึ่งไม่จับกรณีปุ่มยื่นเลยขอบ "การ์ด" (การ์ดไม่ใช่ตัวเลื่อน และปุ่มยังอยู่ในจอ) จึงไม่เคยจับ 4-5 ได้
import { readFileSync } from 'node:fs';

/** ความกว้าง/เมทริกซ์โหมดขยายตัวอักษรระบบ : คูณ root font-size (ตามสเกลที่ผู้ใช้เลือก) */
export async function applyTextZoom(ctx, factor) {
  if (!factor || Number(factor) === 100) return;
  const k = Number(factor) / 100;
  await ctx.addInitScript((kk) => {
    const add = () => {
      const s = document.createElement('style');
      s.id = '__tz';
      s.textContent = `html{font-size:calc(100% * var(--yt-font-scale) * ${kk}) !important}`;
      (document.head ?? document.documentElement).appendChild(s);
    };
    if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
  }, k);
}

/** ใส่รูปซองยาในหน้า /scan ด้วยการวาง (paste) ไฟล์ — ใช้เส้นทางเดียวกับ acceptFile ของหน้าจริง */
export async function loadScanImage(page, file) {
  const b64 = readFileSync(file).toString('base64');
  const name = file.split(/[\/]/).pop();
  const mime = /\.png$/i.test(name) ? 'image/png' : 'image/jpeg';
  await page.waitForSelector('app-scan-stage', { timeout: 8000 });
  await page.evaluate(([b, n, m]) => {
    const bin = atob(b); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([u], n, { type: m }));
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [b64, name, mime]);
  await page.waitForSelector('app-scan-capture img', { timeout: 15000 });
  await page.waitForTimeout(400);
}

/**
 * รันในหน้า : คืนรายการ "ลูกล้นพ่อ"
 *  - ทุก button/a/input/textarea/select/ion-segment(-button)/ion-button/[role=button] และข้อความ ต้องอยู่ใน content box ของการ์ดที่ครอบ (คลาดได้ ≤ 1px)
 *    การ์ด = ancestor ใกล้สุดที่เป็น .card/.yt-card/mat-card/.bar/.sheet/.act/.frame/dialog/bottom-sheet ที่มีพื้นหลัง/เส้นขอบ/เงา (มองเห็นเป็นกรอบ) หรือเป็นแถบ sticky
 *  - ป้ายปุ่ม scrollWidth <= clientWidth (รวม .button-native ของ ion-button)
 */
export function childOverflowProbe() {
  const TOL = 1;
  const CARD = '.card, .yt-card, mat-card, .bar, .sheet, [role="dialog"], mat-bottom-sheet-container, .mat-mdc-dialog-surface, app-sheet-frame';
  const vis = (e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.clipPath === 'none'; };
  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const c = [...el.classList].slice(0, 2).join('.');
    if (c) s += '.' + c;
    return s;
  };
  const content = (c) => {
    const b = c.getBoundingClientRect(); const cs = getComputedStyle(c);
    return { l: b.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), r: b.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight), outerL: b.left, outerR: b.right };
  };
  const cardOf = (e) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.matches(CARD) && vis(p)) return p;
    }
    return null;
  };
  // องค์ประกอบที่ตั้งใจชิดขอบการ์ด (พ่อระหว่างทางมี margin ซ้าย/ขวาติดลบ เช่น กราฟ 7 วัน, แถบปุ่ม sticky) → เทียบกับขอบนอกของการ์ดแทน content box
  const bleeds = (e, card) => { for (let p = e.parentElement; p && p !== card; p = p.parentElement) { const cs = getComputedStyle(p); const nl = parseFloat(cs.marginLeft), nr = parseFloat(cs.marginRight); if ((nl < 0 && parseFloat(cs.paddingLeft) < -nl - 1) || (nr < 0 && parseFloat(cs.paddingRight) < -nr - 1)) return true; } return false; };
  const absPseudo = (e) => ['::before', '::after'].some((q) => getComputedStyle(e, q).position === 'absolute' && getComputedStyle(e, q).content !== 'none');
  const issues = [];
  const push = (kind, el, msg) => { if (issues.length < 25) issues.push(`${kind} ${sel(el)} ${msg}`); };
  const ctrls = [...document.querySelectorAll('button, a[href], a[mat-button], input, textarea, select, ion-button, ion-segment, ion-segment-button, [role="button"], .yt-chip')].filter(vis);
  for (const e of ctrls) {
    if (e.closest('.sr-only, [aria-hidden="true"][style*="clip"]')) continue;
    if (e.matches('input[type="file"]')) continue;
    const card = cardOf(e);
    const b = e.getBoundingClientRect();
    if (card) {
      const c = content(card);
      // ปุ่มที่ตั้งใจยื่นออกนอก padding (เช่น .act ที่ margin ติดลบ) ใช้ขอบนอกของการ์ดเป็นเกณฑ์ ; ที่เหลือใช้ content box
      const allowOuter = bleeds(e, card);
      const L = allowOuter ? c.outerL : c.l, R = allowOuter ? c.outerR : c.r;
      if (b.left < L - TOL || b.right > R + TOL) push('ปุ่ม/ช่องยื่นเลยกรอบ', e, `[${Math.round(b.left)}..${Math.round(b.right)}] กรอบ ${sel(card)} content [${Math.round(L)}..${Math.round(R)}] (เกิน ${Math.round(Math.max(L - b.left, b.right - R))}px)`);
    }
    // ป้ายปุ่มต้องไม่ล้นตัวปุ่ม
    const native = e.tagName === 'ION-BUTTON' ? e.shadowRoot?.querySelector('.button-native') : e;
    // ::before ที่ขยายพื้นที่แตะ (ตำแหน่ง absolute) ทำให้ scrollWidth โตทั้งที่ป้ายไม่ล้น → ปุ่มกลุ่มนี้ตรวจจากตำแหน่งข้อความด้านล่างแทน
    if (native && /^(ION-BUTTON|BUTTON|A)$/.test(e.tagName) && !absPseudo(native) && native.scrollWidth > native.clientWidth + TOL) push('ป้ายล้นปุ่ม', e, `scrollWidth ${native.scrollWidth} > clientWidth ${native.clientWidth}`);
    if (e.tagName === 'ION-BUTTON') {
      const inner = e.shadowRoot?.querySelector('.button-inner');
      const nb = native?.getBoundingClientRect();
      if (inner && nb) { const ib = inner.getBoundingClientRect(); if (ib.right > nb.right + TOL || ib.left < nb.left - TOL) push('ป้ายล้นปุ่ม', e, `เนื้อใน [${Math.round(ib.left)}..${Math.round(ib.right)}] ปุ่ม [${Math.round(nb.left)}..${Math.round(nb.right)}]`); }
    }
  }
  // ป้ายในปุ่ม ต้องอยู่ใน content box ของปุ่มเอง (ใช้ตำแหน่งข้อความ ไม่พึ่ง scrollWidth)
  for (const e of ctrls.filter((x) => /^(ION-BUTTON|BUTTON|A)$/.test(x.tagName))) {
    const native = e.tagName === 'ION-BUTTON' ? e.shadowRoot?.querySelector('.button-native') : e;
    if (!native) continue;
    const nb = native.getBoundingClientRect(); const ncs = getComputedStyle(native);
    const L = nb.left + parseFloat(ncs.borderLeftWidth) + parseFloat(ncs.paddingLeft) - TOL, R = nb.right - parseFloat(ncs.borderRightWidth) - parseFloat(ncs.paddingRight) + TOL;
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); const r2 = document.createRange();
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const pe = t.parentElement; if (!(t.textContent || '').trim() || !pe || !vis(pe) || pe.closest('.sr-only')) continue;
      r2.selectNodeContents(t);
      if ([...r2.getClientRects()].some((q) => q.width > 2 && (q.right > R + 0.5 + 0 && q.right > nb.right + TOL || q.left < nb.left - TOL))) { push('ป้ายล้นปุ่ม', e, `"${t.textContent.trim().slice(0, 24)}" ล้นขอบปุ่ม [${Math.round(nb.left)}..${Math.round(nb.right)}]`); break; }
    }
  }
  // ข้อความ : ทุก text node ที่มองเห็นต้องอยู่ใน content box ของการ์ดที่ครอบ
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const rg = document.createRange();
  for (let t = tw.nextNode(); t && issues.length < 25; t = tw.nextNode()) {
    if (!(t.textContent || '').trim()) continue;
    const el = t.parentElement; if (!el || !vis(el) || el.closest('.sr-only, script, style, [aria-hidden="true"]')) continue;
    const card = cardOf(el); if (!card) continue;
    rg.selectNodeContents(t);
    const c = content(card);
    const bl = bleeds(el, card);
    for (const q of rg.getClientRects()) {
      if (q.width < 2) continue;
      if (q.left < (bl ? c.outerL : c.l) - TOL || q.right > (bl ? c.outerR : c.r) + TOL) { push('ข้อความยื่นเลยกรอบ', el, `"${t.textContent.trim().slice(0, 24)}" [${Math.round(q.left)}..${Math.round(q.right)}] กรอบ ${sel(card)} [${Math.round(c.l)}..${Math.round(c.r)}]`); break; }
    }
  }
  return issues;
}
