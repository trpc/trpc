import { expect, test } from '@playwright/test'

test('public URLs, server metadata, search, redirects, and missing pages survive migration', async ({
  page,
  request,
}) => {
  const response = await request.get('/posts/keeping-your-urls')
  expect(response.status()).toBe(200)
  const html = await response.text()
  expect(html).toContain('<title>Keeping your URLs</title>')
  expect(html).toMatch(
    /<meta[^>]+name="description"[^>]+content="Preserve public URLs when changing frameworks\."/,
  )
  expect(html).toMatch(
    /<link[^>]+rel="canonical"[^>]+href="https:\/\/field-notes\.example\/posts\/keeping-your-urls"/,
  )
  expect(html).toMatch(
    /<meta[^>]+property="og:title"[^>]+content="Keeping your URLs"/,
  )
  expect(html).toContain(
    'A framework migration can keep the URLs your readers already use.',
  )

  const old = await request.get('/old-notes', { maxRedirects: 0 })
  expect(old.status()).toBe(308)
  expect(new URL(old.headers().location, old.url()).pathname).toBe(
    '/posts/keeping-your-urls',
  )
  expect((await request.get('/posts/missing')).status()).toBe(404)
  const sitemap = await (await request.get('/sitemap.xml')).text()
  expect(sitemap).toContain(
    '<loc>https://field-notes.example/posts/keeping-your-urls</loc>',
  )
  expect(sitemap).not.toContain('/saved')

  await page.goto('/?q=metadata')
  await expect(
    page.getByRole('link', { name: 'Checking your metadata' }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Keeping your URLs' }),
  ).toHaveCount(0)
  await page.getByRole('link', { name: 'Checking your metadata' }).click()
  await expect(page).toHaveURL(/\/posts\/checking-your-metadata$/)
  await expect(page).toHaveTitle('Checking your metadata')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://field-notes.example/posts/checking-your-metadata',
  )
})

test('sessions and protected mutations survive reload but cannot run after sign-out', async ({
  page,
}, testInfo) => {
  await page.goto('/saved')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Email', { exact: true }).fill('reader@example.com')
  await page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'Invalid credentials',
  )
  await page.getByLabel('Email', { exact: true }).fill('reader@example.com')
  await page
    .getByLabel('Password', { exact: true })
    .fill('migration-test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/saved$/)
  await expect(page.getByTestId('saved-state')).toHaveText('No saved articles')
  const mutation = page.waitForRequest((request) => request.method() === 'POST')
  await page.getByRole('button', { name: 'Save article', exact: true }).click()
  const savedRequest = await mutation
  await expect(page.getByTestId('saved-state')).toHaveText(
    'Keeping your URLs is saved',
  )
  // Keep the authenticated cookie jar while replaying a cross-site request.
  const crossSiteHeaders = await savedRequest.allHeaders()
  delete crossSiteHeaders.cookie
  delete crossSiteHeaders['content-length']
  crossSiteHeaders.origin = 'https://untrusted.example'
  crossSiteHeaders['sec-fetch-site'] = 'cross-site'
  const crossSite = await page.request.post(savedRequest.url(), {
    headers: crossSiteHeaders,
    data: savedRequest.postData() ?? '',
  })
  if (testInfo.project.name === 'start') {
    expect(crossSite.status()).toBe(403)
  } else {
    expect(crossSite.status()).toBeGreaterThanOrEqual(400)
  }

  const response = await page.reload()
  expect(response?.headers()['cache-control']).toMatch(
    process.env.MIGRATION_PRODUCTION ? /no-store/ : /no-store|no-cache/,
  )
  await expect(page.getByTestId('saved-state')).toHaveText(
    'Keeping your URLs is saved',
  )
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)

  // Replay the real mutation with the now-signed-out browser cookie jar.
  const headers = await savedRequest.allHeaders()
  delete headers.cookie
  delete headers['content-length']
  const denied = await page.request.post(savedRequest.url(), {
    headers,
    data: savedRequest.postData() ?? '',
  })
  expect(denied.status()).toBeGreaterThanOrEqual(400)
  await page.goto('/saved')
  await expect(page).toHaveURL(/\/login$/)
})

test('Start serializes saving and signing out so their responses cannot arrive out of order', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'start', 'Start event-handler regression')
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('reader@example.com')
  await page
    .getByLabel('Password', { exact: true })
    .fill('migration-test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/saved$/)

  for (const action of ['Save article', 'Sign out']) {
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/_serverFn/**', async (route) => {
      if (route.request().method() === 'POST') {
        await held
      }
      await route.continue()
    })
    await page.getByRole('button', { name: action, exact: true }).click()
    try {
      await expect(
        page.getByRole('button', { name: /^(Save|Remove) article$/ }),
      ).toBeDisabled()
      await expect(
        page.getByRole('button', { name: 'Sign out', exact: true }),
      ).toBeDisabled()
    } finally {
      release()
    }
    if (action === 'Save article') {
      await expect(page.getByTestId('saved-state')).toHaveText(
        'Keeping your URLs is saved',
      )
      await expect(
        page.getByRole('button', { name: 'Sign out', exact: true }),
      ).toBeEnabled()
    } else {
      await expect(page).toHaveURL(/\/login$/)
    }
    await page.unrouteAll({ behavior: 'wait' })
  }
  await page.goto('/saved')
  await expect(page).toHaveURL(/\/login$/)
})
