import { expect, test, type Page, type Route } from '@playwright/test'

// Phase 4 break tests: they try to make the public experience fall over.
const CATHEDRAL = '11111111-1111-1111-1111-111111111111'

const nav = (page: Page) => page.getByRole('navigation', { name: 'Iglesias de Mérida' })
const pick = (page: Page, name: RegExp) => nav(page).getByRole('button', { name })
const detail = (page: Page, name: RegExp) => page.getByRole('heading', { level: 2, name })

function watch(page: Page) {
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('dialog', (d) => { problems.push(`dialog: ${d.message()}`); void d.dismiss() })
  page.on('console', (m) => {
    const t = m.text()
    if (/Too many active WebGL contexts|WebGL context lost|CONTEXT_LOST/i.test(t)) problems.push(`webgl: ${t}`)
  })
  return problems
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

test.describe('map and navigation', () => {
  test('loads the map and the accessible list', async ({ page }) => {
    const problems = watch(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'ChurchSeeker' })).toBeVisible()
    await expect(nav(page).getByRole('button')).toHaveCount(3)
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    expect(problems).toEqual([])
  })

  test('spam-clicking between churches never breaks the camera or the view', async ({ page }) => {
    const problems = watch(page)
    await page.goto('/')
    await expect(nav(page).getByRole('button')).toHaveCount(3)
    const names = [/Catedral/, /Jesús/, /Santa Lucía/]
    let last = names[0]
    for (let i = 0; i < 45; i++) {
      // The detail view may legitimately open while we are still clicking; the list is gone then.
      if (!(await nav(page).isVisible())) break
      last = names[i % 3]
      await pick(page, last).click({ delay: 0, noWaitAfter: true, timeout: 2000 }).catch(() => {})
    }
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible({ timeout: 45_000 })
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(1)
    void last
    expect(problems).toEqual([])
  })

  test('opening and leaving churches repeatedly does not leak WebGL contexts or memory', async ({ page }) => {
    const problems = watch(page)
    await page.goto('/')
    await expect(nav(page).getByRole('button')).toHaveCount(3)
    const heap = () => page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0)
    const names = [/Catedral/, /Jesús/, /Santa Lucía/]
    await pick(page, names[0]).click()
    await expect(detail(page, names[0])).toBeVisible({ timeout: 30_000 })
    await page.keyboard.press('Escape')
    const before = await heap()
    for (let i = 0; i < 8; i++) {
      await pick(page, names[i % 3]).click()
      await expect(detail(page, names[i % 3])).toBeVisible({ timeout: 30_000 })
      expect(await page.locator('canvas').count()).toBeLessThanOrEqual(4)
      await page.keyboard.press('Escape')
      await expect(nav(page)).toBeVisible()
    }
    const after = await heap()
    expect(after - before).toBeLessThan(120 * 1024 * 1024)
    expect(problems).toEqual([])
  })

  test('Esc leaves a church, and inside a book it only closes the book', async ({ page }) => {
    await page.goto('/')
    await pick(page, /Catedral/).click()
    await expect(detail(page, /Catedral/)).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: /Libro de bautismos/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(detail(page, /Catedral/)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(nav(page)).toBeVisible()
  })
})

test.describe('codex shelf', () => {
  test('private books never reach the public page', async ({ page }) => {
    const bodies: string[] = []
    page.on('response', async (r) => { if (r.url().includes('/api/public/')) bodies.push(await r.text().catch(() => '')) })
    await page.goto('/')
    await pick(page, /Catedral/).click()
    await expect(detail(page, /Catedral/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: /Libro de bautismos/ })).toBeVisible()
    const text = (await page.locator('body').innerText()) + bodies.join('')
    for (const secret of ['Actas del consejo', 'Libro de finanzas', 'Correspondencia']) expect(text).not.toContain(secret)
    await expect(page.getByText('🔒')).toHaveCount(0)
  })

  const forged = (route: Route) => json(route, [{ id: '99999999-9999-9999-9999-999999999999', title: 'Falso', description: null, author: null, spineColor: '#112233', spineThickness: 5 }])

  for (const [why, handler] of [
    ['404 for a private or unknown id', (r: Route) => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' })],
    ['an HTML page pretending to be a PDF', (r: Route) => r.fulfill({ status: 200, contentType: 'application/pdf', body: '<html><script>window.__xss=1</script></html>   ' })],
    ['an executable pretending to be a PDF', (r: Route) => r.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff]) })],
    ['a server error', (r: Route) => r.fulfill({ status: 500, body: 'boom' })],
    ['a dropped connection', (r: Route) => r.abort('failed')],
    ['a corrupt PDF with a valid header', (r: Route) => r.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\nthis is not really a pdf at all\n%%EOF\n' })],
  ] as const) {
    test(`opening a book that returns ${why} shows an error without crashing`, async ({ page }) => {
      const problems = watch(page)
      await page.route('**/api/public/churches/*/books', forged)
      await page.route('**/api/public/churches/*/books/*/file', handler)
      await page.goto('/')
      await pick(page, /Catedral/).click()
      await expect(detail(page, /Catedral/)).toBeVisible({ timeout: 30_000 })
      await page.getByRole('button', { name: /Falso/ }).click()
      await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible({ timeout: 20_000 })
      expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      expect(problems.filter((p) => !p.startsWith('pageerror: Failed to fetch'))).toEqual([])
    })
  }

  test('a PDF larger than the client limit is refused', async ({ page }) => {
    await page.route('**/api/public/churches/*/books', (r) => json(r, [{ id: '99999999-9999-9999-9999-999999999999', title: 'Enorme', description: null, author: null, spineColor: '#112233', spineThickness: 5 }]))
    await page.route('**/api/public/churches/*/books/*/file', (r) => r.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(31 * 1024 * 1024)]) }))
    await page.goto('/')
    await pick(page, /Catedral/).click()
    await expect(detail(page, /Catedral/)).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: /Enorme/ }).click()
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('PDF', { timeout: 30_000 })
  })
})

test.describe('hostile and broken API data', () => {
  test('script-looking data is shown as text and never executed', async ({ page }) => {
    const problems = watch(page)
    const evil = '<img src=x onerror="window.__xss=1">'
    await page.route('**/api/public/churches', (r) => json(r, [
      { id: CATHEDRAL, name: evil, denomination: '<b>x</b>', patronSaint: '"><script>window.__xss=2</script>', latitude: 20.96737, longitude: -89.62369, modelUrl: null, logoUrl: null },
      { id: 'bad-1', name: 'Sin coordenadas', denomination: 'x', patronSaint: 'y', latitude: null, longitude: null, modelUrl: null, logoUrl: null },
      { id: 'bad-2', name: 'Fuera de rango', denomination: 'x', patronSaint: 'y', latitude: 9999, longitude: -9999, modelUrl: null, logoUrl: null },
      { id: 'bad-3', name: 'Modelo hostil', denomination: 'x', patronSaint: 'y', latitude: 20.97, longitude: -89.62, modelUrl: 'javascript:alert(1)', logoUrl: null },
    ]))
    await page.route('**/api/public/churches/*/events*', (r) => json(r, [{ id: 'e1', title: evil, description: evil, date: 'no-date', time: '??', location: evil, kind: 1, isCancelled: false }]))
    await page.route('**/api/public/churches/*/announcements', (r) => json(r, [{ id: 'a1', title: evil, body: evil, publishDate: '31/12/2026', expiresOn: null, isImportant: true }]))
    await page.route('**/api/public/churches/*/books', (r) => json(r, []))
    await page.route(new RegExp(`/api/public/churches/${CATHEDRAL}$`), (r) => json(r, { id: CATHEDRAL, name: evil, denomination: 'x', patronSaint: 'y', latitude: 20.96737, longitude: -89.62369, modelUrl: null, logoUrl: null, address: evil, contactPhone: 'javascript:alert(1)', contactEmail: '"><script>x</script>@a.b', schedules: [{ day: 99, time: 'zz', description: evil }] }))

    await page.goto('/')
    await expect(nav(page).getByRole('button')).toHaveCount(4)
    await nav(page).getByRole('button').first().click()
    await expect(page.getByRole('heading', { level: 2 })).toContainText('<img', { timeout: 30_000 })
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0)
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
    expect(problems.filter((p) => !p.startsWith('pageerror: Failed to fetch'))).toEqual([])
  })

  test('an API outage shows an error and keeps the page alive', async ({ page }) => {
    await page.route('**/api/public/churches', (r) => json(r, { title: 'boom' }, 500))
    await page.goto('/')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('an unreachable API shows an error', async ({ page }) => {
    await page.route('**/api/public/churches', (r) => r.abort('connectionrefused'))
    await page.goto('/')
    await expect(page.getByRole('alert')).toContainText('servidor')
  })

  test('an empty list of churches does not crash', async ({ page }) => {
    const problems = watch(page)
    await page.route('**/api/public/churches', (r) => json(r, []))
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(nav(page).getByRole('button')).toHaveCount(0)
    expect(problems).toEqual([])
  })

  test('a section that fails does not hide the others', async ({ page }) => {
    await page.route('**/api/public/churches/*/events*', (r) => json(r, { title: 'boom' }, 500))
    await page.goto('/')
    await pick(page, /Catedral/).click()
    await expect(detail(page, /Catedral/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('alert').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Avisos' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Estante de códices' })).toBeVisible()
  })
})

test.describe('devices', () => {
  test('without WebGL the list still works and the church view explains it', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
        if (/webgl/i.test(type)) return null
        return (original as (...a: unknown[]) => unknown).call(this, type, ...rest) as never
      } as typeof original
    })
    const problems = watch(page)
    await page.goto('/')
    await expect(page.getByText(/mapa no está disponible/i)).toBeVisible()
    await pick(page, /Catedral/).click()
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(detail(page, /Catedral/)).toBeVisible()
    await expect(page.getByText(/vista 3D no está disponible/i)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Próximos eventos' })).toBeVisible()
    expect(problems).toEqual([])
  })

  for (const [name, width, height] of [['phone', 375, 667], ['small phone', 320, 568], ['tablet', 768, 1024], ['laptop', 1366, 768], ['full HD', 1920, 1080], ['QHD', 2560, 1440]] as const) {
    test(`fits a ${name} (${width}x${height}) without horizontal scrolling`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      await expect(nav(page).getByRole('button')).toHaveCount(3)
      await pick(page, /Catedral/).click()
      await page.getByRole('button', { name: 'Entrar' }).click({ timeout: 10_000 }).catch(() => {})
      await expect(detail(page, /Catedral/)).toBeVisible({ timeout: 30_000 })
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow).toBeLessThanOrEqual(1)
      const back = page.getByRole('button', { name: /Volver al mapa/ })
      await expect(back).toBeVisible()
      const box = (await back.boundingBox())!
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1)
      expect(box.x).toBeGreaterThanOrEqual(-1)
    })
  }
})
