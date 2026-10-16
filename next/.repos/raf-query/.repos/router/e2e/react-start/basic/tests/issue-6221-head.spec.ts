import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { isPreview } from './utils/isPreview'
import { isSpaMode } from './utils/isSpaMode'

// Ported to React from the regression app in
// https://github.com/TanStack/router/pull/6222
test.skip(
  isSpaMode || isPreview,
  'head() coverage for an ssr:false route requires the SSR test mode',
)

test('browser back uses fresh loaderData for both the body and head (#6221)', async ({
  page,
}) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('issue-6221-auth', 'good'))

  await page.goto('/issue-6221/article/1')

  await expect(page.getByTestId('issue-6221-article')).toHaveText(
    'Article content for 1',
  )
  await expect(page).toHaveTitle('Article Title for 1')

  await page.evaluate(() => localStorage.removeItem('issue-6221-auth'))
  await page.reload()
  await expect(page.getByText('Article Not Accessible.')).toBeVisible()
  await expect(page).toHaveTitle('title n/a')

  await page.evaluate(() => localStorage.setItem('issue-6221-auth', 'good'))
  await page.getByTestId('issue-6221-dashboard-link').click()
  await expect(page.getByTestId('issue-6221-dashboard')).toBeVisible()
  await expect(page).toHaveTitle('Dashboard')

  await page.goBack()
  await expect(page.getByTestId('issue-6221-article')).toHaveText(
    'Article content for 1',
  )
  await expect(page).toHaveTitle('Article Title for 1')
})
