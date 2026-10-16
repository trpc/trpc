import { expect, test } from 'vitest'
import { hashLinkCount, ordinaryLinkCount } from './fixture'
import { setup } from './setup'

const turn = () => new Promise<void>((resolve) => setImmediate(resolve))

test('restores fresh DOMs and route state and completes hash-link reactivity', async () => {
  const scenario = setup({ countUpdates: true })
  let previous: ReturnType<typeof scenario.snapshot> | undefined
  for (let iteration = 0; iteration < 3; iteration++) {
    await scenario.before()
    try {
      const initial = scenario.snapshot()
      expect(initial.matches).toBeUndefined()
      expect(initial.diagnostics.mounted).toBe(false)
      expect(initial.diagnostics.rendered).toBe(0)
      expect(initial.diagnostics.clicks).toBe(0)
      expect(initial.diagnostics.ordinaryEvaluations).toBe(0)
      expect(initial.diagnostics.hashEvaluations).toBe(0)
      expect(initial.diagnostics.initialHashStates).toEqual([])
      await scenario.run()
      const completed = scenario.snapshot()
      expect(completed.diagnostics.ordinaryEvaluations).toBeGreaterThanOrEqual(
        ordinaryLinkCount,
      )
      expect(completed.diagnostics.initialHashStates).toEqual(
        Array.from({ length: hashLinkCount }, () => false),
      )
      expect(completed.diagnostics.hashStates).toEqual(
        Array.from({ length: hashLinkCount }, (_, index) => index % 2 === 0),
      )
      expect(completed.diagnostics.hashEvaluations).toBeGreaterThanOrEqual(
        hashLinkCount + hashLinkCount / 2,
      )
      expect(completed.hydrating).toBe(false)
      for (let index = 0; index < 4; index++) {
        await turn()
      }
      expect(scenario.snapshot()).toEqual(completed)
      if (previous) {
        expect(completed).toEqual(previous)
      }
      previous = completed
      await expect(scenario.run()).rejects.toThrow('newly prepared sample')
    } finally {
      // Untimed assertions include DOM identity, all restored data/context,
      // native event handling, and the absence of hydration diagnostics.
      await scenario.after()
    }
  }
})

test('installs per-iteration preparation for the ordinary Vitest runner', async () => {
  const scenario = setup()
  const task: Parameters<typeof scenario.installIterationHooks>[0] = {
    opts: {},
  }
  scenario.installIterationHooks(task)
  for (let iteration = 0; iteration < 2; iteration++) {
    await task.opts.beforeEach!()
    try {
      expect(scenario.snapshot().diagnostics.mounted).toBe(false)
      expect(scenario.snapshot().diagnostics.clicks).toBe(0)
      await scenario.run()
      expect(scenario.snapshot().diagnostics.hashEvaluations).toBe(0)
    } finally {
      await task.opts.afterEach!()
    }
  }
})

test('rejects an empty measurement and still releases its sample', async () => {
  const scenario = setup()
  await scenario.before()
  await expect(scenario.after()).rejects.toThrow(
    'Hydration sample was not completed',
  )
  await scenario.before()
  try {
    await expect(scenario.before()).rejects.toThrow('was not disposed')
    await scenario.run()
  } finally {
    await scenario.after()
  }
})
