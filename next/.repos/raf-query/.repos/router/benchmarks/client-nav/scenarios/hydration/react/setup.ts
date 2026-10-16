import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'
import { JSDOM, VirtualConsole } from 'jsdom'
import { clientUrl, hashLinkCount, ordinaryLinkCount } from './fixture'
import { settleHydration } from './settle'
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

// React's scheduler ends a time slice once performance.now() has advanced 5 ms.
// Under CodSpeed's CPU simulation the wall clock advances much further per
// instruction, by a runner-dependent factor, so real time turned identical
// samples into different numbers of yields, scheduler tasks and event-loop
// turns. With a frozen clock React yields only to paint after a commit, as on
// a fast host. 1 s is past React's initial 300 ms fallback throttle. Only the
// window's performance clock is pinned: Date.now(), which the Router uses for
// match timestamps, is unchanged.
const schedulerTime = 1_000

export function setup({ countRenders = false } = {}) {
  // Compile once, outside measurement. Evaluation below creates fresh objects
  // in each window's realm; neither the payload nor module state is reused.
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
        filename: `hydration-bootstrap-${index}.js`,
      }),
  )
  let current: Awaited<ReturnType<typeof prepare>> | undefined

  async function prepare() {
    const errors: Array<string> = []
    const virtualConsole = new VirtualConsole()
    virtualConsole.on('jsdomError', (error) => errors.push(String(error)))
    virtualConsole.on('error', (...args) =>
      errors.push(args.map(String).join(' ')),
    )
    const dom = new JSDOM(artifact.html, {
      url: `http://localhost${clientUrl}`,
      runScripts: 'outside-only',
      virtualConsole,
    })
    const immediates = new Set<NodeJS.Immediate>()
    const scheduler = { tasks: 0 }
    try {
      Object.assign(dom.window, {
        TextEncoder,
        TextDecoder,
        ReadableStream,
        WritableStream,
        TransformStream,
        // Let React's production scheduler use the same task-turn primitive as
        // the existing Node client benchmarks, without a real-delay timer.
        setImmediate(
          callback: (...args: Array<unknown>) => void,
          ...args: Array<unknown>
        ) {
          scheduler.tasks++
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
      dom.window.performance.now = () => schedulerTime
      const context = dom.getInternalVMContext()
      // jsdom has no layout/scroll implementation; only hydration CPU is measured.
      dom.window.HTMLElement.prototype.scrollIntoView = () => {}
      clientScript.runInContext(context)
      const app = (dom.window as unknown as { HydrationBenchmark: ClientApp })
        .HydrationBenchmark
      assert.equal(app.serverEnvironment, false)
      const anchors = Array.from(dom.window.document.querySelectorAll('a'))
      const scriptElements = Array.from(
        dom.window.document.querySelectorAll('script'),
      )
      const executingScript = { current: null as HTMLScriptElement | null }
      Object.defineProperty(dom.window.document, 'currentScript', {
        configurable: true,
        get: () => executingScript.current,
      })
      assert.equal(anchors.length, ordinaryLinkCount + hashLinkCount)
      const content = dom.window.document.getElementById('hydration-content')
      assert.ok(content)
      // Finish jsdom's initial document lifecycle before opening the measure.
      await turn()
      assert.equal(dom.window.document.readyState, 'complete')
      assert.equal(app.ready(), false)
      return {
        dom,
        context,
        app,
        anchors,
        content,
        scriptElements,
        executingScript,
        immediates,
        scheduler,
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
      // HTML parsing/module evaluation are already done. Payload execution,
      // router initialization/restoration and React hydration are measured.
      for (let index = 0; index < bootstrapScripts.length; index++) {
        // SSR bootstrap scripts remove their own script element after running.
        sample.executingScript.current = sample.scriptElements[index]!
        try {
          bootstrapScripts[index]!.runInContext(sample.context)
        } finally {
          sample.executingScript.current = null
        }
      }
      await settleHydration(
        sample.app.start(countRenders),
        () => sample.immediates.size === 0,
        () => {
          const progress = sample.app.snapshot()
          return JSON.stringify({
            diagnostics: progress.diagnostics,
            errors: [...sample.errors, ...progress.errors],
            restoredMatches: progress.matches?.length,
            pendingSchedulerCallbacks: sample.immediates.size,
          })
        },
      )
      if (sample.errors.length) {
        throw new Error(sample.errors.join('\n'))
      }
      assert.ok(
        sample.app.ready(),
        'Hydration committed without the expected active links',
      )
      sample.completed = true
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

  function schedulerTasks() {
    if (!current) {
      throw new Error('No hydration sample')
    }
    return current.scheduler.tasks
  }

  function validate() {
    assert.ok(current?.started)
    const { dom, anchors, content, errors } = current
    const doc = dom.window.document
    const result = snapshot()
    assert.deepEqual(errors, [])
    assert.deepEqual(result.errors, [])
    assert.equal(result.diagnostics.beforeLoads, 0)
    assert.equal(result.diagnostics.loaders, 0)
    assert.equal(result.diagnostics.mounted, true)
    assert.equal(result.location, clientUrl)
    assert.equal(result.matches?.length, 3)
    for (const match of result.matches) {
      assert.equal(match.status, 'success')
      assert.deepEqual(match.context.viewer, {
        id: 'viewer-3',
        name: 'Ada',
        role: 'editor',
      })
    }
    assert.deepEqual(result.matches[1]!.context.team, {
      id: 'team-7',
      member: 'viewer-3',
    })
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
    assert.equal(doc.getElementById('hydration-content'), content)
    assert.equal(doc.querySelectorAll('a').length, anchors.length)
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
      assert.equal(
        doc.getElementById(`hash-${index}`)?.getAttribute('data-status'),
        index % 2 === 0 ? 'active' : null,
      )
    }
    doc
      .getElementById('interactive')!
      .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    assert.equal(
      current.app.snapshot().diagnostics.clicks,
      result.diagnostics.clicks + 1,
    )
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
        // Unmount work and its scheduled effects stay outside the measure.
        await turn()
        await turn()
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
    schedulerTasks,
    // Vitest passes setup to the Tinybench Bench, where it runs once per
    // warmup/run stage. Install the Task's public per-iteration hooks there.
    installIterationHooks(task: TaskHooks) {
      task.opts.beforeEach = before
      task.opts.afterEach = after
    },
  }
}
