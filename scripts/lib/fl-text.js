// อ่านรายการคำขอจาก fake-line (stdin) แล้วพิมพ์ข้อความของ reply ลำดับที่ N (argv[2], เริ่ม 1) :
//   ข้อความ text = ข้อความ ; Flex = altText ตามด้วยข้อความทุก text component (คั่นบรรทัด) — ใช้ใน test-day6*.sh ตรวจข้อความที่ผู้ใช้เห็น
let s = '';
process.stdin.on('data', (d) => (s += d)).on('end', () => {
  const r = JSON.parse(s).filter((x) => x.path === '/v2/bot/message/reply')[Number(process.argv[2]) - 1];
  const collect = (o, out) => { if (Array.isArray(o)) o.forEach((x) => collect(x, out)); else if (o && typeof o === 'object') { if (o.type === 'text' && typeof o.text === 'string') out.push(o.text); Object.values(o).forEach((x) => collect(x, out)); } return out; };
  const lines = [];
  for (const m of (r ? r.body.messages : [])) {
    if (m.type === 'flex') { lines.push(m.altText); collect(m.contents, lines); } else lines.push(m.text);
  }
  console.log(lines.join(' '));
});
