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

await t('หลักสูตรครบ 4 ระดับ 25 บท 300 ประโยค', async () => {
  const info = await page.evaluate(() => ({
    levels: LEVELS.length,
    units: COURSE.length,
    words: COURSE.reduce((a, u) => a + u.words.length, 0),
    perLevel: LEVELS.map(l => COURSE.filter(u => u.level === l.id).length),
    dialogs: COURSE.filter(u => u.dialog && u.dialog.lines.length >= 6).length,
    upgrades: UPGRADES.length,
    scenes: SCENES.length
  }));
  if (info.levels !== 4) throw new Error('ระดับ ' + info.levels);
  if (info.units !== 25) throw new Error('บท ' + info.units);
  if (info.words !== 300) throw new Error('ประโยค ' + info.words);
  if (String(info.perLevel) !== '10,5,5,5') throw new Error('จำนวนบทต่อระดับผิด: ' + info.perLevel);
  if (info.dialogs !== 25) throw new Error('บทสนทนาไม่ครบ: ' + info.dialogs);
  if (info.upgrades < 30) throw new Error('ประโยคยกระดับ ' + info.upgrades);
  if (info.scenes !== 10) throw new Error('สถานการณ์คุย ' + info.scenes);
});

await t('ทุกคำศัพท์มีคำแปล คำอ่านไทย และประโยคตัวอย่างครบ', async () => {
  const bad = await page.evaluate(() =>
    COURSE.flatMap(u => u.words
      .filter(w => !w.en || !w.th || !w.ph || !w.ex || !w.exth)
      .map(w => u.id + ':' + (w.en || '?'))));
  if (bad.length) throw new Error('ข้อมูลไม่ครบ ' + bad.length + ' คำ: ' + bad.slice(0, 3));
});

await t('หน้าแรกแสดงแถบเลือกระดับ 4 ระดับ และบทของระดับที่เลือก', async () => {
  const lv = await page.locator('.lvbtn').count();
  if (lv !== 4) throw new Error('ปุ่มระดับ ' + lv);
  const n = await page.locator('.unit').count();
  if (n !== 10) throw new Error('บทในระดับ 1 ควรมี 10 บท แต่เจอ ' + n);
});

await t('สลับไประดับมืออาชีพแล้วเห็นบทของระดับนั้น', async () => {
  await page.locator('.lvbtn').nth(3).click();
  await page.waitForTimeout(250);
  const txt = await page.innerText('#units');
  if (!/สัมภาษณ์งาน/.test(txt)) throw new Error('ไม่เจอบทสัมภาษณ์งาน');
  if (!/มืออาชีพ/.test(await page.innerText('#levelInfo'))) throw new Error('หัวข้อระดับไม่ถูก');
  await page.locator('.lvbtn').nth(0).click();
  await page.waitForTimeout(250);
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
  if (n !== 10) throw new Error('เจอ ' + n + ' สถานการณ์');
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

await t('ตัวโค้ช: พูดผิดต้องระบายสีทีละคำและบอกวิธีแก้เป็นภาษาไทย', async () => {
  const r = await page.evaluate(() => {
    const html = coachHtml('I am a teacher', 'I teacher');
    return { html, miss: (html.match(/w-miss/g) || []).length };
  });
  if (r.miss < 2) throw new Error('ไม่ได้ทำเครื่องหมายคำที่ขาด');
  if (!/verb to be/.test(r.html)) throw new Error('ไม่ได้เตือนเรื่อง verb to be');
  if (!/a \/ an \/ the/.test(r.html)) throw new Error('ไม่ได้เตือนเรื่อง a/an/the');
});

await t('ตัวโค้ช: ลืม s ท้ายคำ ต้องเตือนเฉพาะเรื่องนั้น', async () => {
  const html = await page.evaluate(() => coachHtml('He works here', 'He work here'));
  if (!/ท้ายคำ/.test(html)) throw new Error('ไม่เตือนเรื่อง s ท้ายคำ: ' + html.replace(/\s+/g, ' ').slice(0, 220));
});

await t('ตัวโค้ช: พูดถูกหมดต้องไม่มีคำที่ผิดหรือขาด', async () => {
  const html = await page.evaluate(() => coachHtml('I am fine, thank you', 'I am fine thank you'));
  if (/w-miss|w-bad/.test(html)) throw new Error('พูดถูกแล้วยังขึ้นว่าผิด');
});

await t('ตัวโค้ช: โผล่จริงในหน้าฝึกพูด พร้อมปุ่มฟังทีละคำ', async () => {
  await page.click('[data-tab="home"]');
  await page.waitForSelector('#goNext', { timeout: 3000 });
  await page.click('#goNext');
  await page.waitForSelector('.word-en', { timeout: 3000 });
  for (let i = 0; i < 4; i++) { await page.click('#nx', { timeout: 5000 }); await page.waitForTimeout(60); }
  await page.waitForSelector('#micBtn', { timeout: 3000 });
  await page.evaluate(() => { window.__nextSaid = 'hello banana'; });
  await page.click('#micBtn');
  await page.waitForSelector('.coach', { timeout: 3000 });
  if (!await page.locator('#cWord').count()) throw new Error('ไม่มีปุ่มฟังทีละคำ');
  await page.click('#cWord');
  await page.waitForTimeout(200);
  if (!await page.locator('.w-now').count()) throw new Error('ไม่ไฮไลต์คำที่กำลังอ่าน');
});

await t('แบบวัดระดับ: ทำครบ 12 ข้อแล้วแนะนำระดับให้', async () => {
  await page.evaluate(() => { S.placed = false; save(); });
  await page.click('[data-tab="home"]');
  await page.waitForSelector('#goPlace', { timeout: 3000 });
  await page.click('#goPlace');
  await page.waitForSelector('.choice', { timeout: 3000 });
  for (let i = 0; i < 12; i++) {
    await page.locator('.choice').first().click();
    await page.waitForTimeout(80);
    await page.click('#fb .btn.primary');
    await page.waitForTimeout(120);
  }
  const txt = await page.innerText('#screen');
  if (!/คุณควรเริ่มที่ ระดับ/.test(txt)) throw new Error('ไม่สรุปผลระดับ: ' + txt.slice(0, 80));
  if (!await page.evaluate(() => S.placed)) throw new Error('ไม่ได้บันทึกว่าวัดระดับแล้ว');
  await page.click('[data-tab="home"]');
});

await t('ยกระดับ: เทียบ 3 ระดับของประโยคเดียวกันได้', async () => {
  await page.click('[data-tab="up"]');
  await page.waitForSelector('.tier', { timeout: 3000 });
  const txt = await page.innerText('#list');
  if (!/พื้นฐาน/.test(txt) || !/เจ้าของภาษา/.test(txt)) throw new Error('ไม่ครบ 3 ระดับ');
  if (!/ทำให้|ใช้|ห้าม|ควร/.test(txt)) throw new Error('ไม่มีคำอธิบายว่าต่างกันตรงไหน');
  const cats = await page.locator('#catbar .lvbtn').count();
  if (cats < 4) throw new Error('หมวดหมู่ ' + cats);
});

await t('ยกระดับ: กดฝึกพูดแล้วเข้าโหมดฝึกได้', async () => {
  await page.click('#drill');
  await page.waitForSelector('#micBtn', { timeout: 3000 });
  const label = await page.textContent('.steplabel');
  if (!/เจ้าของภาษา/.test(label)) throw new Error('ป้ายกำกับผิด: ' + label);
});

await t('คุยโต้ตอบ: มีฉากระดับมืออาชีพแยกตามระดับ', async () => {
  await page.click('[data-tab="talk"]');
  await page.waitForSelector('.unit', { timeout: 3000 });
  const txt = await page.innerText('#scenes');
  if (!/ระดับ 4/.test(txt)) throw new Error('ไม่แยกระดับ');
  if (!/สัมภาษณ์งาน/.test(txt) || !/เจรจา/.test(txt)) throw new Error('ไม่มีฉากมืออาชีพ');
});

await t('ทุกฉากสนทนามีเฉลยและวิธีตรวจคำตอบครบทุกตา', async () => {
  const bad = await page.evaluate(() =>
    SCENES.flatMap(sc => sc.turns
      .filter(t => !t.model || !t.modelTh || !t.say || !(t.need || t.oneOf))
      .map(t => sc.id + ':' + (t.model || '?'))));
  if (bad.length) throw new Error('ตาที่ข้อมูลไม่ครบ: ' + bad.slice(0, 3));
});

await t('ถามเอง: ติวเตอร์ตอบคำถามเรื่องตัวเองได้', async () => {
  const r = await page.evaluate(() => [
    answerQuestion('Where are you from?', {}),
    answerQuestion('What is your name?', {}),
    answerQuestion('Do you like Thai food?', {}),
    answerQuestion('How old are you?', {})
  ]);
  if (!/Canada/.test(r[0].a)) throw new Error('ตอบเรื่องมาจากไหนผิด: ' + r[0].a);
  if (!/Anna/.test(r[1].a)) throw new Error('ตอบชื่อผิด: ' + r[1].a);
  if (!/Pad kra pao|favourite/i.test(r[2].a)) throw new Error('ตอบเรื่องอาหารผิด: ' + r[2].a);
  if (!/twenty/.test(r[3].a)) throw new Error('ตอบอายุผิด: ' + r[3].a);
  if (r.some(x => !x.ath)) throw new Error('บางคำตอบไม่มีคำแปลไทย');
});

await t('ถามเอง: ถามคำแปลศัพท์แล้วค้นจากบทเรียนให้', async () => {
  const r = await page.evaluate(() => answerQuestion('What does delicious mean?', {}));
  if (!r.found) throw new Error('หาคำไม่เจอ: ' + r.a);
  if (!/อร่อย/.test(r.ath)) throw new Error('คำแปลผิด: ' + r.ath);
  const miss = await page.evaluate(() => answerQuestion('What does zzzqqq mean?', {}));
  if (miss.found) throw new Error('คำที่ไม่มีในบทเรียนไม่ควรเจอ');
});

await t('ถามเอง: คำถามเฉพาะสถานการณ์ตอบตามฉากที่กำลังคุย', async () => {
  const r = await page.evaluate(() => {
    const food = SCENES.find(s => s.id === 'food');
    const shop = SCENES.find(s => s.id === 'shop');
    return [
      answerQuestion('What do you recommend?', { scene: food }),
      answerQuestion('Can I try it on?', { scene: shop }),
      answerQuestion('What do you recommend?', {})
    ];
  });
  if (!/green curry/i.test(r[0].a)) throw new Error('ร้านอาหารตอบผิด: ' + r[0].a);
  if (!/fitting room/i.test(r[1].a)) throw new Error('ร้านเสื้อผ้าตอบผิด: ' + r[1].a);
  if (r[2].kind === 'scene') throw new Error('ตอบแบบเฉพาะฉากทั้งที่ไม่ได้อยู่ในฉาก');
});

await t('ถามเอง: ขอความช่วยเหลือแล้วได้ประโยคของตาที่กำลังเล่นอยู่', async () => {
  const r = await page.evaluate(() => {
    const sc = SCENES[0];
    return answerQuestion('What should I say?', { scene: sc, turn: sc.turns[0] });
  });
  if (!/My name is/.test(r.a)) throw new Error('ไม่ได้ใบ้ประโยคของตานั้น: ' + r.a);
});

await t('ถามเอง: ตั้งประโยคคำถามผิด ต้องบอกประโยคที่ถูก', async () => {
  const r = await page.evaluate(() => {
    const matched = ASKS.find(a => /Where are you from/.test(a.q));
    return {
      bad: checkQuestionForm('you from where', matched),
      notQ: checkQuestionForm('i am from thailand', null),
      good: checkQuestionForm('Where are you from?', matched)
    };
  });
  if (!r.bad || r.bad.fix !== 'Where are you from?') throw new Error('ไม่แก้ประโยคให้: ' + JSON.stringify(r.bad));
  if (!r.notQ || !/ขึ้นต้นด้วย/.test(r.notQ.why)) throw new Error('ไม่เตือนเรื่องรูปประโยคคำถาม');
  if (r.good) throw new Error('ถามถูกแล้วยังขึ้นว่าผิด');
});

await t('ถามเอง: พูดประโยคบอกเล่าแทนคำถาม ต้องบอกว่าไม่ใช่คำถาม', async () => {
  const r = await page.evaluate(() => answerQuestion('I like coffee very much', {}));
  if (r.kind !== 'notquestion') throw new Error('ไม่ทักว่าไม่ใช่คำถาม: ' + r.kind + ' / ' + r.a);
});

await t('ถามเอง: ใช้งานได้จริงในหน้าจอ ทั้งจากในบทสนทนาและโหมดอิสระ', async () => {
  await page.click('[data-tab="talk"]');
  await page.waitForSelector('#freeAsk', { timeout: 3000 });
  await page.click('#freeAsk');
  await page.waitForSelector('#qmic', { timeout: 3000 });
  await page.evaluate(() => { window.__nextSaid = 'Where are you from?'; });
  await page.click('#qmic');
  await page.waitForTimeout(500);
  const chat = await page.innerText('#qchat');
  if (!/Canada/.test(chat)) throw new Error('ติวเตอร์ไม่ตอบ: ' + chat.slice(0, 80));
  if (!/แคนาดา/.test(chat)) throw new Error('ไม่มีคำแปลไทยในคำตอบ');
  if (!/ถามได้ถูกต้อง/.test(await page.innerText('#qfb'))) throw new Error('ไม่ยืนยันว่าถามถูก');

  const suggestions = await page.locator('#qlist .unit').count();
  if (suggestions < 5) throw new Error('คำถามตัวอย่างน้อยไป: ' + suggestions);

  await page.click('#qdone');
  await page.waitForSelector('.unit', { timeout: 3000 });
  await page.locator('#scenes .unit').first().click();
  await page.waitForSelector('#askBtn', { timeout: 3000 });
  await page.click('#askBtn');
  await page.waitForSelector('#qmic', { timeout: 3000 });
  await page.evaluate(() => { window.__nextSaid = 'What should I say?'; });
  await page.click('#qmic');
  await page.waitForTimeout(500);
  if (!/My name is/.test(await page.innerText('#qchat'))) throw new Error('ในบทสนทนาไม่ใบ้ประโยคให้');
  await page.click('#qdone');
  await page.waitForSelector('#micBtn', { timeout: 3000 });
  const chatBack = await page.innerText('#chat');
  if (!/What should I say/.test(chatBack)) throw new Error('คำถามที่ถามไม่ถูกบันทึกลงบทสนทนา');
});

await t('ทุกคำตอบของติวเตอร์มีคำแปลไทยครบ', async () => {
  const bad = await page.evaluate(() => {
    const out = [];
    ASKS.forEach(a => { if (!a.a || !a.ath || !a.q || !a.qth || !a.keys.length) out.push(a.q || '?'); });
    SCENES.forEach(sc => (sc.qa || []).forEach(x => { if (!x.a || !x.ath || !x.keys.length) out.push(sc.id); }));
    return out;
  });
  if (bad.length) throw new Error('ข้อมูลไม่ครบ: ' + bad.slice(0, 3));
  const n = await page.evaluate(() => ({ asks: ASKS.length, qa: SCENES.filter(s => s.qa && s.qa.length).length }));
  if (n.asks < 30) throw new Error('คลังคำตอบน้อยไป: ' + n.asks);
  if (n.qa !== 10) throw new Error('ฉากที่มีคำถามเฉพาะ: ' + n.qa);
});

await t('แชร์: หน้าแรกมีการ์ดชวนเพื่อน พร้อมลิงก์และปุ่มคัดลอก', async () => {
  await page.click('[data-tab="home"]');
  await page.waitForSelector('#shareBox', { timeout: 3000 });
  const txt = await page.innerText('#shareBox');
  if (!/github\.io/.test(txt)) throw new Error('ไม่แสดงลิงก์: ' + txt.slice(0, 60));
  if (!/ไม่ต้องสมัคร/.test(txt)) throw new Error('ไม่ได้บอกว่าเปิดใช้ได้เลย');
  if (!/ไม่ปนกัน/.test(txt)) throw new Error('ไม่ได้บอกว่าข้อมูลแต่ละคนแยกกัน');
  for (const id of ['#doShare', '#copyLink', '#copyMsg']) {
    if (!await page.locator(id).count()) throw new Error('ไม่มีปุ่ม ' + id);
  }
});

await t('แชร์: กดแชร์แล้วเรียก navigator.share พร้อมลิงก์ที่ถูกต้อง', async () => {
  await page.evaluate(() => {
    window.__shared = null;
    navigator.share = (d) => { window.__shared = d; return Promise.resolve(); };
  });
  await page.click('#doShare');
  await page.waitForTimeout(200);
  const d = await page.evaluate(() => window.__shared);
  if (!d) throw new Error('ไม่ได้เรียก navigator.share');
  if (!/github\.io\/basis-meter-app/.test(d.url)) throw new Error('ลิงก์ผิด: ' + d.url);
  if (!d.text || !d.title) throw new Error('ไม่มีข้อความชวน');
});

await t('แชร์: เครื่องที่แชร์ไม่ได้ ต้องคัดลอกให้แทน', async () => {
  await page.evaluate(() => {
    window.__copied = null;
    delete navigator.share;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }
    });
  });
  await page.click('#doShare');
  await page.waitForTimeout(200);
  const c = await page.evaluate(() => window.__copied);
  if (!c || !/github\.io/.test(c)) throw new Error('ไม่ได้คัดลอกลิงก์ให้: ' + c);
  if (!/ลองแอปนี้/.test(c)) throw new Error('ไม่มีข้อความชวนในสิ่งที่คัดลอก');
  if (!/คัดลอกแล้ว/.test(await page.textContent('#doShare'))) throw new Error('ไม่บอกผู้ใช้ว่าคัดลอกแล้ว');
});

await t('แชร์: ผู้ใช้กดยกเลิกการแชร์ ต้องไม่ทำอะไรต่อ', async () => {
  await page.evaluate(() => {
    window.__copied = null;
    navigator.share = () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' }));
  });
  await page.click('#doShare');
  await page.waitForTimeout(200);
  if (await page.evaluate(() => window.__copied)) throw new Error('ยกเลิกแล้วยังคัดลอกให้');
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
  if (!await page.locator('.lvbtn.on').count()) throw new Error('ไม่มีระดับที่เลือกอยู่');
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
