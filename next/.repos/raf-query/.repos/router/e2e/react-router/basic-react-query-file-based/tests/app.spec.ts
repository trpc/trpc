import { expect } from '@playwright/test'
import { apiTest as test } from '@tanstack/router-e2e-utils'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('GetPosts with networking disabled', async ({ page, context }) => {
  await page.goto('about:blank')
  await context.setOffline(true)
  const { status, posts, post } = await page.evaluate(async () => {
    const response = await fetch('https://jsonplaceholder.typicode.com/posts')
    const posts = await response.json()
    const post = await fetch(
      'https://jsonplaceholder.typicode.com/posts/1',
    ).then((r) => r.json())
    return { status: response.status, posts, post }
  })
  expect(status).toBe(200)
  expect(posts.length).toBeGreaterThan(0)
  expect(post).toEqual(posts[0])
})

test('Navigating to a post page', async ({ page }) => {
  await page.getByRole('link', { name: 'Posts' }).click()
  await page.getByRole('link', { name: 'sunt aut facere repe' }).click()
  await expect(page.getByRole('heading')).toContainText('sunt aut facere')
})

test('Navigating nested layouts', async ({ page }) => {
  await page.getByRole('link', { name: 'Layout', exact: true }).click()

  await expect(page.locator('#app')).toContainText("I'm a layout")
  await expect(page.locator('#app')).toContainText("I'm a nested layout")

  await page.getByRole('link', { name: 'Layout A' }).click()
  await expect(page.locator('#app')).toContainText("I'm layout A!")

  await page.getByRole('link', { name: 'Layout B' }).click()
  await expect(page.locator('#app')).toContainText("I'm layout B!")
})

test('Navigating to a not-found route', async ({ page }) => {
  await page.getByRole('link', { name: 'This Route Does Not Exist' }).click()
  await expect(page.getByRole('paragraph')).toContainText(
    'This is the notFoundComponent configured on root route',
  )
  await page.getByRole('link', { name: 'Start Over' }).click()
  await expect(page.getByRole('heading')).toContainText('Welcome Home!')
})
