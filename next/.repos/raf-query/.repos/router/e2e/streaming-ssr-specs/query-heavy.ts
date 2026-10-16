import {
  expect,
  expectQueryHeavyRouteStreamOrder,
  test,
  testWithHydration,
} from '../streaming-ssr-assertions'

test.describe('Query heavy route (9 queries)', () => {
  test('emits the complete router stream before document closes', async ({
    baseURL,
  }) => {
    await expectQueryHeavyRouteStreamOrder(baseURL)
  })

  test('all queries resolve with server data', async ({ page }) => {
    await page.goto('/query-heavy')

    // Sync queries should show server source
    await expect(page.getByTestId('sync-query-1')).toContainText(
      'source: server',
      { timeout: 5000 },
    )
    await expect(page.getByTestId('sync-query-2')).toContainText(
      'source: server',
      { timeout: 5000 },
    )
    await expect(page.getByTestId('sync-query-3')).toContainText(
      'source: server',
      { timeout: 5000 },
    )

    // Fast async queries should show server source
    await expect(page.getByTestId('fast-async-query-1')).toContainText(
      'source: server',
      { timeout: 5000 },
    )
    await expect(page.getByTestId('fast-async-query-2')).toContainText(
      'source: server',
      { timeout: 5000 },
    )
    await expect(page.getByTestId('fast-async-query-3')).toContainText(
      'source: server',
      { timeout: 5000 },
    )

    // Slow async queries should show server source
    await expect(page.getByTestId('slow-async-query-1')).toContainText(
      'source: server',
      { timeout: 5000 },
    )
    await expect(page.getByTestId('slow-async-query-2')).toContainText(
      'source: server',
      { timeout: 5000 },
    )
    await expect(page.getByTestId('slow-async-query-3')).toContainText(
      'source: server',
      { timeout: 5000 },
    )
  })

  test('sync queries have correct values', async ({ page }) => {
    await page.goto('/query-heavy')

    await expect(page.getByTestId('sync-query-1')).toContainText('sync-value-1')
    await expect(page.getByTestId('sync-query-2')).toContainText('sync-value-2')
    await expect(page.getByTestId('sync-query-3')).toContainText('sync-value-3')
  })

  test('async queries have correct values', async ({ page }) => {
    await page.goto('/query-heavy')

    await expect(page.getByTestId('fast-async-query-1')).toContainText(
      'fast-async-1',
      { timeout: 5000 },
    )
    await expect(page.getByTestId('fast-async-query-2')).toContainText(
      'fast-async-2',
      { timeout: 5000 },
    )
    await expect(page.getByTestId('fast-async-query-3')).toContainText(
      'fast-async-3',
      { timeout: 5000 },
    )

    await expect(page.getByTestId('slow-async-query-1')).toContainText(
      'slow-async-1',
      { timeout: 5000 },
    )
    await expect(page.getByTestId('slow-async-query-2')).toContainText(
      'slow-async-2',
      { timeout: 5000 },
    )
    await expect(page.getByTestId('slow-async-query-3')).toContainText(
      'slow-async-3',
      { timeout: 5000 },
    )
  })

  testWithHydration('hydration works with many queries', async ({ page }) => {
    await page.goto('/query-heavy')
    await page.waitForLoadState('networkidle')

    // Wait for all queries to resolve
    await expect(page.getByTestId('slow-async-query-3')).toBeVisible({
      timeout: 5000,
    })
  })

  test('client-side navigation works', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Navigate via nav link
    await page.getByRole('link', { name: 'Query Heavy' }).click()
    await expect(page).toHaveURL('/query-heavy')

    // All queries should eventually resolve (on client)
    await expect(page.getByTestId('slow-async-query-3')).toBeVisible({
      timeout: 5000,
    })
  })

  test('server query data hydrates without client refetch', async ({
    page,
  }) => {
    // If hydration missed the server data, these queries would re-execute on
    // the client and show "client" as their source.
    await page.goto('/query-heavy')

    // Wait for all queries
    await expect(page.getByTestId('slow-async-query-3')).toBeVisible({
      timeout: 5000,
    })

    // Verify that all server results hydrated without a client refetch.
    const serverSourceCount = await page
      .locator('[data-testid*="query-"]')
      .filter({ hasText: 'source: server' })
      .count()
    expect(serverSourceCount).toBe(9)
  })
})
