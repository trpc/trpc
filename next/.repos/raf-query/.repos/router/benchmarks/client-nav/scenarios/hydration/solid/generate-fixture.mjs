import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { JSDOM } from 'jsdom'

if (process.env.NODE_ENV !== 'production') {
  throw new Error('Generate the hydration fixture in production mode')
}
const { renderFixture } = await import('./dist/server/server.js')
const html = await renderFixture()
const dom = new JSDOM(html)
try {
  const doc = dom.window.document
  const scriptElements = [...doc.querySelectorAll('script')]
  assert.ok(scriptElements.length > 0)
  assert.ok(scriptElements.every((script) => !script.src))
  const scripts = scriptElements.map((script) => script.textContent)
  assert.ok(scripts.some((script) => script.includes('$_TSR')))
  assert.ok(scripts.some((script) => script.includes('_$HY')))
  assert.ok(doc.documentElement.hasAttribute('data-hk'))
  assert.ok(doc.getElementById('hydration-content')?.hasAttribute('data-hk'))
  assert.ok(
    [...doc.querySelectorAll('a')].every((a) => a.hasAttribute('data-hk')),
  )
  await writeFile(
    new URL('./dist/fixture.json', import.meta.url),
    JSON.stringify({ html, scripts }),
  )
} finally {
  dom.window.close()
}
