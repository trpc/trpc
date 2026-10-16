import { expect, test } from '@playwright/test'

test('server API receives canned users without a fixture listener', async ({
  request,
}) => {
  const response = await request.get('/api/users')
  expect(response.ok()).toBe(true)
  const users = await response.json()
  expect(users).toHaveLength(10)
  expect(users[0]).toMatchObject({ id: 1, name: 'Leanne Graham' })
})
