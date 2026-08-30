/**
 * End-to-end run for docs/index.html against an in-memory stand-in for
 * Firestore: the gstatic module URLs are intercepted and fulfilled with a
 * fake that implements only the surface the app's adapter uses.
 *
 *   node docs/e2e.mjs
 */
import { chromium } from 'playwright'

const FILE = 'file:///home/user/basis-meter-app/docs/index.html'
const PHOTO = '/root/.claude/uploads/f60a476b-7088-5cc9-8238-10d7a846a230/a8a3f894-image.jpg'
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
                      '163.06', 'ยอดใช้รายวัน — ไฟฟ้า', 'ยอดใช้รายวัน — น้ำ', 'ผู้บันทึก', 'ฝ่ายบัญชี'])
    if (!txt.includes(want)) throw new Error('missing "' + want + '"')
})
await step('printed grid has a column per meter, not just a daily total', async () => {
  const heads = await page.locator('.paper table.pt.grid').first().locator('thead th').allInnerTexts()
  if (heads.length !== 4) throw new Error('expected date + 2 meters + total, got ' + heads.length)
  if (!/Academic/i.test(heads[1])) throw new Error('grid header was ' + heads[1])
  if (!heads[1].includes('ไฟฟ้า')) throw new Error('meter label missing from header: ' + heads[1])
})
await step('document groups meters under their point', async () => {
  const grp = await page.locator('.paper tr.grp').allInnerTexts()
  if (grp.length < 2) throw new Error('expected point group rows, got ' + grp.length)
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
  if (!link.includes('#cfg=')) throw new Error('no config in link: ' + link)
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

console.log('\n— dark theme —')
await step('renders dark without light-only colours', async () => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.reload()
  await page.waitForSelector('.daycard, [data-act="who"], #g1', { timeout: 10000 })
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const [r, g, b] = bg.match(/\d+/g).map(Number)
  if (r + g + b > 200) throw new Error('body not dark: ' + bg)
})

await browser.close()
console.log('\n' + (errs.length ? '✗ ' + errs.length + ' problem(s):\n' + errs.join('\n') : '✓ all checks passed'))
process.exit(errs.length ? 1 : 0)
