import { JSDOM } from 'jsdom'
import { createScenarioSetup } from '../scenarios/harness'
import { ticksPerIteration } from '../scenarios/links/shared'
import { NAVIGATION_STATES, assertScenario, getSourceUrl } from './cases'
import type { LinkCaseId } from './cases'
import type * as ClientApp from './src/client'
import type * as SsrApp from './src/ssr'

export interface LinkScenario {
  setup: () => Promise<void>
  batch: () => Promise<void>
  check: () => void
  teardown: () => void
}

export const samplingOptions = {
  warmupIterations: 100,
  warmupTime: 1_000,
  time: 5_000,
  throws: true,
}

export function createClientScenario(
  app: typeof ClientApp,
  id: LinkCaseId,
): LinkScenario {
  let mounted: ReturnType<typeof app.mountTestApp> | undefined
  let container: HTMLElement | undefined
  let anchors: Array<Element> = []
  const test = createScenarioSetup({
    frameworkLabel: 'React',
    mount: (element, history) => {
      container = element
      mounted = app.mountTestApp(element, history, id)
      return mounted
    },
    initialUrl: getSourceUrl(id, 0),
    steps: NAVIGATION_STATES.map((state) => `go-state-${state}`),
    assertAfterStep: (index, element) => {
      assertScenario(id, NAVIGATION_STATES[index]!, element)
      if (!mounted) {
        throw new Error('Link benchmark app was not mounted')
      }
      mounted.assertStateUpdates()
    },
  })

  return {
    async setup() {
      await test.before()
      if (!container) {
        throw new Error('Link benchmark container was not created')
      }
      anchors = [...container.querySelectorAll('a[data-perf-link]')]
    },
    async batch() {
      for (let index = 0; index < ticksPerIteration; index++) {
        await test.tick()
      }
      await test.finishBatch()
    },
    check() {
      if (!container || !mounted) {
        throw new Error('Link benchmark app was not mounted')
      }
      assertScenario(id, 0, container)
      mounted.assertStateUpdates()
      if (mounted.router.history.length !== 1) {
        throw new Error('Link benchmark history must remain bounded')
      }
      const current = container.querySelectorAll('a[data-perf-link]')
      if (anchors.some((anchor, index) => current[index] !== anchor)) {
        throw new Error('Measured Links must stay mounted across navigations')
      }
    },
    teardown: test.after,
  }
}

export function createSsrScenario(
  app: typeof SsrApp,
  id: LinkCaseId,
): LinkScenario {
  let html = ''
  let state = 0
  function check() {
    const dom = new JSDOM(html)
    try {
      assertScenario(id, state, dom.window.document)
    } finally {
      dom.window.close()
    }
  }

  return {
    async setup() {
      for (const nextState of NAVIGATION_STATES) {
        state = nextState
        html = await app.renderScenario(id, state, true)
        check()
      }
    },
    async batch() {
      for (const nextState of NAVIGATION_STATES) {
        state = nextState
        html = await app.renderScenario(id, state)
      }
    },
    check,
    teardown() {
      html = ''
    },
  }
}
