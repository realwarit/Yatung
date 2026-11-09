// วันที่ 12: ตัวสแกนความลับต้องจับ auth key / ชื่อ *.ts.net จริง (ตัวควบคุมบวก) และไม่จับ placeholder (ตัวควบคุมลบ)
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// ค่าทดสอบสร้างสุ่มตอนรัน (ไม่ใช้ค่าจาก .env และไม่ให้ตัวสแกนเจอตัวไฟล์เทสเอง)
const rnd = (n, alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') => Array.from(crypto.randomBytes(n), (b) => alpha[b % alpha.length]).join('');
const label = () => rnd(8, 'abcdefghijklmnopqrstuvwxyz0123456789');
const TS = 'ts' + '.net';

test('ตัวควบคุมบวก: auth key / TS_AUTHKEY ค่าจริง / ชื่อ *.ts.net จริง ถูกจับ', async () => {
  const { scanLine } = await import('../../scripts/lib/secret-scan.mjs');
  assert.deepEqual(scanLine('TS_AUTHKEY=' + 'tskey-' + 'auth-' + rnd(10) + '-' + rnd(32)), ['Tailscale auth key', 'TS_AUTHKEY ค่าจริง']);
  assert.deepEqual(scanLine('TS_AUTHKEY=' + rnd(30)), ['TS_AUTHKEY ค่าจริง']);
  assert.ok(scanLine('tskey-' + 'client-' + rnd(12) + '-' + rnd(20)).includes('Tailscale auth key'));
  const full = `yatung.${label()}.${TS}`, tail = `${label()}.${TS}`;
  const NAME = 'ชื่อเครื่อง/tailnet ของ Tailscale (*.ts.net)';
  for (const t of [`TS_PUBLIC_HOST=${full}`, `PUBLIC_BASE_URL=https://${full}`, `url https://${tail}/line/webhook`, `"${full}"`, `webhook ${full}/line/webhook`]) assert.deepEqual(scanLine(t), [NAME], t);
});

test('ตัวควบคุมลบ: placeholder ในเอกสาร/.env.example/compose ไม่ถูกจับ', async () => {
  const { scanLine } = await import('../../scripts/lib/secret-scan.mjs');
  for (const ok of ['TS_AUTHKEY=', 'TS_AUTHKEY: ${TS_AUTHKEY:-}', 'TS_PUBLIC_HOST=yatung.your-tailnet.' + TS, 'PUBLIC_BASE_URL=https://${TS_PUBLIC_HOST}',
    'ชื่อเต็ม yatung.<tailnet>.' + TS, 'ทุกชื่อ *.' + TS, 'ตัวอย่าง https://yatung.•••.' + TS, 'host tailXXXX.' + TS, '"${TS_CERT_DOMAIN}:443"', 'ชื่อ example.' + TS]) assert.deepEqual(scanLine(ok), [], ok);
});

test('scanPatch: diff ที่เพิ่มชื่อ *.ts.net จริงถูกรายงานเป็นไฟล์/บรรทัด โดยไม่คืนค่า', async () => {
  const { scanPatch } = await import('../../scripts/lib/secret-scan.mjs');
  const host = `yatung.${label()}.${TS}`;
  const r = scanPatch(['@@C abc1234', '+++ b/README.md', '@@ -1,0 +3,1 @@', `+เปิด https://${host}/today`].join('\n'));
  assert.deepEqual(r, [{ type: 'ชื่อเครื่อง/tailnet ของ Tailscale (*.ts.net)', file: 'README.md', ref: 'abc1234', line: 3 }]);
  assert.ok(!JSON.stringify(r).includes(host));
});

test('ไฟล์ที่ track อยู่ใน repo ตอนนี้ไม่มีชื่อ *.ts.net / auth key จริง', async () => {
  const { scanLine } = await import('../../scripts/lib/secret-scan.mjs');
  const root = path.resolve(__dirname, '../..');
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter((f) => /\.(md|sh|mjs|js|ts|yml|json|example)$/.test(f) && !/(^|\/)(node_modules|screenshots)\//.test(f));
  const hits = [];
  for (const f of files) {
    let txt; try { txt = fs.readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
    txt.split('\n').forEach((line, i) => { for (const t of scanLine(line, f)) if (/Tailscale|TS_AUTHKEY|ts\.net/.test(t)) hits.push(`${t}: ${f}:${i + 1}`); });
  }
  assert.deepEqual(hits, []);
});
