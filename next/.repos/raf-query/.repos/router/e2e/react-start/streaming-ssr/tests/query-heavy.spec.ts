import '../../../streaming-ssr-specs/query-heavy'
import { expect, test } from '../../../streaming-ssr-assertions'

test('batches same-turn queries into one stream chunk', async ({ request }) => {
  const response = await request.get('/query-heavy')
  const html = await response.text()
  const scripts = Array.from(
    html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g),
    (match) => match[1]!,
  )
  const syncQueryChunk = scripts.find((script) =>
    script.includes('sync-value-1'),
  )

  expect(syncQueryChunk).toBeDefined()
  expect(syncQueryChunk).toContain('sync-value-2')
  expect(syncQueryChunk).toContain('sync-value-3')
})
