import { chromium } from 'playwright'

const FILE = 'file:///home/user/basis-meter-app/artifact/meter-log.html'
const PHOTO = '/root/.claude/uploads/f60a476b-7088-5cc9-8238-10d7a846a230/a8a3f894-image.jpg'

// In-memory stand-in for the `db` capability, matching the documented surface.
const STUB = () => {
  // backed by sessionStorage so the fake store survives page.reload()
  const SK = '__fakedb'
  const store = new Map(JSON.parse(sessionStorage.getItem(SK) || '[]'))
  const subs = []                  // {kind, path, field, val, cb}
  const clone = (o) => JSON.parse(JSON.stringify(o))
  const persist = () => sessionStorage.setItem(SK, JSON.stringify([...store]))
  window.__persist = persist

  const snapOf = (path) => ({
    id: path.split('/').pop(),
    exists: store.has(path),
    data: () => (store.has(path) ? clone(store.get(path)) : undefined),
    metadata: { fromCache: false, hasPendingWrites: false },
  })

  function fire() {
    for (const s of subs) {
      if (s.kind === 'doc') s.cb(snapOf(s.path))
      else {
        const docs = []
        for (const [p, v] of store) {
          const parent = p.split('/').slice(0, -1).join('/')
          if (parent !== s.path) continue
          if (s.field && v[s.field] !== s.val) continue
          docs.push(snapOf(p))
        }
        s.cb({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} })
      }
    }
  }

  const mkQuery = (path, field, val) => ({
    where: (f, op, v) => mkQuery(path, f, v),
    orderBy: () => mkQuery(path, field, val),
    limit: () => mkQuery(path, field, val),
    get: async () => {
      const docs = []
      for (const [p, v] of store) {
        const parent = p.split('/').slice(0, -1).join('/')
        if (parent !== path) continue
        if (field && v[field] !== val) continue
        docs.push(snapOf(p))
      }
      return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} }
    },
    onSnapshot: (cb) => { const s = { kind: 'q', path, field, val, cb }; subs.push(s); setTimeout(() => cb0(s), 0); return () => {} },
    doc: (id) => mkDoc(path + '/' + (id || 'auto' + Math.random().toString(36).slice(2, 8))),
    add: async (d) => { const r = mkDoc(path + '/auto' + Math.random().toString(36).slice(2, 8)); await r.set(d); return r },
  })
  function cb0(s) {
    const docs = []
    for (const [p, v] of store) {
      const parent = p.split('/').slice(0, -1).join('/')
      if (parent !== s.path) continue
      if (s.field && v[s.field] !== s.val) continue
      docs.push(snapOf(p))
    }
    s.cb({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} })
  }

  const mkDoc = (path) => ({
    id: path.split('/').pop(),
    path,
    get: async () => snapOf(path),
    set: async (d) => {
      const s = JSON.stringify(d)
      if (s.length > 256 * 1024) { const e = new Error('too big'); e.code = 'invalid_argument'; throw e }
      store.set(path, clone(d)); persist(); fire()
    },
    update: async (d) => {
      if (!store.has(path)) { const e = new Error('missing'); e.code = 'invalid_argument'; throw e }
      store.set(path, { ...store.get(path), ...clone(d) }); persist(); fire()
    },
    delete: async () => { store.delete(path); persist(); fire() },
    onSnapshot: (cb) => { const s = { kind: 'doc', path, cb }; subs.push(s); setTimeout(() => cb(snapOf(path)), 0); return () => {} },
    collection: (sub) => mkQuery(path + '/' + sub),
  })

  window.__store = store
  window.__saved = []
  window.claude = {
    use: async (n) => {
      if (n === 'db') return Object.freeze({ doc: mkDoc, collection: (p) => mkQuery(p) })
      if (n === 'downloads') return Object.freeze({
        save: async (req) => { window.__saved.push({ filename: req.filename, data: String(req.data) }); return { status: 'saved' } },
      })
      return null
    },
  }
}

const errs = []
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-proxy-server',
    '--disable-background-networking', '--no-first-run', '--disable-sync',
    '--disable-component-update', '--no-default-browser-check'],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/font|net::|Failed to load resource/i.test(m.text())) errs.push('CONSOLE: ' + m.text()) })

// run fully offline: the page's only remote asset is the Google Fonts stylesheet
await page.route('**', (route) =>
  route.request().url().startsWith('file://') ? route.continue() : route.abort())

await page.addInitScript(STUB)
await page.goto(FILE, { waitUntil: 'domcontentloaded' })

const step = async (name, fn) => {
  try { await fn(); console.log('  ✓ ' + name) }
  catch (e) { console.log('  ✗ ' + name + ' — ' + e.message); errs.push(name + ': ' + e.message) }
}

console.log('\n— first run —')
await step('shows first-time setup', async () => {
  await page.waitForSelector('#g1', { timeout: 8000 })
})
await step('creates first technician', async () => {
  await page.fill('#g1', 'สาคร')
  await page.fill('#g2', '1234')
  await page.click('[data-act="first"]')
  await page.waitForSelector('[data-act="seed"]', { timeout: 5000 })
})
await step('seeds the 10 BISB rounds', async () => {
  await page.click('[data-act="seed"]')
  await page.waitForSelector('[data-act="rec"]', { timeout: 5000 })
  const n = await page.locator('[data-act="rec"]').count()
  if (n !== 10) throw new Error('expected 10 points, got ' + n)
})
await step('point names match the LINE log', async () => {
  const t = await page.locator('.pname').allInnerTexts()
  for (const want of ['Academic', 'Science and Canteen', 'MDB-EMDB and SOFT', 'บ่อบำบัด'])
    if (!t.some((x) => x.includes(want))) throw new Error('missing ' + want)
})

console.log('\n— recording a round —')
await step('opens Academic with 2 meters', async () => {
  await page.locator('[data-act="rec"]').first().click()
  await page.waitForSelector('.reg input', { timeout: 5000 })
  const n = await page.locator('.reg input').count()
  if (n !== 2) throw new Error('expected 2 meters, got ' + n)
})
await step('attaches a real meter photo', async () => {
  const fc = page.waitForEvent('filechooser')
  await page.click('[data-act="shot"]')
  ;(await fc).setFiles([PHOTO])
  await page.waitForSelector('.shot img', { timeout: 15000 })
})
await step('compresses photo under the 256KiB doc cap', async () => {
  const len = await page.evaluate(() => document.querySelector('.shot img').src.length)
  if (len > 168000) throw new Error('photo too big: ' + len)
  console.log('    photo payload: ' + (len / 1024).toFixed(0) + 'KB')
})
await step('saves both readings', async () => {
  const ins = page.locator('.reg input')
  await ins.nth(0).fill('1026136.94')
  await ins.nth(1).fill('3348')
  await page.click('[data-act="save"]')
  await page.waitForSelector('.daycard', { timeout: 8000 })
})
await step('home shows the round complete', async () => {
  const txt = await page.locator('.meterlabel').innerText()
  if (!/ครบแล้ว\s*1/.test(txt)) throw new Error('progress not updated: ' + txt)
})

console.log('\n— usage maths —')
await step('second day computes usage from previous reading', async () => {
  // rewind stored reading one day, then record today again
  await page.evaluate(() => {
    for (const [p, v] of window.__store) {
      if (!p.startsWith('readings/')) continue
      const days = v.days, k = Object.keys(days)[0]
      const y = new Date(); y.setDate(y.getDate() - 1)
      const nk = String(y.getDate()).padStart(2, '0')
      if (nk !== k) { days[nk] = days[k]; delete days[k] }
    }
    window.__persist()
  })
  await page.reload()
  await page.waitForSelector('[data-act="rec"]', { timeout: 8000 })
  await page.locator('[data-act="rec"]').first().click()
  await page.waitForSelector('.reg input', { timeout: 5000 })
  await page.locator('.reg input').nth(0).fill('1026200')
  const use = await page.locator('.mfoot .u b').first().innerText()
  if (use !== '63.06') throw new Error('expected 63.06, got ' + use)
})
await step('warns when the reading goes backwards', async () => {
  await page.locator('.reg input').nth(0).fill('900000')
  await page.waitForTimeout(120)
  const hidden = await page.locator('.mwarn').first().isHidden()
  if (hidden) throw new Error('no backwards warning shown')
})
await step('saves the second day', async () => {
  const ins = page.locator('.reg input')
  await ins.nth(0).fill('1026200')
  await ins.nth(1).fill('3352')
  const fc = page.waitForEvent('filechooser')
  await page.click('[data-act="shot"]')
  ;(await fc).setFiles([PHOTO])
  await page.waitForSelector('.shot img', { timeout: 15000 })
  await page.click('[data-act="save"]')
  await page.waitForSelector('.daycard', { timeout: 8000 })
})

console.log('\n— history & report —')
await step('history lists both days with deltas', async () => {
  await page.click('[data-act="go"][data-v="hist"]')
  await page.waitForSelector('.ledrow', { timeout: 5000 })
  const rows = await page.locator('.ledrow').count()
  if (rows < 4) throw new Error('expected >=4 meter-day rows, got ' + rows)
  const d = await page.locator('.ledrow .vv i').first().innerText()
  if (!d.startsWith('+')) throw new Error('no delta: ' + d)
})
await step('report totals the month', async () => {
  await page.click('[data-act="go"][data-v="rep"]')
  await page.waitForSelector('table.sum', { timeout: 5000 })
  const body = await page.locator('table.sum tbody').innerText()
  if (!body.includes('Academic')) throw new Error('Academic missing from report')
})
await step('summary CSV downloads with Thai headers + BOM', async () => {
  await page.click('[data-act="csv"][data-kind="sum"]')
  await page.waitForTimeout(400)
  const f = await page.evaluate(() => window.__saved.at(-1))
  if (!f) throw new Error('no file offered')
  if (!f.data.startsWith('﻿')) throw new Error('missing BOM')
  if (!f.data.includes('หน่วยที่ใช้')) throw new Error('missing Thai header')
  if (!f.filename.endsWith('.csv')) throw new Error('bad filename ' + f.filename)
  console.log('    ' + f.filename)
  console.log('    ' + f.data.split('\r\n').slice(0, 3).join('\n    '))
})
await step('detail CSV downloads', async () => {
  await page.click('[data-act="csv"][data-kind="det"]')
  await page.waitForTimeout(400)
  const f = await page.evaluate(() => window.__saved.at(-1))
  if (!f.data.includes('ผู้บันทึก')) throw new Error('missing detail header')
  const lines = f.data.trim().split('\r\n')
  if (lines.length < 4) throw new Error('too few detail rows: ' + lines.length)
})

console.log('\n— settings —')
await step('adds a technician', async () => {
  await page.click('[data-act="go"][data-v="set"]')
  await page.click('[data-act="stab"][data-t="staff"]')
  await page.fill('#sn', 'ช่างที่สอง')
  await page.fill('#sp', '5678')
  await page.click('[data-act="adds"]')
  await page.waitForTimeout(400)
  const n = await page.locator('[data-act="togs"]').count()
  if (n !== 2) throw new Error('expected 2 staff, got ' + n)
})
await step('adds a meter to a point', async () => {
  await page.click('[data-act="stab"][data-t="points"]')
  await page.locator('[data-act="popen"]').first().click()
  await page.waitForSelector('[data-act="addm"]')
  const pid = await page.locator('[data-act="addm"]').first().getAttribute('data-id')
  await page.fill('#ml_' + pid, 'ไฟฟ้าสำรอง')
  await page.fill('#mu_' + pid, 'kWh')
  await page.click('[data-act="addm"]')
  await page.waitForTimeout(400)
  const txt = await page.locator('.card').first().innerText()
  if (!txt.includes('ไฟฟ้าสำรอง')) throw new Error('meter not added')
})
await step('PIN login works after switching user', async () => {
  await page.click('[data-act="stab"][data-t="data"]')
  await page.click('[data-act="switch"]')
  await page.waitForSelector('[data-act="who"]', { timeout: 5000 })
  await page.locator('[data-act="who"]').first().click()
  await page.waitForSelector('[data-act="dig"]')
  for (const d of ['1', '2', '3', '4']) await page.click(`[data-act="dig"][data-d="${d}"]`)
  await page.waitForSelector('.daycard', { timeout: 8000 })
})
await step('wrong PIN is rejected', async () => {
  await page.click('[data-act="go"][data-v="set"]')
  await page.click('[data-act="stab"][data-t="data"]')
  await page.click('[data-act="switch"]')
  await page.waitForSelector('[data-act="who"]')
  await page.locator('[data-act="who"]').first().click()
  for (const d of ['9', '9', '9', '9']) await page.click(`[data-act="dig"][data-d="${d}"]`)
  await page.waitForSelector('.banner.warn', { timeout: 5000 })
})

console.log('\n— dark theme —')
await step('renders in dark mode without light-only colors', async () => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.reload()
  await page.waitForSelector('.pindot, [data-act="who"], .daycard', { timeout: 8000 })
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') throw new Error('body background transparent')
  const [r, g, b] = bg.match(/\d+/g).map(Number)
  if (r + g + b > 200) throw new Error('body not dark: ' + bg)
  console.log('    body bg ' + bg)
})

await browser.close()
console.log('\n' + (errs.length ? '✗ ' + errs.length + ' problem(s):\n' + errs.join('\n') : '✓ all checks passed'))
process.exit(errs.length ? 1 : 0)
