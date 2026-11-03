import { expect, test, type Page } from '@playwright/test'

// User administration: list, change role, deactivate, and the effect on the affected account.
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? 'admin@churchseeker.local', password: process.env.E2E_ADMIN_PASSWORD ?? 'Adm1n!Passw0rd#' }
const API = 'http://localhost:5054'
const PASSWORD = 'Sup3r!Passw0rd#xx'
const stamp = () => Date.now().toString(36)

async function login(page: Page, email: string, password: string) {
  await page.goto('/#/login')
  await page.getByLabel('Correo').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Panel' })).toBeVisible()
}

async function createUser(request: Page['request'], role: number, fullName: string) {
  const token = ((await (await request.post(API + '/api/auth/login', { data: ADMIN })).json()) as { accessToken: string }).accessToken
  const email = 'u-' + stamp() + '-' + Math.random().toString(36).slice(2, 6) + '@churchseeker.local'
  expect((await request.post(API + '/api/auth/users', { headers: { Authorization: 'Bearer ' + token }, data: { email, fullName, password: PASSWORD, role } })).status()).toBe(201)
  return email
}

test.describe('user administration', () => {
  test('the admin changes a role and deactivates a user; the user loses access at once', async ({ page, browser, request }) => {
    const name = 'Persona ' + stamp()
    const email = await createUser(request, 3, name)

    // The victim is signed in on another context.
    const other = await browser.newContext()
    const victim = await other.newPage()
    await login(victim, email, PASSWORD)
    await expect(victim.getByRole('link', { name: 'Miembros' })).toBeVisible()

    await login(page, ADMIN.email, ADMIN.password)
    await page.getByRole('link', { name: 'Usuarios' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Usuarios' })).toBeVisible()
    const row = page.getByRole('row', { name: new RegExp(name) })
    await expect(row).toBeVisible()

    await row.getByLabel('Rol de ' + name).selectOption({ label: 'Tesorero' })
    await expect(page.getByText('cambiado a Tesorero')).toBeVisible()

    // Their session is revoked with the role change: they must sign in again and then get the new role.
    await victim.reload()
    await expect(victim).toHaveURL(/#\/login/)
    await login(victim, email, PASSWORD)
    await expect(victim.getByRole('link', { name: 'Donaciones' })).toBeVisible()
    await expect(victim.getByRole('link', { name: 'Miembros' })).toHaveCount(0)

    await row.getByRole('button', { name: 'Desactivar' }).click()
    await expect(row.getByText('Desactivado')).toBeVisible()
    await victim.reload()
    await expect(victim).toHaveURL(/#\/login/)

    await row.getByRole('button', { name: 'Activar' }).click()
    await expect(row.getByText('Activo')).toBeVisible()
    await other.close()
  })

  test('own row is protected and the permissions matrix is shown', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password)
    await page.getByRole('link', { name: 'Usuarios' }).click()
    const self = page.getByRole('row', { name: /\(tú\)/ })
    await expect(self.getByRole('combobox')).toBeDisabled()
    await expect(self.getByRole('button', { name: 'Desactivar' })).toBeDisabled()
    await expect(page.getByRole('heading', { name: 'Roles y permisos' })).toBeVisible()
    await expect(page.getByRole('row', { name: /Donaciones/ })).toBeVisible()
  })

  test('a secretary cannot open the users module', async ({ page, request }) => {
    const email = await createUser(request, 3, 'Sec ' + stamp())
    await login(page, email, PASSWORD)
    await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0)
    await page.goto('/#/admin/users')
    await expect(page.getByText('No tienes acceso a este módulo.')).toBeVisible()
  })
})
