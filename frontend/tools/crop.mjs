// node tools/crop.mjs <ไฟล์> x y w h [scale] → เขียน <ไฟล์>.crop.png (ไว้ซูมตรวจรายละเอียด)
import sharp from 'sharp';
const [file, x, y, w, h, sc = 3] = process.argv.slice(2);
await sharp(file).extract({ left: +x, top: +y, width: +w, height: +h }).resize({ width: Math.round(w * sc), kernel: 'lanczos3' }).toFile(file.replace(/\.png$/, '.crop.png'));
