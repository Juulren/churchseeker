import { expect, test, type Page } from '@playwright/test'

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
  test('RF-05: a coordinator can be assigned, and a ministry shows its members and scheduled activities', async ({ page, request }) => {
    const h = await headers(request)
    const coordEmail = `coord-${stamp()}@churchseeker.local`
    const coordName = `Coordinadora ${stamp()}`
    expect((await request.post(`${API}/api/auth/users`, { headers: h, data: { email: coordEmail, fullName: coordName, password: 'Sup3r!Passw0rd#xx', role: 5 } })).status()).toBe(201)
    const member = `Integrante ${stamp()}`
    await request.post(`${API}/api/members`, { headers: h, data: { fullName: member, joinDate: '2024-01-01' } })

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
    await page.getByLabel('Agregar miembro').selectOption({ label: member })
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
    await request.post(`${API}/api/members`, { headers: h, data: { fullName: person, joinDate: '2024-01-01' } })
    await request.post(`${API}/api/ministries`, { headers: h, data: { name: ministry } })

    await login(page)
    await page.getByRole('link', { name: 'Eventos' }).click()
    const title = `Ensayo ${stamp()}`
    await page.getByRole('button', { name: 'Nuevo evento' }).click()
    await page.getByLabel('Título').fill(title)
    await page.getByLabel('Lugar').fill('Salón')
    await page.getByLabel('Responsable').selectOption({ label: person })
    await page.getByLabel('Ministerio').selectOption({ label: ministry })
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible()

    // The assignment survives reopening the event.
    await page.getByRole('button', { name: new RegExp(title) }).click()
    await expect(page.getByLabel('Responsable')).not.toHaveValue('')
    await expect(page.getByLabel('Ministerio')).not.toHaveValue('')
    await page.keyboard.press('Escape')

    await page.getByRole('link', { name: 'Ministerios' }).click()
    await page.getByRole('row', { name: new RegExp(ministry) }).getByRole('button', { name: 'Integrantes' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible()
  })

  test('RF-03: the attendance history of a member lists the events they attended', async ({ page, request }) => {
    const h = await headers(request)
    const name = `Historial ${stamp()}`
    const member = (await (await request.post(`${API}/api/members`, { headers: h, data: { fullName: name, joinDate: '2024-01-01' } })).json()) as { id: string }
    const title = `Culto ${stamp()}`
    const ev = (await (await request.post(`${API}/api/events`, { headers: h, data: { title, date: iso(-2), time: '10:00:00', location: 'Nave', kind: 1, isPublic: false } })).json()) as { id: string }
    await request.put(`${API}/api/events/${ev.id}/attendance`, { headers: h, data: { entries: [{ memberId: member.id, present: true }] } })

    await login(page)
    await page.getByRole('link', { name: 'Asistencia' }).click()
    await page.getByLabel('Miembro', { exact: true }).selectOption({ label: name })
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
    await request.post(`${API}/api/events`, { headers: h, data: { title: event, date: iso(3), time: '18:00:00', location: 'Atrio', kind: 1, isPublic: true } })
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
