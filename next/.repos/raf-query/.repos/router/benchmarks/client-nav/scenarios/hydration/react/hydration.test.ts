import { expect, test } from 'vitest'
import { hashLinkCount, ordinaryLinkCount } from './fixture'
import { setup } from './setup'
import { settleHydration } from './settle'

const turn = () => new Promise<void>((resolve) => setImmediate(resolve))

test('restores data and context into fresh DOMs and includes follow-up renders', async () => {
  const scenario = setup({ countRenders: true })
  const schedulerTasks = new Set<number>()
  for (let iteration = 0; iteration < 3; iteration++) {
    await scenario.before()
    try {
      expect(scenario.snapshot().diagnostics.mounted).toBe(false)
      expect(scenario.snapshot().matches).toBeUndefined()
      await scenario.run()
      schedulerTasks.add(scenario.schedulerTasks())
      const completed = scenario.snapshot()
      // Supports both main's extra Link update and the optimized snapshot.
      expect([ordinaryLinkCount, ordinaryLinkCount * 2]).toContain(
        completed.diagnostics.ordinaryRenders,
      )
      expect(completed.diagnostics.hashRenders).toBeGreaterThanOrEqual(
        hashLinkCount + hashLinkCount / 2,
      )
      for (let index = 0; index < 4; index++) {
        await turn()
      }
      expect(scenario.snapshot()).toEqual(completed)
      await expect(scenario.run()).rejects.toThrow('newly prepared sample')
    } finally {
      await scenario.after()
    }
  }
  // React yields on its pinned clock, never on wall time spent hydrating.
  expect(schedulerTasks.size).toBe(1)
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
      await scenario.run()
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
    await scenario.run()
  } finally {
    await scenario.after()
  }
})

test('waits for a commit and scheduler work lasting more than 100 turns', async () => {
  let committed = false
  const commit = (async () => {
    for (let index = 0; index < 150; index++) {
      await turn()
    }
    committed = true
  })()
  let remainingCallbacks = 150
  await settleHydration(
    commit,
    () => {
      expect(committed).toBe(true)
      return remainingCallbacks-- <= 0
    },
    () => 'delayed commit',
  )
  expect(remainingCallbacks).toBeLessThan(0)
})

test('retains a watchdog for a commit that never completes', async () => {
  await expect(
    settleHydration(
      new Promise<void>(() => {}),
      () => true,
      () => 'commit pending',
      10,
    ),
  ).rejects.toThrow('Hydration did not settle within 10ms: commit pending')
})

test('retains a watchdog when scheduler work never becomes idle', async () => {
  await expect(
    settleHydration(
      Promise.resolve(),
      () => false,
      () => 'callbacks pending',
      10,
    ),
  ).rejects.toThrow('Hydration did not settle within 10ms: callbacks pending')
})
