// อุ่นการเชื่อมต่อ Gemini ตอน Node-RED เริ่มทำงาน: เรียก models.get 1 ครั้ง (GET metadata ของรุ่น ไม่นับโควตา generateContent)
// ให้ DNS/TLS พร้อม และเห็นใน log ว่า Gemini ตอบหรือไม่ก่อนคำขอจริง — ไม่ throw, ไม่บล็อกการเริ่ม, ไม่ log API key
// log: gemini_warmup model=… status=… ms=…
const TIMEOUT_MS = 10000;

async function warmup(env = process.env) {
  const model = env.LLM_MODEL;
  if (env.AI_MOCK === 'true' || !env.LLM_API_KEY || !model) return null;
  const t0 = Date.now();
  let status;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, {
      headers: { 'x-goog-api-key': env.LLM_API_KEY }, signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    await res.arrayBuffer();
    status = res.status;
  } catch (e) {
    status = 'error:' + (e.name === 'TimeoutError' ? 'ETIMEDOUT' : (e.cause && e.cause.code) || e.name);
  }
  console.log(`gemini_warmup model=${model} status=${status} ms=${Date.now() - t0}`);
  return status;
}

module.exports = { warmup };
