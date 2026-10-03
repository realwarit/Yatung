/**
 * ย่อและบีบอัดรูปฝั่ง client ก่อนส่ง OCR
 * รูปจากกล้องมือถือมักใหญ่ 3–8 MB → เหลือราว 200–500 KB
 * ช่วยให้อัปโหลดเร็วขึ้น ประหยัดค่า OCR และไม่ชน limit 10 MB ของ backend
 *
 * @returns base64 ของ JPEG (ไม่มี prefix "data:image/jpeg;base64,")
 */
export async function compressImage(
  dataUrl: string,
  maxSide = 1600,   // 1600px ยังพอให้ OCR อ่านตัวหนังสือเล็กบนซองยาได้
  quality = 0.85
): Promise<{ base64: string; width: number; height: number; bytes: number }> {
  const img = await loadImage(dataUrl);

  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('เบราว์เซอร์นี้ไม่รองรับการประมวลผลรูป');

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const out = canvas.toDataURL('image/jpeg', quality);
  const base64 = out.slice(out.indexOf(',') + 1);
  const bytes = Math.floor((base64.length * 3) / 4);
  return { base64, width, height, bytes };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('เปิดไฟล์รูปไม่ได้'));
    img.src = src;
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
