import { mkdirSync, mkdtempSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function createStagingDirectory() {
  // SWC skips node_modules, leaving the emitted benchmark JavaScript intact.
  const root = fileURLToPath(new URL('./node_modules/.cache/', import.meta.url))
  mkdirSync(root, { recursive: true })
  return mkdtempSync(resolve(root, 'link-performance-'))
}
