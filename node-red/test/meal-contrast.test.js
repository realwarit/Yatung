// D2.5: contrast ของสีประจำมื้อและกล่องคำพูด (token ใน frontend/src/styles/_tokens.scss) ต้อง ≥ 4.5:1 ทุกคู่ fg/bg — ไม่ใช้ docker
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const tokens = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'styles', '_tokens.scss'), 'utf8');
const hex = (name) => { const m = tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`)); assert.ok(m, `ไม่พบ token --${name}`); return m[1]; };
const lum = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const MEALS = ['morning', 'noon', 'evening', 'bedtime'];
for (const m of MEALS) {
  test(`สีมื้อ ${m}: fg บน bg ≥ 4.5:1 (และบนขาว สำหรับ chip พื้นขาว)`, () => {
    const bg = hex(`yt-meal-${m}-bg`), fg = hex(`yt-meal-${m}-fg`);
    const onBg = ratio(fg, bg), onWhite = ratio(fg, '#ffffff');
    console.log(`  ${m}: fg/bg = ${onBg.toFixed(2)} · fg/ขาว = ${onWhite.toFixed(2)}`);
    assert.ok(onBg >= 4.5, `${m} fg/bg ${onBg.toFixed(2)}`);
    assert.ok(onWhite >= 4.5, `${m} fg/ขาว ${onWhite.toFixed(2)}`);
  });
}
for (const t of ['info', 'warning', 'success']) {
  test(`กล่องคำพูด ${t}: fg บน bg ≥ 4.5:1`, () => {
    const r = ratio(hex(`yt-bubble-${t}-fg`), hex(`yt-bubble-${t}-bg`));
    console.log(`  ${t}: ${r.toFixed(2)}`);
    assert.ok(r >= 4.5, `${t} ${r.toFixed(2)}`);
  });
}
test('ไอคอนมื้อบนวงกลม accent (fg บน accent) ≥ 3:1 (องค์ประกอบกราฟิก)', () => {
  for (const m of MEALS) assert.ok(ratio(hex(`yt-meal-${m}-fg`), hex(`yt-meal-${m}-accent`)) >= 3, m);
});
