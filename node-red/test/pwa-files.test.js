// ไฟล์ PWA ของ frontend (ไม่ต้องใช้ docker): manifest ครบ · ngsw ไม่แคช /api · ไม่โหลดอะไรจาก CDN ภายนอก
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FE = path.join(__dirname, '..', '..', 'frontend');
const read = (p) => fs.readFileSync(path.join(FE, p), 'utf8');
const manifest = () => JSON.parse(read('public/manifest.webmanifest'));

test('manifest: ฟิลด์ที่ installability + iOS/Android ต้องการ', () => {
  const m = manifest();
  assert.equal(m.name, 'ยาตรง');
  assert.ok(m.short_name && m.short_name.length <= 12);
  assert.equal(m.lang, 'th');
  assert.equal(m.display, 'standalone');
  assert.equal(m.id, '/');
  assert.equal(m.start_url, '/today');
  assert.equal(m.scope, '/');
  assert.equal(m.theme_color, '#0f766e');
  assert.match(m.background_color, /^#[0-9a-f]{6}$/i);
  assert.ok(m.description);
});

test('manifest: ไอคอน 192/512 (any) และ maskable 192/512 มีไฟล์จริง', () => {
  const m = manifest();
  const has = (sizes, purpose) => m.icons.some((i) => i.sizes === sizes && i.purpose === purpose);
  for (const [s, p] of [['192x192', 'any'], ['512x512', 'any'], ['192x192', 'maskable'], ['512x512', 'maskable']]) assert.ok(has(s, p), `${s} ${p}`);
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(FE, 'public', i.src)), i.src);
});

test('manifest: shortcuts "ยาวันนี้" และ "สแกนซองยา" ชี้ route ที่มีจริง และมีไอคอน', () => {
  const m = manifest();
  const byName = Object.fromEntries(m.shortcuts.map((s) => [s.name, s]));
  assert.equal(byName['ยาวันนี้'].url, '/today');
  assert.equal(byName['สแกนซองยา'].url, '/scan');
  const routes = read('src/app/app.routes.ts');
  for (const s of m.shortcuts) {
    assert.ok(routes.includes(`path: '${s.url.slice(1)}'`), s.url);
    for (const i of s.icons) assert.ok(fs.existsSync(path.join(FE, 'public', i.src)), i.src);
  }
});

test('index.html: meta ของ iPhone/Android + manifest + apple-touch-icon', () => {
  const h = read('src/index.html');
  for (const needle of ['rel="manifest"', 'rel="apple-touch-icon"', 'name="theme-color"', 'apple-mobile-web-app-capable', 'mobile-web-app-capable', 'apple-mobile-web-app-title', 'apple-mobile-web-app-status-bar-style']) {
    assert.ok(h.includes(needle), needle);
  }
});

test('ngsw-config: ไม่มี dataGroups และไม่อ้าง /api (cache key ไม่แยก JWT → ข้อมูลข้ามผู้ใช้)', () => {
  const c = JSON.parse(read('ngsw-config.json'));
  assert.ok(!c.dataGroups || c.dataGroups.length === 0, 'ห้ามมี dataGroups');
  assert.ok(!JSON.stringify(c).includes('/api'));
});

test('ngsw.json ที่ build แล้ว (ถ้ามี dist) ไม่มี /api และไม่มี dataGroups', { skip: !fs.existsSync(path.join(FE, 'dist/frontend/browser/ngsw.json')) && 'ยังไม่ได้ ng build' }, () => {
  const n = JSON.parse(read('dist/frontend/browser/ngsw.json'));
  assert.deepEqual(n.dataGroups || [], []);
  assert.ok(!JSON.stringify(n).includes('/api'));
});

test('ไม่โหลดอะไรจาก CDN ภายนอก (ฟอนต์ self-host ผ่าน @fontsource; ไม่ใช้ Material Icons)', () => {
  const h = read('src/index.html');
  assert.ok(!/(googleapis|gstatic|cdn\.)/i.test(h), 'index.html');
  const ng = read('angular.json');
  assert.ok(!/https?:\/\//.test(ng.replace(/https?:\/\/json\.schemastore\.org\S*/g, '').replace(/"\$schema"[^\n]*/g, '')), 'angular.json');
  const used = [...ng.matchAll(/@fontsource\/([\w-]+)\/(?:thai-|latin-)?(\d+)\.css/g)].map((m) => `${m[1]}/${m[2]}`);
  assert.ok(new Set(used).size >= 6, 'ฟอนต์ที่ใช้โหลดผ่าน @fontsource');
  assert.ok(!/mat-icon|material-icons/i.test(read('src/styles.scss')));
});
