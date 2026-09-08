/* สร้างรูปพรีวิวสำหรับตอนแชร์ลิงก์ (LINE / Facebook / X) จาก scripts/share-source.html
   รันเมื่อจะเปลี่ยนรูป:  node scripts/make-share-image.mjs                          */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await (async () => {
  for (const p of ["playwright", "/opt/node22/lib/node_modules/playwright/index.js"]) {
    try { const m = await import(p); return m.default ?? m; } catch {}
  }
  throw new Error("ยังไม่ได้ติดตั้ง playwright — รัน: npm i -D playwright");
})();

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto("file://" + resolve(root, "scripts/share-source.html"));
await page.waitForTimeout(300);
await page.locator(".card").screenshot({ path: resolve(root, "docs/share.png") });
await browser.close();
console.log("สร้างรูปพรีวิวเสร็จแล้ว: docs/share.png");
