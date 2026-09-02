/**
 * End-to-end run for docs/index.html against an in-memory stand-in for
 * Firestore: the gstatic module URLs are intercepted and fulfilled with a
 * fake that implements only the surface the app's adapter uses.
 *
 *   node docs/e2e.mjs
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FILE = 'file://' + new URL('index.html', import.meta.url).pathname

// the app insists on a photo before it saves, so the run brings its own
const PHOTO = join(tmpdir(), 'meter-e2e.jpg')
writeFileSync(PHOTO, Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64'))
const CFG = 'const firebaseConfig = { apiKey: "AIzaFAKEKEYFORTESTS", authDomain: "t.firebaseapp.com", projectId: "bisb-test", storageBucket: "t.appspot.com", messagingSenderId: "1", appId: "1:1:web:1" };'

const FAKE_APP = `export function initializeApp(cfg){ return { cfg }; }`

const FAKE_FS = `
const SK='__fakefs';
const store=new Map(JSON.parse(sessionStorage.getItem(SK)||'[]'));
const subs=[];
const clone=(o)=>JSON.parse(JSON.stringify(o));
const persist=()=>sessionStorage.setItem(SK,JSON.stringify([...store]));
window.__store=store; window.__persist=persist;

export function initializeFirestore(){ return {}; }
export function persistentLocalCache(){ return {}; }
export function persistentMultipleTabManager(){ return {}; }
export function doc(_fs,path){ return { __doc:path }; }
export function collection(_fs,path){ return { __col:path }; }
export function where(field,op,value){ return { field, op, value }; }
export function limit(n){ return { __limit:n }; }
export function query(col,...parts){ return { __col:col.__col, parts }; }

const snapOf=(path)=>({ id:path.split('/').pop(), exists:()=>store.has(path),
  data:()=> store.has(path)?clone(store.get(path)):undefined });

function match(q){
  const out=[];
  for(const [p,v] of store){
    if(p.split('/').slice(0,-1).join('/')!==q.__col) continue;
    let ok=true;
    for(const c of (q.parts||[])){
      if(c.__limit!=null) continue;
      const a=v[c.field], b=c.value;
      if(c.op==='=='&&a!==b) ok=false;
      else if(c.op==='<'&&!(a<b)) ok=false;
      else if(c.op==='>'&&!(a>b)) ok=false;
      else if(c.op==='<='&&!(a<=b)) ok=false;
      else if(c.op==='>='&&!(a>=b)) ok=false;
    }
    if(ok) out.push(p);
  }
  const lim=(q.parts||[]).find(c=>c.__limit!=null);
  const paths=lim?out.slice(0,lim.__limit):out;
  return { docs: paths.map(p=>({ id:p.split('/').pop(), data:()=>clone(store.get(p)) })) };
}

function fire(){
  for(const s of subs){
    if(s.ref.__doc) s.cb(snapOf(s.ref.__doc));
    else s.cb(match(s.ref));
  }
}
export async function getDoc(ref){ return snapOf(ref.__doc); }
export async function getDocs(q){ return match(q.__col?q:{__col:q.__col,parts:[]}); }
export async function setDoc(ref,d){
  const s=JSON.stringify(d);
  if(s.length>1048576){ const e=new Error('too big'); e.code='invalid-argument'; throw e; }
  store.set(ref.__doc,clone(d)); persist(); fire();
}
export async function deleteDoc(ref){ store.delete(ref.__doc); persist(); fire(); }
export function onSnapshot(ref,cb,err){
  const s={ref,cb,err}; subs.push(s);
  setTimeout(()=>{ ref.__doc?cb(snapOf(ref.__doc)):cb(match(ref)); },0);
  return ()=>{ const i=subs.indexOf(s); if(i>=0) subs.splice(i,1); };
}
`

const errs = []
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-proxy-server',
    '--disable-background-networking', '--no-first-run', '--disable-sync',
    '--disable-component-update', '--no-default-browser-check'],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error' && !/font|net::|Failed to load resource/i.test(m.text())) errs.push('CONSOLE: ' + m.text())
})

await page.route('**', (route) => {
  const url = route.request().url()
  if (url.includes('firebase-app')) return route.fulfill({ contentType: 'text/javascript', body: FAKE_APP })
  if (url.includes('firebase-firestore')) return route.fulfill({ contentType: 'text/javascript', body: FAKE_FS })
  if (url.startsWith('file://')) return route.continue()
  return route.abort()
})
await page.goto(FILE, { waitUntil: 'domcontentloaded' })

const step = async (name, fn) => {
  try { await fn(); console.log('  ✓ ' + name) }
  catch (e) { console.log('  ✗ ' + name + ' — ' + e.message.split('\n')[0]); errs.push(name + ': ' + e.message.split('\n')[0]) }
}
const shoot = async (f, ds) => {
  const fc = page.waitForEvent('filechooser')
  await page.click('[data-act="shot"]')
  ;(await fc).setFiles([PHOTO])
  await page.waitForSelector('.shot img', { timeout: 20000 })
}
/** move every stored reading back `n` days so the next save lands on a later date */
const rewind = (n) => page.evaluate((n) => {
  for (const [p, v] of window.__store) {
    if (!p.startsWith('readings/')) continue
    const out = {}
    for (const k of Object.keys(v.days)) {
      const d = new Date(); d.setDate(d.getDate() - n)
      out[String(d.getDate()).padStart(2, '0')] = v.days[k]
    }
    v.days = out
  }
  window.__persist()
}, n)

console.log('\n— connecting a database —')
await step('asks for the Firebase config first', async () => {
  await page.waitForSelector('#cfg', { timeout: 8000 })
})
await step('rejects a config it cannot read', async () => {
  await page.fill('#cfg', 'hello there')
  await page.click('[data-act="connect"]')
  await page.waitForSelector('.banner.warn', { timeout: 5000 })
})
await step('accepts a pasted config block', async () => {
  await page.fill('#cfg', CFG)
  await page.click('[data-act="connect"]')
  await page.waitForSelector('#g1', { timeout: 10000 })
})
await step('creates the first technician', async () => {
  await page.fill('#g1', 'สาคร'); await page.fill('#g2', '1234')
  await page.click('[data-act="first"]')
  await page.waitForSelector('[data-act="seed"]', { timeout: 8000 })
})
await step('seeds the 10 BISB rounds', async () => {
  await page.click('[data-act="seed"]')
  await page.waitForSelector('[data-act="rec"]', { timeout: 8000 })
  const n = await page.locator('[data-act="rec"]').count()
  if (n !== 10) throw new Error('expected 10 points, got ' + n)
})

console.log('\n— day 1 —')
await step('records Academic (electric + water)', async () => {
  await page.locator('[data-act="rec"]').first().click()
  await page.waitForSelector('.reg input')
  await shoot()
  await page.locator('.reg input').nth(0).fill('1026136.94')
  await page.locator('.reg input').nth(1).fill('3348')
  await page.click('[data-act="save"]')
  await page.waitForSelector('.daycard', { timeout: 10000 })
})
await step('records Science and Canteen', async () => {
  await page.locator('[data-act="rec"]').nth(1).click()
  await page.waitForSelector('.reg input')
  await shoot()
  await page.locator('.reg input').nth(0).fill('1784809.31')
  await page.locator('.reg input').nth(1).fill('10471')
  await page.click('[data-act="save"]')
  await page.waitForSelector('.daycard', { timeout: 10000 })
})
await step('day 1 shows no usage yet (nothing to subtract from)', async () => {
  const t = await page.locator('.totbox .tv').allInnerTexts()
  if (t.some((x) => x !== '0')) throw new Error('expected zeros, got ' + t.join('/'))
})

console.log('\n— day 2: the sums the team did on paper —')
await step('records both points again a day later', async () => {
  await rewind(1)
  await page.reload(); await page.waitForSelector('[data-act="rec"]', { timeout: 10000 })
  await page.locator('[data-act="rec"]').first().click()
  await page.waitForSelector('.reg input'); await shoot()
  await page.locator('.reg input').nth(0).fill('1026200')     // +63.06 kWh
  await page.locator('.reg input').nth(1).fill('3352')         // +4 m³
  await page.click('[data-act="save"]'); await page.waitForSelector('.daycard', { timeout: 10000 })
  await page.locator('[data-act="rec"]').nth(1).click()
  await page.waitForSelector('.reg input'); await shoot()
  await page.locator('.reg input').nth(0).fill('1784909.31')   // +100 kWh
  await page.locator('.reg input').nth(1).fill('10481')        // +10 m³
  await page.click('[data-act="save"]'); await page.waitForSelector('.daycard', { timeout: 10000 })
})
await step('home totals today across every point: 163.06 kWh / 14 m³', async () => {
  const t = await page.locator('.totbox .tv').allInnerTexts()
  if (t[0] !== '163.06') throw new Error('electric total was ' + t[0])
  if (t[1] !== '14') throw new Error('water total was ' + t[1])
  console.log('    ไฟฟ้า ' + t[0] + ' kWh · น้ำ ' + t[1] + ' ลบ.ม.')
})
await step('each point row shows its own daily usage', async () => {
  const chips = await page.locator('.prow').first().locator('.chip b').allInnerTexts()
  if (chips[0] !== '+63.06') throw new Error('point chip showed ' + chips[0])
})

console.log('\n— monthly report —')
await step('report opens with month totals', async () => {
  await page.click('[data-act="go"][data-v="rep"]')
  await page.waitForSelector('table.sum', { timeout: 8000 })
  const t = await page.locator('.totbox .tv').allInnerTexts()
  if (t[0] !== '163.06') throw new Error('month electric total ' + t[0])
})
await step('daily table lists a row per day with a month total', async () => {
  // day 1 has no delta (nothing before it), so only day 2 carries usage
  const rows = await page.locator('table.sum').first().locator('tbody tr').count()
  if (rows !== 2) throw new Error('expected 1 usage day + total, got ' + rows)
  const tot = await page.locator('table.sum tr.tot td').allInnerTexts()
  if (!tot.join(' ').includes('163.06')) throw new Error('month total missing: ' + tot.join('|'))
})

console.log('\n— month grid —')
await step('grid tab shows a column per meter and a row per day', async () => {
  await page.click('[data-act="go"][data-v="grid"]')
  await page.waitForSelector('table.gt', { timeout: 8000 })
  const heads = await page.locator('table.gt').first().locator('thead th').allInnerTexts()
  // date column + 2 electric meters (Academic, Science) + total column
  if (heads.length !== 4) throw new Error('expected 4 header cells, got ' + heads.length + ': ' + heads.join('|'))
  if (!heads[1].includes('Academic')) throw new Error('first meter column is ' + heads[1])
})
await step('grid runs from the first recorded day to today, not from the 1st', async () => {
  const rows = await page.locator('table.gt').first().locator('tbody tr').count()
  if (rows !== 2) throw new Error('expected the 2 recorded days, got ' + rows)
  const firstCell = await page.locator('table.gt').first().locator('tbody tr .c0').first().innerText()
  const y = new Date(); y.setDate(y.getDate() - 1)
  if (!firstCell.startsWith(String(y.getDate()) + ' ')) throw new Error('grid starts at ' + firstCell)
})
await step('grid cells carry each meter\'s own daily usage', async () => {
  const tf = await page.locator('table.gt').first().locator('tfoot td').allInnerTexts()
  if (!tf.join('|').includes('63.06')) throw new Error('Academic total missing: ' + tf.join('|'))
  if (!tf.join('|').includes('100')) throw new Error('Science total missing: ' + tf.join('|'))
  if (tf[tf.length - 1] !== '163.06') throw new Error('grand total was ' + tf[tf.length - 1])
})
await step('a second grid covers water separately', async () => {
  const n = await page.locator('table.gt').count()
  if (n !== 2) throw new Error('expected an electric and a water grid, got ' + n)
  const tf = await page.locator('table.gt').nth(1).locator('tfoot td').allInnerTexts()
  if (tf[tf.length - 1] !== '14') throw new Error('water grand total was ' + tf[tf.length - 1])
})
await step('toggling to meter readings shows the numbers on the dial', async () => {
  await page.click('[data-act="gmode"][data-m="read"]')
  await page.waitForTimeout(200)
  const body = await page.locator('table.gt').first().locator('tbody').innerText()
  if (!body.includes('1,026,200')) throw new Error('reading not shown in read mode')
  const tf = await page.locator('table.gt').first().locator('tfoot').count()
  if (tf) throw new Error('totals row should be hidden when showing raw readings')
  await page.click('[data-act="gmode"][data-m="use"]')
  await page.waitForTimeout(200)
})

console.log('\n— the document for accounting —')
await step('print view opens as an A4 sheet', async () => {
  await page.click('[data-act="go"][data-v="rep"]')
  await page.waitForSelector('[data-act="paper"]', { timeout: 8000 })
  await page.click('[data-act="paper"]')
  await page.waitForSelector('.paper', { timeout: 5000 })
  const hidden = await page.locator('.wrap').isHidden()
  if (!hidden) throw new Error('app chrome still visible behind the document')
})
await step('document carries org, month, totals and signatures', async () => {
  const txt = await page.locator('.paper').innerText()
  for (const want of ['รายงานการใช้น้ำและไฟฟ้า', 'BISB', 'Academic', 'Science and Canteen',
                      '163.06', 'บันทึกค่ามิเตอร์ประจำวัน', 'SITE', 'MONTH',
                      'ผู้บันทึก', 'Record By', 'CHECK BY', 'SITE SUPERVISOR', 'ฝ่ายบัญชี'])
    if (!txt.includes(want)) throw new Error('missing "' + want + '"')
})
await step('one sheet per workbook tab, gathering the meters off every round', async () => {
  // the rounds are walked point by point, but Kwh and น้ำ are what get printed
  const heads = await page.locator('.paper .psheet .ph h2').allInnerTexts()
  if (heads.length !== 2) throw new Error('expected the Kwh and water sheets, got ' + heads.join('|'))
  if (!heads[0].includes('แผ่น Kwh')) throw new Error('first sheet is ' + heads[0])
  if (!heads[1].includes('น้ำ')) throw new Error('second sheet is ' + heads[1])
  const foot = await page.locator('.paper .psheet').first().locator('.pfoot').innerText()
  for (const round of ['Academic', 'Science and Canteen'])
    if (!foot.includes(round)) throw new Error('sheet does not name the round ' + round + ': ' + foot)
})
await step('a sheet pairs each meter as reading + consumption, like the workbook', async () => {
  const sheet = page.locator('.paper .psheet').first()
  const top = await sheet.locator('thead tr').first().locator('th').allInnerTexts()
  // วันที่ | เวลา | ไฟฟ้า Academic | ไฟฟ้า Science | ผู้บันทึก
  if (top.length !== 5) throw new Error('expected 5 top headers, got ' + top.length + ': ' + top.join('|'))
  if (!top[2].includes('Academic')) throw new Error('meter column does not name its round: ' + top[2])
  const sub = await sheet.locator('thead tr').nth(1).locator('th').allInnerTexts()
  if (sub.length !== 4) throw new Error('expected a reading+usage pair per meter, got ' + sub.length)
  if (!sub[0].includes('เลขมิเตอร์')) throw new Error('no reading column: ' + sub[0])
  if (!sub[1].includes('kWh')) throw new Error('usage column lacks its unit: ' + sub[1])
})
await step('a sheet carries the reading, the usage, the time and who read it', async () => {
  // today's line, wherever in the month today falls
  const row = page.locator('.paper .psheet').first().locator('tbody tr').nth(new Date().getDate() - 1)
  const cells = await row.locator('td').allInnerTexts()
  if (cells[2] !== '1,026,200') throw new Error('reading column was ' + cells[2])
  if (cells[3] !== '63.06') throw new Error('usage column was ' + cells[3])
  if (cells[4] !== '1,784,909.31') throw new Error("the next round's meter was " + cells[4])
  if (!/^\d{2}:\d{2}$/.test(cells[1])) throw new Error('time column was ' + cells[1])
  if (cells[cells.length - 1] !== 'สาคร') throw new Error('recorded-by was ' + cells[cells.length - 1])
})
await step('a sheet runs the whole month, blanking the days nobody walked', async () => {
  const sheet = page.locator('.paper .psheet').first()
  const day = new Date().getDate()
  const rows = await sheet.locator('tbody tr:not(.tot):not(.avg)').count()
  if (rows !== day) throw new Error('expected ' + day + ' day rows, got ' + rows)
  // only today and yesterday were walked; every earlier day is a blank line
  const miss = await sheet.locator('tbody tr.miss').count()
  if (miss !== day - 2) throw new Error('expected ' + (day - 2) + ' unwalked days, got ' + miss)
})
await step('each sheet totals and averages its own meters', async () => {
  const sheet = page.locator('.paper .psheet').first()
  const tot = await sheet.locator('tr.tot td').allInnerTexts()
  if (!tot.join('|').includes('63.06')) throw new Error('sheet total missing: ' + tot.join('|'))
  // one day carries usage, so the average per recorded day is that same number
  const avg = await sheet.locator('tr.avg td').allInnerTexts()
  if (!avg.join('|').includes('63.06')) throw new Error('sheet average missing: ' + avg.join('|'))
})
await step('every sheet says which of the month it is', async () => {
  const sheets = await page.locator('.paper .psheet').count()
  const id = await page.locator('.paper .psheet').first().locator('.idbox').innerText()
  if (!id.includes('2 / ' + (sheets + 1))) throw new Error('sheet numbering reads ' + id)
})
await step('the cover reports whether the month is complete', async () => {
  const flag = await page.locator('.paper .pflag').innerText()
  if (!/ขาด|ครบทุกวัน/.test(flag)) throw new Error('no completeness line: ' + flag)
})
await step('the cover still summarises by round, naming each meter\'s sheet', async () => {
  const grp = await page.locator('.paper tr.grp').allInnerTexts()
  if (grp.length < 2) throw new Error('expected point group rows, got ' + grp.length)
  const body = await page.locator('.paper table.pt').first().innerText()
  if (!body.includes('Kwh') || !body.includes('น้ำ'))
    throw new Error('summary does not say which sheet a meter prints on: ' + body)
})
await step('print stylesheet hides the app and keeps the sheet', async () => {
  await page.emulateMedia({ media: 'print' })
  const paperShown = await page.locator('.paper').isVisible()
  const appShown = await page.locator('.wrap').isVisible()
  await page.emulateMedia({ media: 'screen' })
  if (!paperShown) throw new Error('sheet hidden when printing')
  if (appShown) throw new Error('app visible when printing')
})
await step('renders to a real PDF', async () => {
  await page.emulateMedia({ media: 'print' })
  const buf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' } })
  await page.emulateMedia({ media: 'screen' })
  if (buf.length < 5000) throw new Error('pdf suspiciously small: ' + buf.length)
  const { writeFileSync } = await import('node:fs')
  writeFileSync('/tmp/report.pdf', buf)
  console.log('    /tmp/report.pdf — ' + (buf.length / 1024).toFixed(0) + 'KB')
})
await step('closes back to the app', async () => {
  await page.click('[data-act="closepaper"]')
  await page.waitForSelector('table.sum', { timeout: 5000 })
})

console.log('\n— CSV exports —')
for (const [kind, must] of [['sum', 'เลขต้นเดือน'], ['day', 'ใช้ไป'], ['grid', 'รวมทั้งเดือน'], ['det', 'ผู้บันทึก']]) {
  await step('CSV "' + kind + '" downloads with Thai headers', async () => {
    const dl = page.waitForEvent('download', { timeout: 8000 })
    await page.click(`[data-act="csv"][data-kind="${kind}"]`)
    const d = await dl
    const s = await d.createReadStream()
    let text = ''
    for await (const c of s) text += c
    if (!text.startsWith('﻿')) throw new Error('missing BOM')
    if (!text.includes(must)) throw new Error('missing header ' + must)
    if (kind === 'day' && !text.includes('163.06')) throw new Error('daily CSV missing the total')
    if (kind === 'grid') {
      if (!text.includes('Academic - ไฟฟ้า')) throw new Error('grid CSV missing a meter column')
      if (!text.includes('163.06')) throw new Error('grid CSV missing the grand total')
    }
    console.log('    ' + d.suggestedFilename())
  })
}

console.log('\n— team link —')
await step('settings offers a link carrying the database config', async () => {
  await page.click('[data-act="go"][data-v="set"]')
  await page.click('[data-act="stab"][data-t="data"]')
  await page.waitForSelector('#tl')
  const link = await page.locator('#tl').innerText()
  if (!link.includes('?cfg=')) throw new Error('no config in link: ' + link)
})
await step('a fresh device opening that link connects straight away', async () => {
  const link = await page.locator('#tl').innerText()
  const p2 = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await p2.route('**', (route) => {
    const url = route.request().url()
    if (url.includes('firebase-app')) return route.fulfill({ contentType: 'text/javascript', body: FAKE_APP })
    if (url.includes('firebase-firestore')) return route.fulfill({ contentType: 'text/javascript', body: FAKE_FS })
    if (url.startsWith('file://')) return route.continue()
    return route.abort()
  })
  // a different device has its own empty store, so it must at least get past
  // the connect screen to the sign-in list rather than asking for a config
  await p2.goto(link.replace('http://localhost', 'file://'), { waitUntil: 'domcontentloaded' })
  await p2.waitForSelector('#g1, [data-act="who"]', { timeout: 10000 })
  const askedForCfg = await p2.locator('#cfg').count()
  await p2.close()
  if (askedForCfg) throw new Error('still asked for the config')
})

console.log('\n— going back to an earlier day —')
await step('home steps back a day and shows that day instead', async () => {
  await page.click('[data-act="go"][data-v="home"]')
  await page.waitForSelector('.daycard', { timeout: 8000 })
  const todayLabel = await page.locator('.daycard .d2').innerText()
  await page.click('[data-act="day"][data-k="-1"]')
  await page.waitForTimeout(250)
  const back = await page.locator('.daycard .d2').innerText()
  if (back === todayLabel) throw new Error('date did not move')
  const head = await page.locator('.daycard .d1').innerText()
  if (!head.includes('ย้อนหลัง')) throw new Error('no back-in-time cue: ' + head)
})
await step("that day's own readings are shown, not today's", async () => {
  const chips = await page.locator('.prow').first().locator('.chip').allInnerTexts()
  // day 1 recorded 1,026,136.94 and has no delta, so the raw reading shows
  if (!chips.join('|').includes('1,026,136.94')) throw new Error('day 1 reading missing: ' + chips.join('|'))
})
await step('cannot walk into the future', async () => {
  await page.click('[data-act="gotoday"]')
  await page.waitForTimeout(250)
  const disabled = await page.locator('[data-act="day"][data-k="1"]').isDisabled()
  if (!disabled) throw new Error('next-day button is live on today')
})
await step('opening a point on a past day edits that day', async () => {
  await page.click('[data-act="day"][data-k="-1"]')
  await page.waitForTimeout(250)
  await page.locator('[data-act="rec"]').first().click()
  await page.waitForSelector('.reg input', { timeout: 8000 })
  const banner = await page.locator('.banner.info').innerText()
  if (!banner.includes('ย้อนหลัง')) throw new Error('no past-day warning: ' + banner)
  const v = await page.locator('.reg input').first().inputValue()
  if (v !== '1026136.94') throw new Error("loaded the wrong day's value: " + v)
})
await step('saving a correction lands on the day being edited', async () => {
  await page.locator('.reg input').nth(0).fill('1026140')
  await page.click('[data-act="save"]')
  await page.waitForSelector('.daycard', { timeout: 10000 })
  const chips = await page.locator('.prow').first().locator('.chip').allInnerTexts()
  if (!chips.join('|').includes('1,026,140')) throw new Error('correction not on that day: ' + chips.join('|'))
})
await step("today's usage recomputes from the corrected day", async () => {
  await page.click('[data-act="gotoday"]')
  await page.waitForTimeout(300)
  const t = await page.locator('.totbox .tv').allInnerTexts()
  // Academic day 2 is 1,026,200 so the delta is now 60, plus Science's 100
  if (t[0] !== '160') throw new Error('electric total after correction was ' + t[0])
})
await step('a history row opens that day for editing', async () => {
  await page.click('[data-act="go"][data-v="hist"]')
  await page.waitForSelector('.ledrow', { timeout: 8000 })
  await page.locator('.ledrow').first().click()
  await page.waitForSelector('.reg input', { timeout: 8000 })
  const title = await page.locator('.topbar h1').innerText()
  if (!title.includes('Academic')) throw new Error('opened ' + title)
})
await step('a wrong entry can be deleted', async () => {
  page.once('dialog', (d) => d.accept())
  await page.click('[data-act="delentry"]')
  await page.waitForSelector('.daycard', { timeout: 10000 })
  await page.click('[data-act="go"][data-v="hist"]')
  await page.waitForSelector('.led', { timeout: 8000 })
  const txt = await page.locator('.led').first().innerText()
  if (txt.includes('1,026,140')) throw new Error('deleted reading is still listed')
})

console.log('\n— dark theme —')
await step('renders dark without light-only colours', async () => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.reload()
  await page.waitForSelector('.daycard, [data-act="who"], #g1', { timeout: 10000 })
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const [r, g, b] = bg.match(/\d+/g).map(Number)
  if (r + g + b > 200) throw new Error('body not dark: ' + bg)
})

console.log('\n— what the document tells accounting to ask about —')
await step('a meter number typed in settings prints on that meter\'s sheet', async () => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.click('[data-act="go"][data-v="set"]')
  await page.click('[data-act="stab"][data-t="points"]')
  await page.locator('[data-act="popen"]').first().click()
  await page.locator('input[data-act="mno"]').first().fill('61E5481417306')
  await page.locator('input[data-act="mno"]').first().blur()
  await page.waitForTimeout(400)
  await page.click('[data-act="go"][data-v="rep"]')
  await page.waitForSelector('[data-act="paper"]', { timeout: 8000 })
  await page.click('[data-act="paper"]')
  const meta = await page.locator('.paper .psheet').first().locator('.pmeta').innerText()
  if (!meta.includes('61E5481417306')) throw new Error('meter number not on the sheet: ' + meta)
  await page.click('[data-act="closepaper"]')
})
await step('a reading that goes backwards is called out on the cover', async () => {
  // a swapped meter — or a typo: either way accounting should not meet it alone
  await page.evaluate(() => {
    // Science still has both days; Academic's first day was deleted above
    const p = window.__store.get('config/points').items[1]
    for (const [path, v] of window.__store) {
      if (!path.startsWith('readings/' + p.id)) continue
      const last = Object.keys(v.days).sort().pop()
      v.days[last].vals[p.meters[0].id] = 1
    }
    window.__persist()
  })
  await page.reload()
  await page.waitForSelector('[data-act="rec"]', { timeout: 10000 })
  await page.click('[data-act="go"][data-v="rep"]')
  await page.waitForSelector('[data-act="paper"]', { timeout: 8000 })
  await page.click('[data-act="paper"]')
  const flag = await page.locator('.paper .pflag').innerText()
  if (!flag.includes('ต่ำกว่าครั้งก่อน')) throw new Error('backwards reading not flagged: ' + flag)
  if (!flag.includes('Science and Canteen')) throw new Error('flag does not name the point: ' + flag)
  await page.click('[data-act="closepaper"]')
})

console.log('\n— the meters as the Excel workbook has them —')
await step('installs the workbook set, parking the ones nobody has placed yet', async () => {
  page.once('dialog', (d) => d.accept())
  await page.click('[data-act="go"][data-v="set"]')
  await page.click('[data-act="stab"][data-t="points"]')
  await page.click('[data-act="excel"]')
  await page.waitForTimeout(600)
  const items = await page.evaluate(() => window.__store.get('config/points').items)
  const n = items.reduce((a, p) => a + p.meters.length, 0)
  if (n !== 25) throw new Error('expected the workbook\'s 25 columns, got ' + n)
  const park = items.find((p) => p.name === 'ยังไม่ระบุจุด')
  // the 7 Kwh columns plus Main Meter, Softenner and West Teasment
  if (!park || park.meters.length !== 10) throw new Error('holding round has ' + (park ? park.meters.length : 0))
  const sheets = new Set(items.flatMap((p) => p.meters.map((m) => m.sheet)))
  if (sheets.size !== 4) throw new Error('expected 4 sheets, got ' + [...sheets].join('|'))
})
await step('a TOU round records all seven registers at once', async () => {
  await page.click('[data-act="go"][data-v="home"]')
  await page.waitForSelector('[data-act="rec"]', { timeout: 8000 })
  await page.locator('[data-act="rec"]').filter({ hasText: 'MEA' }).click()
  await page.waitForSelector('.reg input', { timeout: 8000 })
  const regs = await page.locator('.reg input').count()
  if (regs !== 7) throw new Error('expected 7 TOU registers, got ' + regs)
  await shoot()
  for (const [i, v] of ['2536', '1303', '1233', '0.535', '0.435', '0.068', '0.043'].entries())
    await page.locator('.reg input').nth(i).fill(v)
  await page.click('[data-act="save"]')
  await page.waitForSelector('.daycard', { timeout: 10000 })
})
await step('the TOU sheet prints demand registers as one read column, not a pair', async () => {
  await page.click('[data-act="go"][data-v="rep"]')
  await page.waitForSelector('[data-act="paper"]', { timeout: 8000 })
  await page.click('[data-act="paper"]')
  const sheet = page.locator('.paper .psheet').first()
  const head = await sheet.locator('.ph h2').innerText()
  if (!head.includes('แผ่น TOU')) throw new Error('first sheet is ' + head)
  const top = await sheet.locator('thead tr').first().locator('th').allInnerTexts()
  // วันที่ | เวลา | 7 registers | ผู้บันทึก
  if (top.length !== 10) throw new Error('expected 10 top headers, got ' + top.length)
  const sub = await sheet.locator('thead tr').nth(1).locator('th').allInnerTexts()
  // only the three consumption registers carry a reading + usage pair
  if (sub.length !== 6) throw new Error('expected 3 pairs under the header, got ' + sub.length)
  const tot = await sheet.locator('tr.tot').innerText()
  if (!tot.includes('สูงสุด 0.535')) throw new Error('max demand not totalled as a maximum: ' + tot)
  await page.click('[data-act="closepaper"]')
})

await browser.close()
console.log('\n' + (errs.length ? '✗ ' + errs.length + ' problem(s):\n' + errs.join('\n') : '✓ all checks passed'))
process.exit(errs.length ? 1 : 0)
