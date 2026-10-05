export interface CompressedImage {
  base64: string;   // JPEG ไม่มี prefix "data:image/jpeg;base64,"
  blob: Blob;       // ใช้ทำ object URL สำหรับพรีวิว (เบากว่า data URL ยาวๆ ในหน่วยความจำ)
  width: number;
  height: number;
  bytes: number;
}

/**
 * ย่อ บีบอัด และหมุน (ถ้าต้องการ) รูปฝั่ง client ก่อนส่ง OCR
 * รูปจากกล้องมือถือมักใหญ่ 3–8 MB → เหลือราว 200–500 KB
 * ช่วยให้อัปโหลดเร็วขึ้น ประหยัดค่า OCR และไม่ชน limit 10 MB ของ backend
 *
 * @param src      data URL หรือ Blob/File (ถ้าเป็น Blob จะสร้าง object URL ชั่วคราวและ revoke ให้เอง)
 * @param rotation องศาตามเข็มนาฬิกา (0/90/180/270) — หมุนจริงที่ canvas จากรูปต้นฉบับ ไม่หมุนซ้ำบนรูปที่บีบแล้ว
 */
export async function compressImage(
  src: string | Blob,
  maxSide = 1600,   // 1600px ยังพอให้ OCR อ่านตัวหนังสือเล็กบนซองยาได้
  quality = 0.85,
  rotation = 0,
): Promise<CompressedImage> {
  const img = await loadImage(src);

  const rot = ((rotation % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = swap ? h : w;
  canvas.height = swap ? w : h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('เบราว์เซอร์นี้ไม่รองรับการประมวลผลรูป');

  // พื้นขาวรองไว้ กัน PNG โปร่งใสกลายเป็นพื้นดำเมื่อแปลงเป็น JPEG
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);

  const out = canvas.toDataURL('image/jpeg', quality);
  const base64 = out.slice(out.indexOf(',') + 1);
  const bytes = Math.floor((base64.length * 3) / 4);
  return { base64, blob: base64ToBlob(base64), width: canvas.width, height: canvas.height, bytes };
}

function base64ToBlob(base64: string): Blob {
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: 'image/jpeg' });
}

/** โหลดรูปจาก data URL หรือ Blob (object URL ที่สร้างเองถูก revoke ทันทีหลังโหลดเสร็จ) */
export function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  const revoke = () => { if (typeof src !== 'string') URL.revokeObjectURL(url); };
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { revoke(); resolve(img); };
    img.onerror = () => { revoke(); reject(new Error('เปิดไฟล์รูปไม่ได้')); };
    img.src = url;
  });
}

/** แปลง File จาก <input type="file"> เป็น data URL */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
    reader.readAsDataURL(file);
  });
}
