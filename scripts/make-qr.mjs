/* สร้าง QR code ของลิงก์แอป เป็นไฟล์ SVG ที่ฝังลงหน้าเว็บได้ตรงๆ
   ใช้ไลบรารี qrcode ที่เป็นมาตรฐาน จึงมั่นใจได้ว่าสแกนออกแน่นอน
   รันเมื่อเปลี่ยนลิงก์แอป:  node scripts/make-qr.mjs                          */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const URL_ = process.argv[2] || "https://chaynrngkh246-web.github.io/basis-meter-app/";
const QUIET = 4;   /* ขอบขาวรอบ QR ต้องมีอย่างน้อย 4 ช่อง ไม่งั้นกล้องจับไม่ติด */

const qr = QRCode.create(URL_, { errorCorrectionLevel: "M" });
const n = qr.modules.size, data = qr.modules.data;
const side = n + QUIET * 2;

/* รวมช่องดำที่ติดกันในแนวนอนให้เป็นเส้นเดียว ไฟล์จะเล็กลงมาก */
let d = "";
for (let y = 0; y < n; y++) {
  let x = 0;
  while (x < n) {
    if (!data[y * n + x]) { x++; continue; }
    let w = 0;
    while (x + w < n && data[y * n + x + w]) w++;
    d += `M${x + QUIET} ${y + QUIET}h${w}v1h-${w}z`;
    x += w;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" `
  + `shape-rendering="crispEdges" role="img" aria-label="QR code ของลิงก์แอปพูดอังกฤษได้">`
  + `<rect width="${side}" height="${side}" fill="#ffffff"/>`
  + `<path d="${d}" fill="#000000"/></svg>`;

writeFileSync(resolve(root, "src/qr.svg"), svg + "\n");
console.log(`สร้าง QR เสร็จแล้ว: src/qr.svg — version ${qr.version}, ${n}x${n} ช่อง, ลิงก์ ${URL_}`);
