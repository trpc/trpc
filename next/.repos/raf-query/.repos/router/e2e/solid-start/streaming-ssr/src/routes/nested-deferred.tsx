import { Await, createFileRoute } from '@tanstack/solid-router'
import { createServerFn } from '@tanstack/solid-start'
import { Suspense } from 'solid-js'
import {
  delay,
  makeDeferred,
  makeLevelData,
  nestedLevelDelays,
  nestedPlainDelay,
  nestedPlainMessage,
} from '../../../../streaming-ssr-fixtures'

const getLevel1Data = createServerFn({ method: 'GET' }).handler(async () => {
  await delay(nestedLevelDelays[0])
  return makeLevelData(1)
})

const getLevel2Data = createServerFn({ method: 'GET' }).handler(async () => {
  await delay(nestedLevelDelays[1])
  return makeLevelData(2)
})

const getLevel3Data = createServerFn({ method: 'GET' }).handler(async () => {
  await delay(nestedLevelDelays[2])
  return makeLevelData(3)
})

export const Route = createFileRoute('/nested-deferred')({
  loader: async () => {
    return {
      level1: getLevel1Data(),
      level2: getLevel2Data(),
      level3: getLevel3Data(),
      plainDeferred: makeDeferred(nestedPlainMessage, nestedPlainDelay),
    }
  },
  component: NestedDeferred,
})

function Level2Content(props: {
  level3: Promise<{ level: number; timestamp: number }>
}) {
  return (
    <div style={{ 'margin-left': '20px', 'padding-left': '10px' }}>
      <Suspense
        fallback={<div data-testid="level3-loading">Loading level 3...</div>}
      >
        <Await
          promise={props.level3}
          children={(value) => (
            <div data-testid="level3-data">
              Level 3: {value.level} @ {value.timestamp}
            </div>
          )}
        />
      </Suspense>
    </div>
  )
}

function Level1Content(props: {
  level2: Promise<{ level: number; timestamp: number }>
  level3: Promise<{ level: number; timestamp: number }>
}) {
  return (
    <div style={{ 'margin-left': '20px', 'padding-left': '10px' }}>
      <Suspense
        fallback={<div data-testid="level2-loading">Loading level 2...</div>}
      >
        <Await
          promise={props.level2}
          children={(value) => (
            <div data-testid="level2-data">
              Level 2: {value.level} @ {value.timestamp}
              <Level2Content level3={props.level3} />
            </div>
          )}
        />
      </Suspense>
    </div>
  )
}

function NestedDeferred() {
  const data = Route.useLoaderData()

  return (
    <div style={{ padding: '20px' }}>
      <h2>Nested Deferred Test</h2>
      <p>
        Tests multiple nested deferred promises resolving at different times.
      </p>
      <Suspense
        fallback={<div data-testid="plain-loading">Loading plain...</div>}
      >
        <Await
          promise={data().plainDeferred}
          children={(value) => <div data-testid="plain-deferred">{value}</div>}
        />
      </Suspense>
      <div style={{ 'margin-top': '20px' }}>
        <Suspense
          fallback={<div data-testid="level1-loading">Loading level 1...</div>}
        >
          <Await
            promise={data().level1}
            children={(value) => (
              <div data-testid="level1-data">
                Level 1: {value.level} @ {value.timestamp}
                <Level1Content level2={data().level2} level3={data().level3} />
              </div>
            )}
          />
        </Suspense>
      </div>
    </div>
  )
}
