import type { APIRequestContext, Playwright } from '@playwright/test'

// Members that a spec creates through the API are deactivated when it ends, so repeated runs never pile up in the dev
// database (the event form lists only the first 100 active members, so a pile-up breaks the specs that pick one).
const API = 'http://localhost:5054'
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? 'admin@churchseeker.local', password: process.env.E2E_ADMIN_PASSWORD ?? 'Adm1n!Passw0rd#' }
const created: string[] = []

export async function trackedMember(request: APIRequestContext, headers: Record<string, string>, fullName: string): Promise<{ id: string }> {
  const res = await request.post(`${API}/api/members`, { headers, data: { fullName, joinDate: '2024-01-01' } })
  const body = (await res.json()) as { id: string }
  created.push(body.id)
  return body
}

/** Call from test.afterAll: deactivates (soft delete) every member this spec created. */
export async function cleanTracked(playwright: Playwright): Promise<void> {
  if (created.length === 0) return
  const ctx = await playwright.request.newContext()
  try {
    const login = await ctx.post(`${API}/api/auth/login`, { data: ADMIN })
    const headers = { Authorization: `Bearer ${((await login.json()) as { accessToken: string }).accessToken}` }
    for (const id of created.splice(0)) await ctx.delete(`${API}/api/members/${id}`, { headers })
  } finally { await ctx.dispose() }
}

/** Picks a member in a searchable member field: types part of the name and chooses the matching option. */
export async function pickMember(page: import('@playwright/test').Page, label: string | RegExp, name: string, exact = false): Promise<void> {
  const field = page.getByLabel(label, { exact })
  await field.click()
  await field.fill(name)
  await page.getByRole('option', { name }).click()
}
