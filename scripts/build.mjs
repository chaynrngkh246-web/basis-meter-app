/* สร้างไฟล์เว็บจากไฟล์ต้นฉบับ src/app.fragment.html
   - index.html            : เปิดจากเครื่องได้เลย (ดับเบิลคลิก)
   - docs/index.html       : สำหรับเปิดใช้งานผ่าน GitHub Pages
*/
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fragment = readFileSync(resolve(root, "src/app.fragment.html"), "utf8");

/* ที่อยู่จริงของแอป — ใช้ทำรูปพรีวิวตอนแชร์ลิงก์ ต้องเป็น URL เต็มเท่านั้น */
const SITE = "https://chaynrngkh246-web.github.io/basis-meter-app/";
const TITLE = "พูดอังกฤษได้ — เรียนอังกฤษจากศูนย์ จนถึงระดับใช้ทำงาน";
const TAB   = "พูดอังกฤษได้";   /* ชื่อสั้นๆ บนแท็บเบราว์เซอร์ ส่วน TITLE ใช้ตอนแชร์ลิงก์ */
const DESC  = "แอปฟรี ภาษาไทยล้วน ฝึกพูดกับไมโครโฟนจริง คุยโต้ตอบกับติวเตอร์ได้ "
            + "300 ประโยค 4 ระดับ ไม่ต้องสมัครสมาชิก ใช้ได้แม้ไม่มีเน็ต";

const page = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${TAB}</title>
<meta name="description" content="${DESC}">

<!-- รูปพรีวิวตอนส่งลิงก์เข้า LINE / Facebook / X -->
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}">
<meta property="og:title" content="${TITLE}">
<meta property="og:description" content="${DESC}">
<meta property="og:image" content="${SITE}share.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="th_TH">
<meta property="og:site_name" content="พูดอังกฤษได้">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${TITLE}">
<meta name="twitter:description" content="${DESC}">
<meta name="twitter:image" content="${SITE}share.png">
<meta name="theme-color" content="#2f6df6">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="พูดอังกฤษได้">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-192.png">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%97%A3%EF%B8%8F%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box}img{max-width:100%}[hidden]{display:none!important}body{margin:0}</style>
${fragment.replace(/^\s*<title>[\s\S]*?<\/title>\s*/, "")}
</body>
</html>
`;

const manifest = JSON.stringify({
  name: "พูดอังกฤษได้ — เรียนอังกฤษจากศูนย์",
  short_name: "พูดอังกฤษได้",
  start_url: ".",
  scope: ".",
  display: "standalone",
  background_color: "#f6f7f9",
  theme_color: "#2f6df6",
  lang: "th",
  description: "เรียนภาษาอังกฤษจากศูนย์ ฝึกพูดกับไมโครโฟนจริง",
  orientation: "portrait",
  icons: [
    { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }
  ]
}, null, 2);

const sw = `/* Service worker — ทำให้ติดตั้งเป็นแอปได้จริง และเปิดใช้ได้แม้ไม่มีเน็ต
   กลยุทธ์: ลองโหลดจากเน็ตก่อน (ได้ของใหม่เสมอ) ถ้าไม่มีเน็ตค่อยใช้ของที่เก็บไว้ */
const CACHE = "speak-english-v1";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});
`;

for (const dir of ["", "docs"]) {
  const out = dir ? resolve(root, dir) : root;
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, "index.html"), page);
  writeFileSync(resolve(out, "manifest.webmanifest"), manifest);
  writeFileSync(resolve(out, "sw.js"), sw);
}
// ไอคอนและรูปพรีวิวอยู่ใน docs/ อยู่แล้ว สำเนามาที่รากด้วยเพื่อให้เปิดจากไฟล์ได้เหมือนกัน
for (const f of ["icon-192.png", "icon-512.png", "share.png"]) {
  try { copyFileSync(resolve(root, "docs", f), resolve(root, f)); } catch {}
}
writeFileSync(resolve(root, "docs/.nojekyll"), "");

// เวอร์ชันสำหรับเผยแพร่เป็น Artifact (ไม่มี <html>/<head>/<body> ตามข้อกำหนด)
mkdirSync(resolve(root, "artifact"), { recursive: true });
const artifact = `<style>@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;700;800&display=swap");</style>\n` + fragment;
writeFileSync(resolve(root, "artifact/app.html"), artifact);
console.log("สร้างไฟล์เสร็จแล้ว: index.html, docs/index.html (" + page.length + " ตัวอักษร)");
