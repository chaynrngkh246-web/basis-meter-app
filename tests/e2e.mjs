/* ทดสอบแอปจริงในเบราว์เซอร์ (Chromium) — รันด้วย: npm test */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await (async () => {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright/index.js']) {
    try { const m = await import(p); return m.default ?? m; } catch {}
  }
  throw new Error('ยังไม่ได้ติดตั้ง playwright — รัน: npm i -D playwright');
})();

const APP = 'file://' + resolve(dirname(fileURLToPath(import.meta.url)), '..', 'index.html');

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => {
  // ข้ามเรื่องโหลดฟอนต์จากอินเทอร์เน็ตไม่ได้ (แอปมีฟอนต์สำรองอยู่แล้ว)
  if (m.type() === 'error' && /Failed to load resource/.test(m.text())) return;
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
});

// stub speech APIs before page scripts run
await page.addInitScript(() => {
  window.__spoken = [];
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    speak: u => window.__spoken.push(u.text),
    cancel: () => {}, getVoices: () => [{name:'Google US English', lang:'en-US'}],
    onvoiceschanged: null
  }});
  window.SpeechSynthesisUtterance = function(t){ this.text = t; };
  window.__nextSaid = 'hello';
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: function(){
    this.start = () => setTimeout(() => {
      const r = [{ 0:{transcript: window.__nextSaid}, length:1 }];
      r[0][Symbol.iterator] = undefined;
      this.onresult && this.onresult({ results: [ Object.assign([{transcript: window.__nextSaid}], {length:1}) ] });
      this.onend && this.onend();
    }, 10);
    this.stop = () => {};
  }});
});

await page.goto(APP);
await page.waitForTimeout(300);

const t = async (label, fn) => { try { await fn(); console.log('✓', label); } catch(e){ console.log('✗', label, '\n   ', e.message.split('\n')[0]); errors.push(label + ': ' + e.message.split('\n')[0]); } };

await t('หน้าแรกแสดงบทเรียนครบ 10 บท', async () => {
  const n = await page.locator('.unit').count();
  if (n !== 10) throw new Error('เจอ ' + n + ' บท');
});

await t('กด "เริ่มบทที่ 1" เข้าสู่บทเรียน', async () => {
  await page.click('#goNext');
  await page.waitForSelector('.word-en', { timeout: 3000 });
  const w = await page.textContent('.word-en');
  if (!w.includes('Hello')) throw new Error('คำแรกไม่ใช่ Hello: ' + w);
});

await t('เสียงอ่านถูกเรียก', async () => {
  await page.waitForTimeout(500);
  const sp = await page.evaluate(() => window.__spoken);
  if (!sp) throw new Error('stub ไม่ถูกติดตั้ง');
  if (!sp.length) throw new Error('ไม่มีการเรียก speak');
});

await t('เดินหน้าผ่าน 4 การ์ดคำศัพท์ ไปถึงขั้นพูดตาม', async () => {
  for (let i = 0; i < 4; i++) { await page.click('#nx'); await page.waitForTimeout(60); }
  await page.waitForSelector('#micBtn', { timeout: 3000 });
  const label = await page.textContent('.steplabel');
  if (!label.includes('พูดตาม')) throw new Error('label=' + label);
});

await t('พูดถูก → ได้คะแนนสูง', async () => {
  const target = (await page.textContent('.word-en')).trim();
  await page.evaluate(v => { window.__nextSaid = v; }, target);
  await page.click('#micBtn');
  await page.waitForSelector('.feedback', { timeout: 3000 });
  const fb = await page.textContent('.feedback');
  if (!/100%/.test(fb)) throw new Error(fb.slice(0,80));
});

await t('พูดผิด → คะแนนต่ำ และบอกสิ่งที่ได้ยิน', async () => {
  await page.click('text=🔁 ลองใหม่');
  await page.evaluate(() => { window.__nextSaid = 'banana tree'; });
  await page.click('#micBtn');
  await page.waitForSelector('.feedback', { timeout: 3000 });
  const fb = await page.textContent('.feedback');
  if (!/banana tree/.test(fb)) throw new Error('ไม่แสดงสิ่งที่ได้ยิน: ' + fb.slice(0,80));
  if (/100%/.test(fb)) throw new Error('คะแนนไม่ควรเต็ม');
});

await t('โหมดพิมพ์แทนใช้ได้', async () => {
  await page.click('text=🔁 ลองใหม่');
  await page.click('#pMode');
  const target2 = (await page.textContent('.word-en')).trim().toLowerCase();
  await page.fill('#typeIn', target2);
  await page.click('#typeGo');
  await page.waitForSelector('.feedback', { timeout: 3000 });
  const fb = await page.textContent('.feedback');
  if (!/100%/.test(fb)) throw new Error(fb.slice(0,60));
});

await t('ความคืบหน้าถูกบันทึกลง localStorage', async () => {
  await page.click('.btn.primary');
  await page.waitForTimeout(150);
  const srs = await page.evaluate(() => JSON.parse(localStorage.getItem('speakenglish.v1')).srs);
  if (!Object.keys(srs).length) throw new Error('ยังไม่มีข้อมูล srs');
});

await t('เดินจนจบบทที่ 1 ได้โดยไม่พัง', async () => {
  await page.evaluate(() => { window.__nextSaid = 'yes'; });
  for (let i = 0; i < 120; i++) {
    if (await page.locator('.confetti').count()) break;
    const btns = ['#nx', '.btn.primary', '.choice'];
    let clicked = false;
    for (const sel of btns) {
      const l = page.locator(sel).first();
      if (await l.count() && await l.isVisible()) { await l.click(); clicked = true; break; }
    }
    if (!clicked) { const m = page.locator('#micBtn'); if (await m.count()) await m.click(); }
    await page.waitForTimeout(70);
  }
  if (!(await page.locator('.confetti').count())) throw new Error('ไปไม่ถึงหน้าจบบท');
});

await t('แท็บทบทวนเปิดได้', async () => {
  await page.click('[data-tab="review"]');
  await page.waitForTimeout(300);
  const html = await page.innerText('#screen');
  if (!html.length) throw new Error('หน้าว่าง');
});

await t('เมื่อมีคำถึงกำหนด หน้าทบทวนต้องมีข้อให้ฝึก', async () => {
  await page.evaluate(() => {
    const k = 'speakenglish.v1';
    const st = JSON.parse(localStorage.getItem(k));
    Object.keys(st.srs).forEach(id => { st.srs[id].due = 0; });
    localStorage.setItem(k, JSON.stringify(st));
  });
  await page.reload();
  await page.waitForTimeout(400);
  await page.click('[data-tab="review"]');
  await page.waitForSelector('.steplabel', { timeout: 3000 });
  const n = await page.textContent('.lesson-top');
  if (!/\d+\/\d+/.test(n)) throw new Error('ไม่มีตัวนับข้อ: ' + n);
});

await t('ทบทวน: ตอบข้อแรกแล้วไปข้อถัดไปได้', async () => {
  const before = await page.textContent('.lesson-top');
  const c = page.locator('.choice').first();
  if (await c.count()) { await c.click(); await page.waitForTimeout(150); await page.click('#fb .btn.primary'); }
  await page.waitForTimeout(300);
  const after = await page.textContent('.lesson-top');
  if (before === after) throw new Error('ไม่ขยับไปข้อถัดไป');
});

await t('แท็บคุยกับติวเตอร์ถามคำถามและรับคำตอบได้', async () => {
  await page.click('[data-tab="talk"]');
  await page.waitForSelector('.msg.bot', { timeout: 3000 });
  await page.evaluate(() => { window.__nextSaid = 'My name is Somchai'; });
  await page.click('#micBtn');
  await page.waitForTimeout(400);
  const n = await page.locator('.msg.me').count();
  if (!n) throw new Error('ไม่มีข้อความของผู้ใช้');
});

await t('แท็บตั้งค่าเปิดได้', async () => {
  await page.click('[data-tab="me"]');
  await page.waitForSelector('#rate', { timeout: 3000 });
});

await t('กลับหน้าแรกแล้วเห็นความคืบหน้า', async () => {
  await page.click('[data-tab="home"]');
  await page.waitForSelector('.unit', { timeout: 3000 });
  const txt = await page.innerText('#units');
  if (/^0%/.test(txt)) throw new Error('ความคืบหน้าไม่ขึ้น');
});

await browser.close();
console.log('\n' + (errors.length ? '❌ พบปัญหา ' + errors.length + ' อย่าง:\n' + errors.join('\n') : '✅ ผ่านทั้งหมด'));
process.exit(errors.length ? 1 : 0);
