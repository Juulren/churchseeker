import { expect, test, type Page } from '@playwright/test'

// Phase 5 tests: staff sign-in and every module of the admin panel against the real API.
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? 'admin@churchseeker.local', password: process.env.E2E_ADMIN_PASSWORD ?? 'Adm1n!Passw0rd#' }
const PASSWORD = 'Sup3r!Passw0rd#xx'
const API = 'http://localhost:5054'

async function login(page: Page, email = ADMIN.email, password = ADMIN.password) {
  await page.goto('/#/login')
  await page.getByLabel('Correo').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Continuar' }).click()
}

const stamp = () => Date.now().toString(36)

async function apiToken(request: Page['request']) {
  const res = await request.post(`${API}/api/auth/login`, { data: ADMIN })
  return ((await res.json()) as { accessToken: string }).accessToken
}

async function createUser(request: Page['request'], role: number, tag: string) {
  const token = await apiToken(request)
  const email = `e2e-${tag}-${stamp()}@churchseeker.local`
  const res = await request.post(`${API}/api/auth/users`, { headers: { Authorization: `Bearer ${token}` }, data: { email, fullName: `E2E ${tag}`, password: PASSWORD, role } })
  expect(res.status()).toBe(201)
  return email
}

test.describe('sign-in', () => {
  test('shows field errors in the label row without moving the form', async ({ page }) => {
    await page.goto('/#/login')
    const button = page.getByRole('button', { name: 'Continuar' })
    const before = (await button.boundingBox())!.y
    await button.click()
    await expect(page.getByText('Escribe tu correo.')).toBeVisible()
    await expect(page.getByText('Escribe tu contraseña.')).toBeVisible()
    expect((await button.boundingBox())!.y).toBe(before)
    await page.getByLabel('Correo').fill('no-es-correo')
    await button.click()
    await expect(page.getByText('Correo no válido.')).toBeVisible()
  })

  test('a wrong password gives one generic error and keeps the user on the page', async ({ page }) => {
    await login(page, ADMIN.email, 'Equivocada1!xx')
    await expect(page.getByText('Correo o contraseña incorrectos.')).toBeVisible()
    await expect(page).toHaveURL(/#\/login/)
    await login(page, 'nadie@churchseeker.local', 'Equivocada1!xx')
    await expect(page.getByText('Correo o contraseña incorrectos.')).toBeVisible()
  })

  test('admin pages need a session and the session survives a reload', async ({ page }) => {
    await page.goto('/#/admin/members')
    await expect(page).toHaveURL(/#\/login/)
    await login(page)
    await expect(page.getByRole('heading', { level: 2, name: 'Panel' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { level: 2, name: 'Panel' })).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/#\/login/)
    await page.goto('/#/admin')
    await expect(page).toHaveURL(/#\/login/)
  })

  test('forgot password always says the same thing', async ({ page }) => {
    await page.goto('/#/login')
    await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click()
    await page.getByLabel('Correo').fill('nadie@churchseeker.local')
    await page.getByRole('button', { name: 'Enviar enlace' }).click()
    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible()
  })

  test('the reset page rejects a bad link and a weak password', async ({ page }) => {
    await page.goto('/#/reset')
    await expect(page.getByText('El enlace no es válido.')).toBeVisible()
    await page.goto('/#/reset?email=a%40b.mx&token=abc')
    await page.locator('#new-password').fill('corta')
    await page.locator('#confirm-password').fill('corta')
    await page.getByRole('button', { name: 'Guardar contraseña' }).click()
    await expect(page.getByText('Mínimo 10 caracteres.')).toBeVisible()
    await page.locator('#new-password').fill('Adm1n!Passw0rd#')
    await page.locator('#confirm-password').fill('Adm1n!Passw0rd#')
    await page.getByRole('button', { name: 'Guardar contraseña' }).click()
    await expect(page.getByText('El enlace ya no es válido. Solicita uno nuevo.')).toBeVisible()
  })

  test('five wrong attempts lock the account even for the right password', async ({ page, request }) => {
    const email = await createUser(request, 3, 'lock')
    for (let i = 0; i < 5; i++) {
      await login(page, email, 'Equivocada1!xx')
      await expect(page.getByText(/incorrectos|Demasiados/)).toBeVisible()
    }
    await login(page, email, PASSWORD)
    await expect(page.getByText(/incorrectos|Demasiados/)).toBeVisible()
    await expect(page).toHaveURL(/#\/login/)
  })
})

test.describe('admin modules', () => {
  test('members: create, search, edit, deactivate and reactivate', async ({ page }) => {
    await login(page)
    await page.getByRole('link', { name: 'Miembros' }).click()
    const name = `Prueba ${stamp()}`
    await page.getByRole('button', { name: 'Nuevo miembro' }).click()
    await page.getByLabel('Nombre completo').fill(name)
    await page.getByLabel('Teléfono').fill('999 123 4567')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.getByLabel('Buscar por nombre').fill(name)
    const row = page.getByRole('row', { name: new RegExp(name) })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Editar' }).click()
    await page.getByLabel('Nombre completo').fill(name + ' II')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.getByLabel('Buscar por nombre').fill(name + ' II')
    const edited = page.getByRole('row', { name: new RegExp(name + ' II') })
    await expect(edited).toBeVisible()
    await edited.getByRole('button', { name: 'Desactivar' }).click()
    await expect(edited).toHaveCount(0)
    await page.getByLabel('Estado').selectOption('false')
    await expect(page.getByRole('row', { name: new RegExp(name + ' II') })).toBeVisible()
  })

  test('members: markup and invalid data are rejected with a readable message', async ({ page }) => {
    await login(page)
    await page.getByRole('link', { name: 'Miembros' }).click()
    await page.getByRole('button', { name: 'Nuevo miembro' }).click()
    await page.getByLabel('Nombre completo').fill('<script>alert(1)</script>')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByRole('dialog').getByRole('alert').filter({ hasText: /invalid|caracteres|FullName/i })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('events: create from the calendar, then cancel and restore', async ({ page }) => {
    await login(page)
    await page.getByRole('link', { name: 'Eventos' }).click()
    const title = `Culto ${stamp()}`
    await page.getByRole('button', { name: 'Nuevo evento' }).click()
    await page.getByLabel('Título').fill(title)
    await page.getByLabel('Lugar').fill('Nave central')
    await page.getByRole('button', { name: 'Guardar' }).click()
    const chip = page.getByRole('button', { name: new RegExp(title) })
    await expect(chip).toBeVisible()
    await chip.click()
    await page.getByRole('button', { name: 'Cancelar evento' }).click()
    await expect(page.getByRole('button', { name: new RegExp(title) })).toHaveAttribute('data-cancelled', 'true')
    await page.getByRole('button', { name: new RegExp(title) }).click()
    await page.getByRole('button', { name: 'Restaurar' }).click()
    await expect(page.getByRole('button', { name: new RegExp(title) })).toHaveAttribute('data-cancelled', 'false')
  })

  test('donations: anonymous entry, exact totals and void', async ({ page }) => {
    await login(page)
    await page.getByRole('link', { name: 'Donaciones' }).click()
    const concept = `Diezmo ${stamp()}`
    await page.getByLabel('Monto (MXN)').fill('0.10')
    await page.getByLabel('Concepto').fill(concept)
    await page.getByRole('button', { name: 'Registrar aportación' }).click()
    await expect(page.getByText('Aportación registrada.')).toBeVisible()
    const row = page.getByRole('row', { name: new RegExp(concept) })
    await expect(row).toContainText('Anónimo')
    await row.getByRole('button', { name: 'Anular' }).click()
    await expect(page.getByRole('row', { name: new RegExp(concept) })).toHaveCount(0)
    // Invalid amounts never reach the server.
    for (const bad of ['0', '-5', '12.345', 'abc']) {
      await page.getByLabel('Monto (MXN)').fill(bad)
      await page.getByLabel('Concepto').fill('x')
      await page.getByRole('button', { name: 'Registrar aportación' }).click()
      await expect(page.getByRole('form', { name: 'Nueva aportación' }).getByRole('alert').last()).toContainText(/monto|decimales/i)
    }
  })

  test('announcements: create and remove', async ({ page }) => {
    await login(page)
    await page.getByRole('link', { name: 'Comunicados' }).click()
    const title = `Aviso ${stamp()}`
    await page.getByRole('button', { name: 'Nuevo comunicado' }).click()
    await page.getByLabel('Título').fill(title)
    await page.getByLabel('Texto (sin formato)').fill('Texto del aviso')
    await page.getByRole('button', { name: 'Guardar' }).click()
    const row = page.getByRole('row', { name: new RegExp(title) })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Eliminar' }).click()
    await expect(page.getByRole('row', { name: new RegExp(title) })).toHaveCount(0)
  })

  test('attendance: mark members present for a past event and see the summary', async ({ page, request }) => {
    const token = await apiToken(request)
    const h = { Authorization: `Bearer ${token}` }
    const name = `Asiste ${stamp()}`
    await request.post(`${API}/api/members`, { headers: h, data: { fullName: name, joinDate: '2024-01-01' } })
    const date = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10)
    const title = `Reunión ${stamp()}`
    await request.post(`${API}/api/events`, { headers: h, data: { title, date, time: '10:00:00', location: 'Salón', kind: 1, isPublic: false } })
    await login(page)
    await page.getByRole('link', { name: 'Asistencia' }).click()
    await page.getByLabel('Evento (últimos 120 días)').selectOption({ label: `${date} · ${title}` })
    await page.getByLabel(`Presente: ${name}`).check()
    await page.getByRole('button', { name: 'Guardar asistencia' }).click()
    await expect(page.getByText(/Asistencia guardada: \d+ presentes/)).toBeVisible()
  })

  test('reports: a PDF and an Excel file download with the right names', async ({ page }) => {
    await login(page)
    await page.getByRole('link', { name: 'Reportes' }).click()
    const pdf = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Descargar' }).first().click()
    expect((await pdf).suggestedFilename()).toMatch(/^reporte-members-\d{8}\.pdf$/)
    await page.getByLabel('Formato').selectOption('Xlsx')
    const xlsx = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Descargar' }).first().click()
    expect((await xlsx).suggestedFilename()).toMatch(/\.xlsx$/)
  })

  test('settings: the profile saves and a codex PDF can be uploaded and rejected when fake', async ({ page }) => {
    await login(page)
    await page.getByRole('link', { name: 'Configuración' }).click()
    await expect(page.getByLabel('Nombre', { exact: true })).not.toHaveValue('')
    await page.getByRole('button', { name: 'Guardar configuración' }).click()
    await expect(page.getByText('Configuración guardada.')).toBeVisible()
    const title = `Códice ${stamp()}`
    await page.getByRole('form', { name: 'Subir códice' }).getByLabel('Título').fill(title)
    await page.locator('input[type=file][accept*="pdf"]').setInputFiles({ name: 'libro.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ\x90\x00 not a pdf at all') })
    await page.getByRole('button', { name: 'Subir códice' }).click()
    await expect(page.locator('form[aria-label="Subir códice"] .notice-error')).toBeVisible()
    await page.locator('input[type=file][accept*="pdf"]').setInputFiles({ name: 'libro.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n') })
    await page.getByRole('button', { name: 'Subir códice' }).click()
    await expect(page.getByText('Códice subido.')).toBeVisible()
  })
})

test.describe('roles', () => {
  const sees = async (page: Page, links: string[], hidden: string[]) => {
    for (const l of links) await expect(page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: l, exact: true })).toBeVisible()
    for (const l of hidden) await expect(page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: l, exact: true })).toHaveCount(0)
  }

  test('a secretary has no finance or settings and the dashboard hides income', async ({ page, request }) => {
    const email = await createUser(request, 3, 'sec')
    await login(page, email, PASSWORD)
    await expect(page.getByRole('heading', { level: 2, name: 'Panel' })).toBeVisible()
    await sees(page, ['Panel', 'Miembros', 'Eventos', 'Asistencia'], ['Donaciones', 'Configuración'])
    await expect(page.getByText('Ingresos')).toHaveCount(0)
    await page.goto('/#/admin/donations')
    await expect(page.getByText('No tienes acceso a este módulo.')).toBeVisible()
    await page.goto('/#/admin/settings')
    await expect(page.getByText('No tienes acceso a este módulo.')).toBeVisible()
  })

  test('a treasurer sees finance and income but not members or settings', async ({ page, request }) => {
    const email = await createUser(request, 4, 'tes')
    await login(page, email, PASSWORD)
    await sees(page, ['Panel', 'Donaciones', 'Reportes'], ['Miembros', 'Configuración', 'Asistencia'])
    await expect(page.getByText('Ingresos', { exact: false }).first()).toBeVisible()
  })

  test('a coordinator only gets the modules of their role', async ({ page, request }) => {
    const email = await createUser(request, 5, 'coo')
    await login(page, email, PASSWORD)
    await sees(page, ['Panel', 'Ministerios', 'Eventos'], ['Miembros', 'Donaciones', 'Reportes', 'Configuración'])
  })
})
