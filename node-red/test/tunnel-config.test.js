// วันที่ 12: ตรวจโครง tunnel (Tailscale Funnel + ngrok สำรอง) และกัน state ของ tunnel หาย — ไม่ต้องใช้ docker
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const compose = read('docker-compose.yml');

// ตัดบล็อกของ service จากข้อความ compose (บรรทัด "  <name>:" จนถึง service ถัดไป/ส่วน volumes)
function service(name) {
  const body = compose.split('\n');
  const i = body.findIndex((l) => l === `  ${name}:`);
  assert.ok(i >= 0, `ไม่พบ service ${name}`);
  let j = i + 1;
  while (j < body.length && !/^  [a-z][\w-]*:\s*$/.test(body[j]) && !/^[a-z]+:\s*$/.test(body[j])) j++;
  return body.slice(i + 1, j).join('\n');
}

test('serve.json: Funnel 443 ชี้ frontend:80 ใช้ ${TS_CERT_DOMAIN} ไม่มีชื่อ tailnet จริง', () => {
  const raw = read('tailscale/serve.json');
  const j = JSON.parse(raw);
  assert.deepEqual(j.TCP, { 443: { HTTPS: true } });
  assert.deepEqual(Object.keys(j.Web), ['${TS_CERT_DOMAIN}:443']);
  assert.deepEqual(j.Web['${TS_CERT_DOMAIN}:443'].Handlers, { '/': { Proxy: 'http://frontend:80' } });
  assert.deepEqual(j.AllowFunnel, { '${TS_CERT_DOMAIN}:443': true });
  assert.ok(!/\.ts\.net/.test(raw), 'ห้ามมีชื่อ *.ts.net ใน serve.json');
  assert.deepEqual(Object.keys(j).sort(), ['AllowFunnel', 'TCP', 'Web']);
});

test('service tunnel = Tailscale (pin เวอร์ชัน, ชื่อเครื่อง yatung, state เป็น volume, เปิด Funnel ผ่านไฟล์ serve.json)', () => {
  const t = service('tunnel');
  assert.match(t, /image: tailscale\/tailscale:v\d+\.\d+\.\d+\n/, 'ต้อง pin เวอร์ชัน ห้าม latest/stable');
  assert.match(t, /profiles: \["tunnel"\]/);
  assert.match(t, /TS_HOSTNAME: yatung/);
  assert.match(t, /TS_STATE_DIR: \/var\/lib\/tailscale/);
  assert.match(t, /TS_SERVE_CONFIG: \/config\/serve\.json/);
  assert.match(t, /TS_AUTH_ONCE: "true"/);
  assert.match(t, /- ts_state:\/var\/lib\/tailscale/);
  assert.match(t, /- \.\/tailscale:\/config:ro/, 'mount เป็นโฟลเดอร์');
  assert.ok(t.includes('TS_AUTHKEY: ' + '$' + '{TS_AUTHKEY:-}'), 'key มาจาก .env เท่านั้น ไม่ฝังค่า');
  assert.ok(!/\n    ports:/.test('\n' + t), 'tunnel ต้องไม่เปิดพอร์ตออกเครื่อง');
});

test('volume ts_state เป็น external → docker compose down -v ไม่ลบ state ของ tunnel', () => {
  const v = compose.slice(compose.indexOf('\nvolumes:\n'));
  assert.match(v, /\n  ts_state:\n    external: true\n    name: yatung_ts_state\n/);
});

test('ngrok ย้ายเป็น profile สำรอง tunnel-ngrok (ไม่ใช่ profile เดียวกับ Funnel)', () => {
  const n = service('tunnel-ngrok');
  assert.match(n, /image: ngrok\/ngrok:/);
  assert.match(n, /profiles: \["tunnel-ngrok"\]/);
  assert.match(n, /127\.0\.0\.1:4040:4040/);
});

test('db/nodered/frontend ไม่มี profile (ขึ้นได้โดยไม่มี tunnel) ; tunnel ทั้งสองต้องมี profile', () => {
  for (const s of ['db', 'nodered', 'frontend']) assert.ok(!/profiles:/.test(service(s)), s);
  for (const s of ['tunnel', 'tunnel-ngrok']) assert.match(service(s), /profiles:/, s);
});

test('.env.example: TS_PUBLIC_HOST ประกาศก่อน PUBLIC_BASE_URL/LINE_MASCOT_URL ; มี TS_AUTHKEY ว่าง ; NGROK_* อยู่ส่วนสำรองหลังจากนั้น', () => {
  const lines = read('.env.example').split('\n');
  const at = (re) => lines.findIndex((l) => re.test(l));
  const host = at(/^TS_PUBLIC_HOST=/), pub = at(/^PUBLIC_BASE_URL=/), key = at(/^TS_AUTHKEY=$/), ng = at(/^NGROK_DOMAIN=/), mascot = at(/^LINE_MASCOT_URL=/);
  assert.ok(key >= 0 && host > key && pub > host && mascot > pub && ng > pub);
  assert.equal(lines[pub], 'PUBLIC_BASE_URL=https://${TS_PUBLIC_HOST}');
  assert.ok(at(/^API_BASE_URL=.*NGROK_DOMAIN/) > ng, 'API_BASE_URL อ้าง NGROK_DOMAIN ต้องอยู่หลัง');
});

test('กัน state หาย: สคริปต์ไม่เรียก down -v / volume rm|prune / system prune / recreate service tunnel', () => {
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!['node_modules', '.day4-results'].includes(e.name)) walk(p); } else if (/\.(sh|mjs|js)$/.test(e.name)) files.push(p);
    }
  })(path.join(root, 'scripts'));
  assert.ok(files.length > 10);
  const bad = [];
  for (const f of files) {
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => {
      if (/^\s*(#|\/\/)/.test(l)) return;   // คอมเมนต์ไม่นับ
      const where = `${path.relative(root, f)}:${i + 1}`;
      if (/compose[^|;&]*\bdown\b[^|;&]*(\s-v\b|--volumes)|docker volume (rm|prune)|system prune|volume prune/.test(l)) bad.push(where);
      // บรรทัดที่เป็นแค่ข้อความแนะนำ (ok/bad/warn/echo "…") ไม่นับ — recreate tunnel เองไม่ทำลาย state (volume external) แต่เทสไม่ควรทำ
      if (!/\b(ok|bad|warn|echo)\s+["']/.test(l) && /compose\b[^|;&]*\b(up|restart|stop|rm|kill)\b[^|;&]*\btunnel\b/.test(l) && !/tunnel-ngrok/.test(l)) bad.push(where + ' (แตะ tunnel)');
      if (/compose\b[^|;&]*\bup\b[^|;&]*--force-recreate/.test(l) && !/\b(nodered|frontend|db|tunnel-ngrok)\b/.test(l)) bad.push(where + ' (recreate ทุก service)');
    });
  }
  assert.deepEqual(bad, []);
});

test('nginx ส่งต่อแค่ /api/ และ = /line/webhook ไป Node-RED (editor/admin ไม่หลุดผ่าน Funnel)', () => {
  const ng = read('frontend/nginx.conf');
  const passes = [...ng.matchAll(/proxy_pass\s+([^;]+);/g)].map((m) => m[1]).sort();
  assert.deepEqual(passes, ['http://nodered:1880/api/', 'http://nodered:1880/line/webhook']);
  assert.match(ng, /location \/api\/ \{/);
  assert.match(ng, /location = \/line\/webhook \{/);
});
