import { expect, test, type Page } from '@playwright/test'

// Switching module in the admin area: where the kit can draw, one wave of characters carries the old module out and the new
// one in; where it cannot (no GL, reduced motion) the module just changes. Either way there is never more than one module
// mounted, and the last click wins.
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? 'admin@churchseeker.local', password: process.env.E2E_ADMIN_PASSWORD ?? 'Adm1n!Passw0rd#' }

// The menu links scramble their letters under the pointer, so they are found by address, not by name.
const HREF: Record<string, string> = { Panel: 'dashboard', Miembros: 'members', Eventos: 'events', Usuarios: 'users' }
const menu = (page: Page, name: string) => page.locator('nav[aria-label="Módulos"] a[href="#/admin/' + HREF[name] + '"]')

test('changing module shows one module at a time and leaves no canvas behind', async ({ page }) => {
  await page.goto('/#/login')
  await page.getByLabel('Correo').fill(ADMIN.email)
  await page.getByLabel('Contraseña').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Panel' })).toBeVisible()

  for (const name of ['Miembros', 'Eventos', 'Usuarios', 'Panel']) {
    await menu(page, name).click()
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
    // Exactly one module heading in the main area, never the old and the new together.
    await expect(page.locator('main h2')).toHaveCount(1)
    await expect(menu(page, name)).toHaveAttribute('aria-current', 'page')
  }
  // Settled: the transition is over and nothing in the main area was left hidden.
  await expect(page.locator('main')).not.toHaveAttribute('data-state', /.+/, { timeout: 5000 })
  const hidden = await page.locator('main > *').evaluateAll((els) => els.filter((e) => !(e instanceof HTMLCanvasElement) && getComputedStyle(e).opacity !== '1').length)
  expect(hidden).toBe(0)
  // The transition removes its canvas when it ends (the page keeps well under the context budget).
  await expect.poll(() => page.locator('main canvas').count(), { timeout: 5000 }).toBeLessThanOrEqual(1)
  await expect.poll(() => page.locator('canvas').count(), { timeout: 5000 }).toBeLessThanOrEqual(3)

  // Clicking several modules quickly ends on the last one.
  await menu(page, 'Miembros').click()
  await menu(page, 'Eventos').click()
  await menu(page, 'Usuarios').click()
  await expect(page.getByRole('heading', { level: 2, name: 'Usuarios' })).toBeVisible()
  await expect(page.locator('main h2')).toHaveCount(1)
  await expect(menu(page, 'Usuarios')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { level: 2, name: 'Eventos' })).toHaveCount(0)
})

test('with the server down the public page says so, keeps the staff link and offers to try again', async ({ page }) => {
  let down = true
  await page.route('**/api/public/churches', (route) => (down ? route.fulfill({ status: 502, body: 'Bad Gateway' }) : route.continue()))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'No pudimos cargar las iglesias' })).toBeVisible()
  await expect(page.getByText('Error 502')).toHaveCount(0)
  down = false
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(page.getByRole('navigation', { name: 'Iglesias de Mérida' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'No pudimos cargar las iglesias' })).toHaveCount(0)
})
