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
  // จำลองเบราว์เซอร์ที่ "ไม่มี" resume() เพื่อกันบั๊กเดิมกลับมา (เคยทำให้เสียงไม่ออกเลย)
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    speaking: false, pending: false, paused: false,
    speak(u) { window.__spoken.push(u.text); if (u.onstart) u.onstart(); setTimeout(() => u.onend && u.onend(), 5); },
    cancel: () => {},
    getVoices: () => [{ name: 'Google US English', lang: 'en-US' }],
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

await t('เสียงอ่านถูกเรียกได้ แม้เบราว์เซอร์ไม่มี speechSynthesis.resume()', async () => {
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

await t('หน้าแรกมีการ์ด "ติดตั้งลงมือถือ" และปุ่มทดสอบเสียง', async () => {
  await page.click('[data-tab="home"]');
  await page.waitForSelector('#soundTest', { timeout: 3000 });
  const txt = await page.innerText('#installBox');
  if (!txt.trim()) throw new Error('การ์ดติดตั้งว่างเปล่า');
});

await t('ไม่มีแถบเตือนเรื่องเสียงขึ้นมาบัง เมื่อเสียงทำงานปกติ', async () => {
  if (await page.locator('#soundHelp').count()) throw new Error('แถบเตือนขึ้นทั้งที่เสียงออกปกติ');
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

await t('แท็บคุยกับติวเตอร์: มีสถานการณ์ให้เลือก', async () => {
  await page.click('[data-tab="talk"]');
  await page.waitForSelector('.unit', { timeout: 3000 });
  const n = await page.locator('.unit').count();
  if (n !== 6) throw new Error('เจอ ' + n + ' สถานการณ์');
});

await t('คุย: ติวเตอร์ทักทายก่อน แล้วบอกว่าตาคุณตอบอะไร', async () => {
  await page.locator('.unit').first().click();
  await page.waitForSelector('#micBtn', { timeout: 3000 });
  const bot = await page.textContent('.msg.bot');
  if (!/what is your name/i.test(bot)) throw new Error('ติวเตอร์ไม่ได้ถามชื่อ: ' + bot.slice(0, 60));
  const hint = await page.textContent('.hintbox');
  if (!/ตาคุณตอบ/.test(hint)) throw new Error('ไม่มีคำสั่งบอกว่าต้องพูดอะไร');
});

// เคสสำคัญที่สุด: ตอบมั่วต้องไม่ผ่าน (บั๊กเดิมคือพูดยาว 4 คำอะไรก็ได้ก็ผ่าน)
await t('คุย: ตอบมั่วต้องไม่ผ่าน และต้องอยู่ตาเดิม', async () => {
  const before = await page.textContent('.lesson-top');
  await page.evaluate(() => { window.__nextSaid = 'banana helicopter yesterday window'; });
  await page.click('#micBtn');
  await page.waitForSelector('#fb .feedback', { timeout: 3000 });
  const fb = await page.textContent('#fb .feedback');
  if (!/ยังไม่ใช่|เกือบแล้ว/.test(fb)) throw new Error('ตอบมั่วแล้วผ่าน: ' + fb.slice(0, 70));
  if (!/ยังไม่มีคำว่า/.test(fb)) throw new Error('ไม่ได้บอกว่าผิดตรงไหน: ' + fb.slice(0, 90));
  await page.waitForTimeout(400);
  const after = await page.textContent('.lesson-top');
  if (before !== after) throw new Error('ตอบมั่วแล้วยังเลื่อนไปตาถัดไป');
});

await t('คุย: ตอบถูกแล้วติวเตอร์ตอบกลับ และเลื่อนไปตาถัดไป', async () => {
  await page.click('#fb .btn.primary');           // ลองใหม่อีกครั้ง
  await page.evaluate(() => { window.__nextSaid = 'My name is Somchai'; });
  await page.click('#micBtn');
  await page.waitForTimeout(2800);
  const top = await page.textContent('.lesson-top');
  if (!/ตาที่ 2/.test(top)) throw new Error('ไม่เลื่อนไปตาที่ 2: ' + top);
  const chat = await page.innerText('#chat');
  if (!/Nice to meet you/.test(chat)) throw new Error('ติวเตอร์ไม่ได้ตอบกลับตามเนื้อหา');
});

await t('คุย: ตอบผิดสองครั้งแล้วต้องเฉลยประโยคที่ถูกให้', async () => {
  await page.evaluate(() => { window.__nextSaid = 'zzz qqq'; });
  await page.click('#micBtn');
  await page.waitForSelector('#fb .feedback', { timeout: 3000 });
  await page.click('#fb .btn.primary');           // ลองใหม่
  await page.click('#micBtn');
  await page.waitForSelector('#fb .feedback', { timeout: 3000 });
  const fb = await page.innerText('#fb');
  if (!/ประโยคที่ถูกคือ/.test(fb)) throw new Error('ไม่เฉลยประโยคที่ถูก');
});

await t('คุย: มีตาที่ผู้เรียนต้องเป็นฝ่ายถามกลับ', async () => {
  const hasAsk = await page.evaluate(() =>
    SCENES.every(sc => sc.turns.some(t => t.askBack && t.botReply)));
  if (!hasAsk) throw new Error('บางสถานการณ์ไม่มีตาให้ผู้เรียนถามกลับ');
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

await t('ถ้าเล่นเสียงไม่ได้จริง ต้องขึ้นวิธีแก้เป็นภาษาไทยให้ผู้ใช้', async () => {
  const p2 = await browser.newPage();
  await p2.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speaking: false, pending: false,
      speak() {},                       // เงียบสนิท ไม่มี onstart — เหมือนเครื่องที่ไม่มีเสียงอ่าน
      cancel: () => {}, getVoices: () => [], onvoiceschanged: null
    }});
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  });
  await p2.goto(APP);
  await p2.click('#goNext');
  await p2.waitForSelector('#soundHelp', { timeout: 5000 });
  // ตอนย่ออยู่ ต้องไม่บังปุ่ม "ต่อไป" ของบทเรียน
  const nx = await p2.locator('#nx').boundingBox();
  const hit = await p2.evaluate(([x, y]) => (document.elementFromPoint(x, y) || {}).id,
    [nx.x + nx.width / 2, nx.y + nx.height / 2]);
  if (hit !== 'nx') throw new Error('แถบเตือนบังปุ่มต่อไป (เจอ: "' + hit + '")');
  await p2.click('#nx');   // ยังกดเรียนต่อได้ตามปกติ
  await p2.click('#shOpen');
  const txt = await p2.innerText('#soundHelp');
  if (!/เพิ่มเสียง/.test(txt)) throw new Error('ไม่มีคำแนะนำวิธีแก้');
  await p2.click('#shClose');
  if (await p2.locator('#soundHelp').count()) throw new Error('ปิดแถบเตือนไม่ได้');
  await p2.close();
});

await browser.close();
console.log('\n' + (errors.length ? '❌ พบปัญหา ' + errors.length + ' อย่าง:\n' + errors.join('\n') : '✅ ผ่านทั้งหมด'));
process.exit(errors.length ? 1 : 0);
