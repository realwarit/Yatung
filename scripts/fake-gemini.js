// Gemini ปลอมสำหรับทดสอบ backend โดยไม่เปลืองโควตา: node scripts/fake-gemini.js [port]
// พฤติกรรมตามชื่อรุ่นใน URL (/v1beta/models/<model>:generateContent):
//   down* → 503 เสมอ    slow  → ไม่ตอบ (ค้าง 120 วินาที)    rl → 429    flaky → ครั้งแรก 503 ครั้งต่อไป 200
//   trip2 → 2 ครั้งแรก 503 แล้วเป็น 200 (รุ่นหลักที่กลับมาปกติ)    slow2 → 2 ครั้งแรกค้าง (timeout) แล้วเป็น 200
//   bad   → 400    maxtok → 200 แต่ finishReason=MAX_TOKENS (ถูกตัด)    ok → 200 (ผลจาก prompts/mock-response.json)
// ตรวจ body แบบเดียวกับที่ Gemini จริงเคยปฏิเสธ: มี maxItems / responseSchema / temperature, ไม่มี maxOutputTokens=4096 หรือ thinkingLevel ไม่ตรงรุ่น (ชื่อรุ่นมี lite = minimal, อื่นๆ = low) → 400 (กันถอยหลัง)
// บันทึกแต่ละคำขอที่ stdout: "REQ <model> <status>"
const http = require('http');
const fs = require('fs');
const path = require('path');
const mock = fs.readFileSync(path.join(__dirname, '..', 'node-red', 'data', 'prompts', 'mock-response.json'), 'utf8');
const seen = {};
http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const model = decodeURIComponent((req.url.match(/models\/([^:/]+):generateContent/) || [])[1] || '?');
    seen[model] = (seen[model] || 0) + 1;
    const send = (code, obj) => { console.log(`REQ ${model} ${code}`); res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.headers['x-goog-api-key'] === undefined || req.url.includes('key=')) return send(401, { error: { code: 401, message: 'key ต้องอยู่ใน header x-goog-api-key เท่านั้น' } });
    let b; try { b = JSON.parse(body); } catch (e) { return send(400, { error: { code: 400, message: 'bad json' } }); }
    const gc = b.generationConfig || {};
    const think = gc.thinkingConfig && gc.thinkingConfig.thinkingLevel;
    const wantThink = /lite/i.test(model) ? 'minimal' : 'low';   // เหมือน Gemini จริง: รุ่น flash (ไม่ใช่ lite) ไม่รับ minimal
    if (/maxItems/.test(body) || gc.responseSchema || 'temperature' in gc || gc.maxOutputTokens !== 4096 || think !== wantThink || !gc.responseJsonSchema || !b.systemInstruction || !b.contents) {
      return send(400, { error: { code: 400, message: 'Request contains an invalid argument.', status: 'INVALID_ARGUMENT' } });
    }
    if (model === 'slow2' && seen[model] <= 2) return void setTimeout(() => { try { send(200, {}); } catch (e) {} }, 120000);
    if (model === 'trip2' && seen[model] <= 2) return send(503, { error: { code: 503, message: 'high demand', status: 'UNAVAILABLE' } });
    if (model === 'slow') return void setTimeout(() => { try { send(200, {}); } catch (e) {} }, 120000);
    if (model.startsWith('down')) return send(503, { error: { code: 503, message: 'high demand', status: 'UNAVAILABLE' } });
    if (model === 'rl' || model === 'flash-rl') return send(429, { error: { code: 429, message: 'quota' } });
    if (model === 'maxtok') return send(200, { candidates: [{ content: { parts: [{ text: '{"ocr_text":"ถูกตัด' }] }, finishReason: 'MAX_TOKENS' }] });
    if (model === 'bad') return send(400, { error: { code: 400, message: 'bad' } });
    if (model === 'flaky' && seen[model] === 1) return send(503, { error: { code: 503, message: 'overloaded' } });
    send(200, { candidates: [{ content: { parts: [{ text: mock }] }, finishReason: 'STOP' }] });
  });
}).listen(Number(process.argv[2] || 8799), '0.0.0.0', () => console.log('fake gemini ready'));
