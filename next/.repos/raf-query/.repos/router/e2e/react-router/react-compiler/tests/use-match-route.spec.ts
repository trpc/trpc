import { expect, test } from '@playwright/test'

test('useMatchRoute updates after navigation with React Compiler', async ({
  page,
}) => {
  await page.goto('/home')
  await expect(page.getByTestId('matched-route')).toHaveText('Home')

  await page.getByRole('link', { name: 'About' }).click()
  await expect(page).toHaveURL(/\/about$/)
  await expect(page.getByTestId('matched-route')).toHaveText('About')

  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByTestId('matched-route')).toHaveText('Home')
})
