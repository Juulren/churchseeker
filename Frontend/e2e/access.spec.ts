import { expect, test, type Page } from '@playwright/test'

// Who works in which church: the demonstration accounts of the README (a development database only).
const ACCOUNTS = {
  super: { email: 'superadmin@churchseeker.local', password: 'Super!Plataforma2026#' },
  cathedral: { email: 'admin@churchseeker.local', password: 'Adm1n!Passw0rd#' },
  jesus: { email: 'admin.jesus@churchseeker.local', password: 'Adm1n!Jesus2026#' },
  usuario: { email: 'usuario@churchseeker.local', password: 'Usu4rio!Normal2026#' },
}

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto('/#/login')
  await page.getByLabel('Correo').fill(who.email)
  await page.getByLabel('Contraseña').fill(who.password)
  await page.getByRole('button', { name: 'Continuar' }).click()
}

const menu = (page: Page) => page.getByRole('navigation', { name: 'Módulos' })

test.describe('church access', () => {
  test('an administrator of one church sees only that church, with no switcher and no platform modules', async ({ page }) => {
    await signIn(page, ACCOUNTS.cathedral)
    await expect(page.getByRole('heading', { level: 2, name: 'Panel' })).toBeVisible()
    await expect(page.getByText('Catedral de San Ildefonso').first()).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Iglesia activa' })).toHaveCount(0)
    await expect(menu(page).locator('a[href="#/admin/platform"]')).toHaveCount(0)
    await expect(menu(page).locator('a[href="#/admin/access"]')).toHaveCount(0)
    // The platform area is closed even by typing the address.
    await page.goto('/#/admin/platform')
    await expect(page.getByText('No tienes acceso a este módulo.')).toBeVisible()
  })

  test('an administrator of two churches switches between them, and every module follows the active one', async ({ page }) => {
    await signIn(page, ACCOUNTS.jesus)
    await expect(page.getByRole('heading', { level: 2, name: 'Panel' })).toBeVisible()
    const switcher = page.getByRole('combobox', { name: 'Iglesia activa' })
    await expect(switcher.locator('option')).toHaveCount(2)
    await expect(switcher).toContainText('Iglesia de Santa Lucía')
    await expect(switcher).toContainText('Iglesia de Jesús')
    // Settings shows the church they are working in.
    await menu(page).locator('a[href="#/admin/settings"]').click()
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(/Jesús/)
    await switcher.selectOption({ label: 'Iglesia de Santa Lucía' })
    await expect(page.getByRole('heading', { level: 2, name: 'Panel' })).toBeVisible()
    await menu(page).locator('a[href="#/admin/settings"]').click()
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(/Santa Lucía/)
    // Still signed in to the same church after a reload (the refresh remembers it).
    await page.reload()
    await expect(page.getByRole('combobox', { name: 'Iglesia activa' }).locator('option:checked')).toHaveText(/Santa Lucía/)
    await menu(page).locator('a[href="#/admin/settings"]').click()
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(/Santa Lucía/)
  })

  test('the platform account sees the general dashboard, can enter any church and manages who works where', async ({ page }) => {
    await signIn(page, ACCOUNTS.super)
    await expect(menu(page).locator('a[href="#/admin/platform"]')).toBeVisible()
    await menu(page).locator('a[href="#/admin/platform"]').click()
    await expect(page.getByRole('heading', { level: 2, name: 'Panorama general' })).toBeVisible()
    const rows = page.getByRole('table', { name: 'Resumen por iglesia' }).locator('tbody tr')
    await expect(rows.filter({ hasText: 'Iglesia de Santa Lucía' })).toHaveCount(1)
    await expect(rows.filter({ hasText: 'Catedral de San Ildefonso' })).toHaveCount(1)
    // Into one church's own dashboard.
    await page.getByRole('button', { name: 'Entrar en Iglesia de Santa Lucía' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Panel' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Iglesia activa' }).locator('option:checked')).toHaveText(/Santa Lucía/)
    // Who works where.
    await menu(page).locator('a[href="#/admin/access"]').click()
    await expect(page.getByRole('heading', { level: 2, name: 'Accesos' })).toBeVisible()
    const row = page.getByRole('row').filter({ hasText: 'admin.jesus@churchseeker.local' })
    await expect(row).toContainText('Iglesia de Jesús')
    await expect(row).toContainText('Iglesia de Santa Lucía')
    await row.getByRole('button', { name: /^Iglesias de/ }).click()
    await expect(page.getByRole('dialog')).toContainText('varias iglesias')
    await page.keyboard.press('Escape')
  })

  test('a plain account signs in and sees no administration at all', async ({ page }) => {
    await signIn(page, ACCOUNTS.usuario)
    await expect(page.getByRole('heading', { level: 2, name: 'Tu cuenta' })).toBeVisible()
    await expect(menu(page).getByRole('link')).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: 'Iglesia activa' })).toHaveCount(0)
    // Typing a module address shows the same page, and no staff data was ever requested.
    const staffCalls: string[] = []
    page.on('request', (r) => { if (/\/api\/(members|events|dashboard|staff|platform|church)\b/.test(r.url()) && !r.url().includes('/public/')) staffCalls.push(r.url()) })
    await page.goto('/#/admin/members')
    await expect(page.getByRole('heading', { level: 2, name: 'Tu cuenta' })).toBeVisible()
    await page.waitForTimeout(800)
    expect(staffCalls).toEqual([])
  })
})
