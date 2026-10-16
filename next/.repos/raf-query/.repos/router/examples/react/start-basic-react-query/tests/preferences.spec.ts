import { expect, test } from '@playwright/test'

test('concurrent SSR requests keep the same query key isolated by request', async ({
  request,
}) => {
  const names = ['Lucia', 'Omar', 'Maya', 'Felix']
  const responses = await Promise.all(
    names.map((name) =>
      request.get('/preferences', {
        headers: { Cookie: `reader-name=${name}` },
      }),
    ),
  )
  for (const [index, response] of responses.entries()) {
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toContain('no-store')
    const html = await response.text()
    expect(html).toContain(names[index])
    for (const other of names.filter((_, otherIndex) => otherIndex !== index)) {
      expect(html).not.toContain(other)
    }
  }
})

test('hydration reuses SSR data and mutation invalidation refetches once', async ({
  page,
}) => {
  const reads: string[] = []
  page.on('request', (request) => {
    if (
      request.method() === 'GET' &&
      new URL(request.url()).pathname.startsWith('/_serverFn/')
    ) {
      reads.push(request.url())
    }
  })
  await page.goto('/preferences')
  await expect(page.getByTestId('reader-name')).toHaveText('Hello, Guest')
  await expect(page.getByLabel('Display name')).toBeEnabled()
  await page.waitForLoadState('networkidle')
  expect(reads).toHaveLength(0)

  await page.getByLabel('Display name').fill('Ada')
  const mutation = page.waitForRequest((request) => request.method() === 'POST')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByTestId('reader-name')).toHaveText('Hello, Ada')
  await expect(page.getByRole('button', { name: 'Save name' })).toBeEnabled()
  await page.waitForLoadState('networkidle')
  expect(reads).toHaveLength(1)

  const savedRequest = await mutation
  const headers = await savedRequest.allHeaders()
  delete headers['content-length']
  headers.origin = 'https://untrusted.example'
  headers['sec-fetch-site'] = 'cross-site'
  const denied = await page.request.post(savedRequest.url(), {
    headers,
    data: savedRequest.postData() ?? '',
  })
  expect(denied.status()).toBe(403)

  await page.reload()
  await expect(page.getByTestId('reader-name')).toHaveText('Hello, Ada')
  await expect(page.getByLabel('Display name')).toBeEnabled()
  await page.waitForLoadState('networkidle')
  expect(reads).toHaveLength(1)
})
