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
  const scriptElements = [...dom.window.document.querySelectorAll('script')]
  assert.ok(scriptElements.length > 0)
  assert.ok(scriptElements.every((script) => !script.src))
  const scripts = scriptElements.map((script) => script.textContent)
  assert.ok(scripts.some((script) => script.includes('$_TSR')))
  await writeFile(
    new URL('./dist/fixture.json', import.meta.url),
    JSON.stringify({ html, scripts }),
  )
} finally {
  dom.window.close()
}
