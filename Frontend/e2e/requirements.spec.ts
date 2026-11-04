import { expect, test, type Page } from '@playwright/test'
import { cleanTracked, pickMember, trackedMember } from './tracked.ts'

// Checks the requirements that need several screens to work together (RF-03, RF-04, RF-05, RF-07, RF-09).
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? 'admin@churchseeker.local', password: process.env.E2E_ADMIN_PASSWORD ?? 'Adm1n!Passw0rd#' }
const API = 'http://localhost:5054'
const stamp = () => Date.now().toString(36)
const iso = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

async function login(page: Page) {
  await page.goto('/#/login')
  await page.getByLabel('Correo').fill(ADMIN.email)
  await page.getByLabel('Contraseña').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Panel' })).toBeVisible()
}

async function headers(request: Page['request']) {
  const res = await request.post(`${API}/api/auth/login`, { data: ADMIN })
  return { Authorization: `Bearer ${((await res.json()) as { accessToken: string }).accessToken}` }
}

test.describe('requirements across modules', () => {
  test.afterAll(async ({ playwright }) => { await cleanTracked(playwright) })

  test('RF-05: a coordinator can be assigned, and a ministry shows its members and scheduled activities', async ({ page, request }) => {
    const h = await headers(request)
    const coordEmail = `coord-${stamp()}@churchseeker.local`
    const coordName = `Coordinadora ${stamp()}`
    expect((await request.post(`${API}/api/auth/users`, { headers: h, data: { email: coordEmail, fullName: coordName, password: 'Sup3r!Passw0rd#xx', role: 5 } })).status()).toBe(201)
    const member = `Integrante ${stamp()}`
    await trackedMember(request, h, member)

    await login(page)
    await page.getByRole('link', { name: 'Ministerios' }).click()
    const name = `Música ${stamp()}`
    await page.getByRole('button', { name: 'Nuevo ministerio' }).click()
    await page.getByLabel('Nombre').fill(name)
    await page.getByLabel('Coordinador').selectOption({ label: coordName })
    await page.getByRole('button', { name: 'Guardar' }).click()
    const row = page.getByRole('row', { name: new RegExp(name) })
    await expect(row).toBeVisible()

    await row.getByRole('button', { name: 'Integrantes' }).click()
    await pickMember(page, 'Agregar miembro', member)
    await page.getByRole('button', { name: 'Agregar', exact: true }).click()
    await expect(page.getByRole('listitem').filter({ hasText: member })).toBeVisible()
    await expect(page.getByText('Sin actividades.')).toBeVisible()

    // Reopen the form: the coordinator stays assigned.
    await row.getByRole('button', { name: 'Editar' }).click()
    await expect(page.getByLabel('Coordinador')).toHaveValue(/[0-9a-f-]{36}/)
    await page.keyboard.press('Escape')
  })

  test('RF-04 and RF-05: an event gets a responsible member and a ministry, and the ministry lists it', async ({ page, request }) => {
    const h = await headers(request)
    const person = `Responsable ${stamp()}`
    const ministry = `Jóvenes ${stamp()}`
    await trackedMember(request, h, person)
    await request.post(`${API}/api/ministries`, { headers: h, data: { name: ministry } })

    await login(page)
    await page.getByRole('link', { name: 'Eventos' }).click()
    const title = `Ensayo ${stamp()}`
    await page.getByRole('button', { name: 'Nuevo evento' }).click()
    await page.getByLabel('Título').fill(title)
    await page.getByLabel('Lugar').fill('Salón')
    await pickMember(page, 'Responsable', person)
    await page.getByLabel('Ministerio').selectOption({ label: ministry })
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible()

    // The assignment survives reopening the event.
    await page.getByRole('button', { name: new RegExp(title) }).click()
    await expect(page.getByLabel('Responsable')).toHaveValue(person)
    await expect(page.getByLabel('Ministerio')).not.toHaveValue('')
    await page.keyboard.press('Escape')

    await page.getByRole('link', { name: 'Ministerios' }).click()
    await page.getByRole('row', { name: new RegExp(ministry) }).getByRole('button', { name: 'Integrantes' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible()
  })

  test('RF-03: the attendance history of a member lists the events they attended', async ({ page, request }) => {
    const h = await headers(request)
    const name = `Historial ${stamp()}`
    const member = await trackedMember(request, h, name)
    const title = `Culto ${stamp()}`
    const ev = (await (await request.post(`${API}/api/events`, { headers: h, data: { title, date: iso(-2), time: '10:00:00', location: 'Nave', kind: 1, isPublic: false } })).json()) as { id: string }
    await request.put(`${API}/api/events/${ev.id}/attendance`, { headers: h, data: { entries: [{ memberId: member.id, present: true }] } })

    await login(page)
    await page.getByRole('link', { name: 'Asistencia' }).click()
    await pickMember(page, 'Miembro', name, true)
    const row = page.getByRole('row', { name: new RegExp(title) })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Presente')
  })

  test('RF-09: the attendance report can be limited to one event', async ({ page, request }) => {
    const h = await headers(request)
    const title = `Reporte ${stamp()}`
    await request.post(`${API}/api/events`, { headers: h, data: { title, date: iso(-1), time: '09:00:00', location: 'Nave', kind: 1, isPublic: false } })
    await login(page)
    await page.getByRole('link', { name: 'Reportes' }).click()
    await page.getByLabel('Formato').selectOption('Xlsx')
    await page.getByLabel('Asistencia: un solo evento').selectOption({ label: `${iso(-1)} · ${title}` })
    const card = page.locator('.kpi').filter({ hasText: 'Asistencia por evento' })
    const download = page.waitForEvent('download')
    await card.getByRole('button', { name: 'Descargar' }).click()
    expect((await download).suggestedFilename()).toMatch(/^reporte-attendance-\d{8}\.xlsx$/)
  })

  test('RF-07 and RF-08: the dashboard shows upcoming events and important notices', async ({ page, request }) => {
    const h = await headers(request)
    const event = `Próximo ${stamp()}`
    const notice = `Aviso clave ${stamp()}`
    // The dashboard lists only the six earliest events, and the dev database keeps what earlier runs created.
    // Cancel this test's own leftovers and schedule the new event first thing today so it always makes the list.
    const old = (await (await request.get(`${API}/api/events?from=${iso(0)}&to=${iso(30)}&pageSize=100`, { headers: h })).json()) as { items: { id: string; title: string }[] }
    for (const e of old.items.filter((x) => x.title.startsWith('Próximo '))) await request.post(`${API}/api/events/${e.id}/cancel`, { headers: h })
    await request.post(`${API}/api/events`, { headers: h, data: { title: event, date: iso(0), time: '00:00:00', location: 'Atrio', kind: 1, isPublic: true } })
    // The dashboard lists only the first five important notices, so remove this test's own leftovers from earlier runs.
    const oldNotices = (await (await request.get(`${API}/api/announcements?pageSize=100`, { headers: h })).json()) as { items: { id: string; title: string }[] }
    for (const n of oldNotices.items.filter((x) => x.title.startsWith('Aviso clave '))) await request.delete(`${API}/api/announcements/${n.id}`, { headers: h })
    await request.post(`${API}/api/announcements`, { headers: h, data: { title: notice, body: 'Texto', publishDate: iso(-1), isImportant: true, isPublic: true } })
    await login(page)
    await expect(page.getByRole('region', { name: 'Próximos eventos' })).toContainText(event)
    await expect(page.getByRole('region', { name: 'Avisos importantes' })).toContainText(notice)
    await expect(page.getByText('Miembros activos')).toBeVisible()
    await expect(page.getByText('Eventos próximos (30 días)')).toBeVisible()
    await expect(page.getByText('Asistencias del mes')).toBeVisible()
    await expect(page.getByText('Ministerios activos')).toBeVisible()
  })
})

test('the member field searches the whole list, not just the first 100', async ({ page, request }) => {
  test.setTimeout(240_000)
  const h = await headers(request)
  // More than a page of members, with the one we look for last in alphabetical order.
  const tag = stamp()
  for (let i = 0; i < 105; i++) await trackedMember(request, h, `Relleno ${tag} ${String(i).padStart(3, '0')}`)
  const target = await trackedMember(request, h, `Zzz Buscado ${tag}`)
  void target

  await login(page)
  await page.getByRole('link', { name: 'Eventos' }).click()
  await page.getByRole('button', { name: 'Nuevo evento' }).click()
  const field = page.getByLabel('Responsable')
  await field.click()
  // The list never shows more than a dozen options, however many members there are.
  const options = page.getByRole('listbox').getByRole('option')
  await expect(options.first()).toBeVisible()
  expect(await options.count()).toBeLessThanOrEqual(13)
  await field.fill(`Buscado ${tag}`)
  await expect(options.filter({ hasText: `Zzz Buscado ${tag}` })).toBeVisible()
  // Arrow keys and Enter choose; the first Escape closes the list, not the dialog.
  await field.press('ArrowDown')
  await field.press('Enter')
  await expect(field).toHaveValue(`Zzz Buscado ${tag}`)
  await field.click()
  await field.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Nuevo evento' })).toBeVisible()
  // A search with no match says so.
  await field.fill('zzzz-nadie-' + tag)
  await expect(page.getByText('Nadie coincide con esa búsqueda.')).toBeVisible()
})
