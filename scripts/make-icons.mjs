/* สร้างไอคอนแอป (PNG) จาก scripts/icon-source.html — รันเมื่อจะเปลี่ยนไอคอนเท่านั้น
   ต้องมี playwright:  node scripts/make-icons.mjs                                */
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
for (const size of [512, 192]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.goto("file://" + resolve(root, "scripts/icon-source.html"));
  await page.addStyleTag({ content: `.i{width:${size}px;height:${size}px} svg{width:${size}px;height:${size}px}` });
  await page.waitForTimeout(150);
  await page.locator(".i").screenshot({ path: resolve(root, `docs/icon-${size}.png`) });
  await page.close();
}
await browser.close();
console.log("สร้างไอคอนเสร็จแล้ว: docs/icon-192.png, docs/icon-512.png");
