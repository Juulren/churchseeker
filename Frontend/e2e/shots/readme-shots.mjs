// Generates the screenshots of the README (docs/screenshots). Not part of the test suite.
//
//   1. Start the API on an EMPTY database, so only the demonstration data shows:
//        dotnet run --project Backend/src/ChurchSeeker.WebAPI --launch-profile http -- \
//          --ConnectionStrings:Default="Data Source=shots.db" --RateLimiting:Auth=1000
//   2. Start the frontend:  cd Frontend && npm run dev
//   3. Run:                 node e2e/shots/readme-shots.mjs
//
// The satellite imagery is replaced by a plain tile, so no third-party imagery ends up in the repository.
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { chromium } from '@playwright/test'

const BASE = process.env.SHOTS_BASE ?? 'http://localhost:5173'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'screenshots')
mkdirSync(OUT, { recursive: true })

const ACCOUNTS = {
  super: ['superadmin@churchseeker.local', 'Super!Plataforma2026#'],
  catedral: ['admin@churchseeker.local', 'Adm1n!Passw0rd#'],
  jesus: ['admin.jesus@churchseeker.local', 'Adm1n!Jesus2026#'],
  usuario: ['usuario@churchseeker.local', 'Usu4rio!Normal2026#'],
}
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })

async function context(width = 1280, height = 800) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'es-MX' })
  await ctx.route('https://server.arcgisonline.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: TILE }))
  return ctx
}

async function signIn(page, [email, password]) {
  await page.goto(`${BASE}/#/login`)
  await page.getByLabel('Correo').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Continuar' }).click()
}

const shot = async (page, name, wait = 2500) => {
  await page.waitForTimeout(wait)
  await page.screenshot({ path: join(OUT, name + '.png') })
  console.log('ok', name)
}

// --- Public ---------------------------------------------------------------------------------------------------------------
// A larger window for the map, so the markers of churches that are close together do not overlap.
{
  const ctx = await context(1700, 1050)
  const page = await ctx.newPage()
  await page.goto(BASE + '/')
  await page.locator('.church-marker').first().waitFor({ timeout: 60_000 })
  await shot(page, '01-mapa-publico', 4000)
  await page.getByRole('navigation', { name: 'Iglesias de Mérida' }).getByRole('button', { name: /Jesús/ }).click()
  await page.getByRole('button', { name: 'Entrar' }).click({ timeout: 45_000 })
  await page.getByRole('heading', { level: 3, name: 'Historia' }).waitFor({ timeout: 45_000 })
  await shot(page, '02-pagina-iglesia', 3500)
  await ctx.close()
}

// --- Sign-in --------------------------------------------------------------------------------------------------------------
{
  const ctx = await context()
  const page = await ctx.newPage()
  await page.goto(`${BASE}/#/login`)
  await shot(page, '03-inicio-de-sesion', 3500)
  await ctx.close()
}

// --- A church administrator -----------------------------------------------------------------------------------------------
{
  const ctx = await context()
  const page = await ctx.newPage()
  await signIn(page, ACCOUNTS.catedral)
  await page.getByRole('heading', { level: 2, name: 'Panel' }).waitFor()
  await shot(page, '04-admin-panel', 3500)
  await page.getByRole('link', { name: 'Usuarios', exact: true }).click()
  await page.getByRole('heading', { level: 2, name: 'Usuarios' }).waitFor()
  await shot(page, '05-admin-usuarios', 3000)
  await page.getByRole('link', { name: 'Configuración' }).click()
  await page.getByLabel('Historia de la iglesia').waitFor()
  await page.getByLabel('Historia de la iglesia').scrollIntoViewIfNeeded()
  await shot(page, '06-admin-historia', 2500)
  await ctx.close()
}

// --- An administrator of two churches -------------------------------------------------------------------------------------
{
  const ctx = await context()
  const page = await ctx.newPage()
  await signIn(page, ACCOUNTS.jesus)
  await page.getByRole('heading', { level: 2, name: 'Panel' }).waitFor()
  await page.getByRole('combobox', { name: 'Iglesia activa' }).selectOption({ label: 'Iglesia de Santa Lucía' })
  await page.getByRole('heading', { level: 2, name: 'Panel' }).waitFor()
  await shot(page, '07-admin-varias-iglesias', 4000)
  await ctx.close()
}

// --- The platform account -------------------------------------------------------------------------------------------------
{
  const ctx = await context()
  const page = await ctx.newPage()
  await signIn(page, ACCOUNTS.super)
  await page.getByRole('link', { name: 'Panorama general' }).waitFor()
  await page.getByRole('link', { name: 'Panorama general' }).click()
  await page.getByRole('table', { name: 'Resumen por iglesia' }).waitFor()
  await shot(page, '08-super-panorama-general', 3500)
  await page.getByRole('link', { name: 'Accesos', exact: true }).click()
  await page.getByRole('heading', { level: 2, name: 'Accesos' }).waitFor()
  await page.getByRole('row').filter({ hasText: 'admin.jesus@churchseeker.local' }).waitFor()
  await shot(page, '09-super-accesos', 3000)
  await ctx.close()
}

// --- A plain account ------------------------------------------------------------------------------------------------------
{
  const ctx = await context()
  const page = await ctx.newPage()
  await signIn(page, ACCOUNTS.usuario)
  await page.getByRole('heading', { level: 2, name: 'Tu cuenta' }).waitFor()
  await shot(page, '10-usuario-sin-permisos', 3000)
  await ctx.close()
}

await browser.close()
