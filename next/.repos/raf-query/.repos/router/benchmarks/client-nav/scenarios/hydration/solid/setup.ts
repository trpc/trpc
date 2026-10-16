import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'
import { JSDOM, VirtualConsole } from 'jsdom'
import { clientUrl, hashLinkCount, ordinaryLinkCount } from './fixture'
import type { FixtureArtifact } from './fixture'
import type * as Client from './src/client'

type ClientApp = typeof Client
type TaskHooks = {
  opts: {
    beforeEach?: () => void | Promise<void>
    afterEach?: () => void | Promise<void>
  }
}

const turn = () => new Promise<void>((resolve) => setImmediate(resolve))
const maxSettleTurns = 100

export function setup({ countUpdates = false } = {}) {
  // Compile once, outside measurement; evaluate the entire production bundle
  // anew in every window, including Solid's module-level hydration state.
  const artifact: FixtureArtifact = JSON.parse(
    readFileSync(new URL('./dist/fixture.json', import.meta.url), 'utf8'),
  )
  const clientPath = new URL('./dist/client/client.js', import.meta.url)
  const clientScript = new Script(readFileSync(clientPath, 'utf8'), {
    filename: fileURLToPath(clientPath),
  })
  const bootstrapScripts = artifact.scripts.map(
    (source, index) =>
      new Script(source, {
        filename: `solid-hydration-bootstrap-${index}.js`,
      }),
  )
  let current: Awaited<ReturnType<typeof prepare>> | undefined

  async function prepare() {
    const errors: Array<string> = []
    const virtualConsole = new VirtualConsole()
    virtualConsole.on('jsdomError', (error) => errors.push(String(error)))
    for (const event of ['error', 'warn'] as const) {
      virtualConsole.on(event, (...args) =>
        errors.push(args.map(String).join(' ')),
      )
    }
    const dom = new JSDOM(artifact.html, {
      url: `http://localhost${clientUrl}`,
      runScripts: 'outside-only',
      virtualConsole,
    })
    const immediates = new Set<NodeJS.Immediate>()
    try {
      Object.assign(dom.window, {
        TextEncoder,
        TextDecoder,
        ReadableStream,
        WritableStream,
        TransformStream,
        setImmediate(
          callback: (...args: Array<unknown>) => void,
          ...args: Array<unknown>
        ) {
          const handle = setImmediate(() => {
            immediates.delete(handle)
            callback(...args)
          })
          immediates.add(handle)
          return handle
        },
        clearImmediate(handle: NodeJS.Immediate) {
          immediates.delete(handle)
          clearImmediate(handle)
        },
        fetch() {
          throw new Error('Hydration attempted a network request')
        },
        scrollTo() {},
      })
      dom.window.addEventListener('unhandledrejection', (event) => {
        errors.push(String(event.reason))
      })
      dom.window.HTMLElement.prototype.scrollIntoView = () => {}
      const context = dom.getInternalVMContext()
      clientScript.runInContext(context)
      const app = (dom.window as unknown as { HydrationBenchmark: ClientApp })
        .HydrationBenchmark
      assert.equal(app.serverEnvironment, false)
      assert.equal(app.solidServerEnvironment, false)
      const doc = dom.window.document
      const anchors = Array.from(doc.querySelectorAll('a'))
      const scriptElements = Array.from(doc.querySelectorAll('script'))
      assert.equal(scriptElements.length, bootstrapScripts.length)
      const executingScript = { current: null as HTMLScriptElement | null }
      Object.defineProperty(doc, 'currentScript', {
        configurable: true,
        get: () => executingScript.current,
      })
      assert.equal(anchors.length, ordinaryLinkCount + hashLinkCount)
      const content = doc.getElementById('hydration-content')
      assert.ok(content)
      assert.ok(content.hasAttribute('data-hk'))
      assert.ok(anchors.every((anchor) => anchor.hasAttribute('data-hk')))
      for (let index = 0; index < hashLinkCount; index++) {
        assert.equal(
          doc.getElementById(`hash-${index}`)?.getAttribute('data-status'),
          null,
        )
      }
      // Production Solid can fall back to templates for missing hydration keys.
      // Retain every workload element, not only the parent and the anchors.
      const elements = Array.from(content.querySelectorAll('*'))
      const documentElement = doc.documentElement
      await turn()
      assert.equal(doc.readyState, 'complete')
      assert.equal(app.ready(), false)
      assert.deepEqual(errors, [])
      return {
        dom,
        context,
        app,
        anchors,
        content,
        elements,
        documentElement,
        scriptElements,
        executingScript,
        immediates,
        errors,
        started: false,
        completed: false,
        failed: false,
      }
    } catch (error) {
      for (const handle of immediates) {
        clearImmediate(handle)
      }
      dom.window.close()
      throw error
    }
  }

  async function before() {
    if (current) {
      throw new Error('Previous hydration sample was not disposed')
    }
    current = await prepare()
  }

  async function run() {
    const sample = current
    if (!sample || sample.started) {
      throw new Error('Hydration requires a newly prepared sample')
    }
    sample.started = true
    try {
      // Parsing/evaluation are done. Execute both native Solid bootstrap and
      // Router payload, then create/restore the router and hydrate the DOM.
      for (let index = 0; index < bootstrapScripts.length; index++) {
        // Router scripts remove document.currentScript. Keep the original
        // script nodes and order, including Solid's bootstrap and markers.
        sample.executingScript.current = sample.scriptElements[index]!
        try {
          bootstrapScripts[index]!.runInContext(sample.context)
        } finally {
          sample.executingScript.current = null
        }
      }
      await sample.app.start(countUpdates)
      let idleTurns = 0
      for (let index = 0; index < maxSettleTurns; index++) {
        await turn()
        if (sample.errors.length) {
          throw new Error(sample.errors.join('\n'))
        }
        if (sample.app.ready() && sample.immediates.size === 0) {
          if (++idleTurns === 2) {
            sample.completed = true
            return
          }
        } else {
          idleTurns = 0
        }
      }
      throw new Error(
        `Hydration did not settle: ${JSON.stringify(sample.app.snapshot())}`,
      )
    } catch (error) {
      sample.failed = true
      throw error
    }
  }

  function snapshot() {
    if (!current) {
      throw new Error('No hydration sample')
    }
    // Normalize realm prototypes only for untimed assertions.
    return JSON.parse(JSON.stringify(current.app.snapshot())) as ReturnType<
      ClientApp['snapshot']
    >
  }

  function validate() {
    assert.ok(current?.started)
    const { dom, anchors, content, elements, documentElement, errors } = current
    const doc = dom.window.document
    const result = snapshot()
    assert.deepEqual(errors, [])
    assert.equal(result.diagnostics.beforeLoads, 0)
    assert.equal(result.diagnostics.loaders, 0)
    assert.equal(result.diagnostics.mounted, true)
    assert.ok(result.diagnostics.rendered > 0)
    assert.equal(result.hydrating, false)
    assert.equal(result.location, clientUrl)
    assert.equal(result.resolvedLocation, clientUrl)
    assert.equal(result.matches?.length, 3)
    for (const match of result.matches) {
      assert.equal(match.status, 'success')
      assert.deepEqual(match.context.viewer, {
        id: 'viewer-3',
        name: 'Ada',
        role: 'editor',
      })
    }
    const teamContext = { id: 'team-7', member: 'viewer-3' }
    assert.deepEqual(result.matches[1]!.context.team, teamContext)
    assert.deepEqual(result.matches[2]!.context.team, teamContext)
    assert.deepEqual(result.matches[2]!.context.permissions, { edit: true })
    assert.deepEqual(result.matches[1]!.loaderData, {
      title: 'Team team-7',
      categories: ['open', 'closed'],
    })
    const data = result.matches[2]!.loaderData as {
      owner: string
      selected: string
      rows: Array<{
        id: string
        label: string
        details: { score: number; open: boolean }
      }>
    }
    assert.equal(data.owner, 'viewer-3')
    assert.equal(data.selected, 'item-42')
    assert.equal(data.rows.length, ordinaryLinkCount)
    assert.equal(doc.documentElement, documentElement)
    assert.equal(doc.getElementById('hydration-content'), content)
    const hydratedElements = Array.from(content.querySelectorAll('*'))
    assert.equal(hydratedElements.length, elements.length)
    elements.forEach((element, index) => {
      assert.equal(hydratedElements[index], element)
    })
    assert.equal(doc.querySelectorAll('a').length, anchors.length)
    assert.equal(doc.title, 'Hydration benchmark')
    assert.equal(content.querySelector('h1')?.textContent, 'Team team-7')
    assert.equal(doc.getElementById('viewer')?.textContent, 'Ada')
    assert.equal(doc.getElementById('permission')?.textContent, 'Editable')
    for (const anchor of anchors) {
      assert.equal(doc.getElementById(anchor.id), anchor)
    }
    for (let index = 0; index < ordinaryLinkCount; index++) {
      const anchor = doc.getElementById(`ordinary-item-${index}`)!
      assert.equal(
        anchor.getAttribute('href'),
        `/teams/team-7/items/item-${index}?view=summary`,
      )
      assert.equal(anchor.textContent, `Item ${index}`)
      assert.equal(
        anchor.getAttribute('data-status'),
        index === 42 ? 'active' : null,
      )
      assert.deepEqual(data.rows[index], {
        id: `item-${index}`,
        label: `Item ${index}`,
        details: { score: index * 3, open: index % 2 === 0 },
      })
    }
    for (let index = 0; index < hashLinkCount; index++) {
      const anchor = doc.getElementById(`hash-${index}`)!
      assert.equal(
        anchor.getAttribute('data-status'),
        index % 2 === 0 ? 'active' : null,
      )
      assert.equal(
        anchor.getAttribute('href'),
        `/teams/team-7/items/item-42?view=summary#${index % 2 === 0 ? 'details' : 'other'}`,
      )
      assert.equal(anchor.textContent, `Section ${index}`)
    }
    assert.equal(result.diagnostics.clicks, 0)
    doc
      .getElementById('interactive')!
      .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    assert.equal(current.app.snapshot().diagnostics.clicks, 1)
    assert.deepEqual(errors, [])
  }

  async function after() {
    const sample = current
    if (!sample) {
      return
    }
    try {
      if (!sample.failed) {
        assert.ok(sample.completed, 'Hydration sample was not completed')
        validate()
      }
    } finally {
      current = undefined
      try {
        sample.app.dispose()
        await turn()
        await turn()
        if (!sample.failed) {
          assert.deepEqual(sample.errors, [])
        }
      } finally {
        for (const handle of sample.immediates) {
          clearImmediate(handle)
        }
        sample.dom.window.close()
      }
    }
  }

  return {
    before,
    run,
    after,
    snapshot,
    // Vitest's Bench setup runs once per warmup/run stage. Install Tinybench's
    // public Task hooks to prepare and dispose outside every measured call.
    installIterationHooks(task: TaskHooks) {
      task.opts.beforeEach = before
      task.opts.afterEach = after
    },
  }
}
