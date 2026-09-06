/* สร้างไฟล์เว็บจากไฟล์ต้นฉบับ src/app.fragment.html
   - index.html            : เปิดจากเครื่องได้เลย (ดับเบิลคลิก)
   - docs/index.html       : สำหรับเปิดใช้งานผ่าน GitHub Pages
*/
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fragment = readFileSync(resolve(root, "src/app.fragment.html"), "utf8");

const page = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="แอปสอนภาษาอังกฤษสำหรับคนไทยที่เริ่มจากศูนย์ ฝึกพูดกับไมโครโฟนจริง พร้อมโหมดคุยกับติวเตอร์">
<meta name="theme-color" content="#2f6df6">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="พูดอังกฤษได้">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%97%A3%EF%B8%8F%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box}img{max-width:100%}[hidden]{display:none!important}body{margin:0}</style>
${fragment}
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
  icons: [{
    src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%232f6df6'/%3E%3Ctext x='50' y='72' font-size='58' text-anchor='middle'%3E%F0%9F%97%A3%EF%B8%8F%3C/text%3E%3C/svg%3E",
    sizes: "any", type: "image/svg+xml", purpose: "any"
  }]
}, null, 2);

for (const dir of ["", "docs"]) {
  const out = dir ? resolve(root, dir) : root;
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, "index.html"), page);
  writeFileSync(resolve(out, "manifest.webmanifest"), manifest);
}
writeFileSync(resolve(root, "docs/.nojekyll"), "");

// เวอร์ชันสำหรับเผยแพร่เป็น Artifact (ไม่มี <html>/<head>/<body> ตามข้อกำหนด)
mkdirSync(resolve(root, "artifact"), { recursive: true });
const artifact = `<style>@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;700;800&display=swap");</style>\n` + fragment;
writeFileSync(resolve(root, "artifact/app.html"), artifact);
console.log("สร้างไฟล์เสร็จแล้ว: index.html, docs/index.html (" + page.length + " ตัวอักษร)");
