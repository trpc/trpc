import '../../../streaming-ssr-specs/sync-only'
import { expect, test } from '../../../streaming-ssr-assertions'

test('Vue renders an unwrapped document root', async ({ request }) => {
  const response = await request.get('/sync-only')
  expect(await response.text()).toMatch(/^<!DOCTYPE html><html(?:\s|>)/)
})
