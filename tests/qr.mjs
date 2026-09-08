/* ตรวจว่า QR ที่ฝังในแอป ตรงกับที่ไลบรารีมาตรฐานสร้างจริงทุกช่อง
   (สคริปต์ที่วาด SVG เป็นโค้ดที่เราเขียนเอง จึงต้องพิสูจน์ว่าไม่วาดผิด)
   รันด้วย: node tests/qr.mjs                                                    */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const URL_ = "https://chaynrngkh246-web.github.io/basis-meter-app/";
const QUIET = 4;
const fail = (m) => { console.log("✗ " + m); process.exit(1); };

const svg = readFileSync(resolve(root, "src/qr.svg"), "utf8");
const qr = QRCode.create(URL_, { errorCorrectionLevel: "M" });
const n = qr.modules.size;
const side = n + QUIET * 2;

if (!svg.includes(`viewBox="0 0 ${side} ${side}"`)) fail(`ขนาด viewBox ไม่ตรง (ควรเป็น ${side})`);
if (!/fill="#ffffff"/.test(svg)) fail("ไม่มีพื้นหลังสีขาว — กล้องจะจับไม่ติด");

/* อ่านเส้นทั้งหมดใน path กลับมาเป็นตารางช่องดำ */
const drawn = new Set();
const re = /M(\d+) (\d+)h(\d+)v1h-\3z/g;
let m, segments = 0;
const d = (svg.match(/ d="([^"]+)"/) || [])[1] || "";
while ((m = re.exec(d))) {
  segments++;
  const x = +m[1], y = +m[2], w = +m[3];
  for (let i = 0; i < w; i++) drawn.add(`${x + i},${y}`);
}
if (!segments) fail("อ่านเส้นใน path ไม่ได้เลย");
if (re.lastIndex !== 0 && d.replace(re, "").trim() !== "") { /* ตรวจว่าไม่มีคำสั่งแปลกปลอม */ }
if (d.replace(/M\d+ \d+h\d+v1h-\d+z/g, "") !== "") fail("มีคำสั่งวาดที่ไม่รู้จักใน path");

let expected = 0, diff = 0;
for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
  const black = !!qr.modules.data[y * n + x];
  if (black) expected++;
  if (black !== drawn.has(`${x + QUIET},${y + QUIET}`)) diff++;
}
if (diff) fail(`ช่องไม่ตรงกับไลบรารี ${diff} ช่อง`);
if (drawn.size !== expected) fail(`วาดเกินมา ${drawn.size - expected} ช่อง`);

/* ขอบขาวรอบนอกต้องว่างจริง */
for (const [x, y] of [[0,0],[side-1,0],[0,side-1],[side-1,side-1],[QUIET-1,QUIET-1]])
  if (drawn.has(`${x},${y}`)) fail(`มีช่องดำอยู่ในขอบขาวที่ ${x},${y}`);

console.log(`✓ QR ตรงกับไลบรารีมาตรฐานทุกช่อง (${expected} ช่องดำ, ${n}x${n}, ขอบขาว ${QUIET} ช่อง)`);
console.log(`✓ เนื้อหาที่เข้ารหัส: ${URL_}`);
