import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'
import { expect, test } from 'vitest'
import {
  captureBundledDevStyles,
  collectBundledDevStyles,
} from '../../src/vite/dev-server-plugin/dev-styles'

test('collects ordered static and dynamic CSS from a completed bundled graph', async () => {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), 'start-bundled-styles-')),
  )
  await Promise.all(
    Object.entries({
      'index.html': '<script type="module" src="/entry.js"></script>',
      'entry.js': "import './root.css'; import('./component.js')",
      'component.js':
        "import './component.module.css'; import './unused.css?inline'",
      'root.css': '@import "./base.css"; .root { color: red; }',
      'base.css': '.base { --base-marker: 1; }',
      'component.module.css': '.component { --component-marker: 1; }',
      'unused.css': '.unused { --unused-marker: 1; }',
    }).map(([file, code]) => writeFile(path.join(root, file), code)),
  )
  let snapshot: ReturnType<typeof captureBundledDevStyles> | undefined
  const completed = Promise.withResolvers<void>()
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    experimental: { bundledDev: true },
    build: { rolldownOptions: { experimental: { devMode: { lazy: false } } } },
    optimizeDeps: { noDiscovery: true },
    server: { port: 0 },
    plugins: [
      {
        name: 'capture-completed-styles',
        generateBundle() {
          if (!this.getModuleInfo(path.join(root, 'entry.js'))) {
            return
          }
          snapshot = captureBundledDevStyles(this, root)
          completed.resolve()
        },
      },
    ],
  })
  try {
    await server.listen()
    const address = server.httpServer!.address()
    if (!address || typeof address === 'string') {
      throw new Error('Expected the dev server to listen on a TCP port')
    }
    await fetch(`http://localhost:${address.port}/`)
    await completed.promise
    const css = collectBundledDevStyles(snapshot, [path.join(root, 'entry.js')])
    expect(css).toContain('/* /root.css */')
    expect(css).toContain('/* /component.module.css */')
    expect(css?.match(/--base-marker/g)).toHaveLength(1)
    expect(css).toContain('--component-marker')
    expect(css).not.toContain('--unused-marker')
    expect(css!.indexOf('/* /root.css */')).toBeLessThan(
      css!.indexOf('/* /component.module.css */'),
    )
    expect(
      collectBundledDevStyles(snapshot, [path.join(root, 'unknown.js')]),
    ).toBeUndefined()
  } finally {
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
}, 20_000)
