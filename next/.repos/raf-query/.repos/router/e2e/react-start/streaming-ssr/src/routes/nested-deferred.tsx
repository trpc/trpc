import { Await, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Suspense } from 'react'
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

function Level1Content({
  level2,
  level3,
}: {
  level2: Promise<{ level: number; timestamp: number }>
  level3: Promise<{ level: number; timestamp: number }>
}) {
  return (
    <div
      style={{
        marginLeft: '20px',
        borderLeft: '2px solid #ccc',
        paddingLeft: '10px',
      }}
    >
      <Suspense
        fallback={<div data-testid="level2-loading">Loading level 2...</div>}
      >
        <Await
          promise={level2}
          children={(data) => (
            <div data-testid="level2-data">
              Level 2: {data.level} @ {data.timestamp}
              <Level2Content level3={level3} />
            </div>
          )}
        />
      </Suspense>
    </div>
  )
}

function Level2Content({
  level3,
}: {
  level3: Promise<{ level: number; timestamp: number }>
}) {
  return (
    <div
      style={{
        marginLeft: '20px',
        borderLeft: '2px solid #999',
        paddingLeft: '10px',
      }}
    >
      <Suspense
        fallback={<div data-testid="level3-loading">Loading level 3...</div>}
      >
        <Await
          promise={level3}
          children={(data) => (
            <div data-testid="level3-data">
              Level 3: {data.level} @ {data.timestamp}
            </div>
          )}
        />
      </Suspense>
    </div>
  )
}

function NestedDeferred() {
  const { level1, level2, level3, plainDeferred } = Route.useLoaderData()

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
          promise={plainDeferred}
          children={(data) => <div data-testid="plain-deferred">{data}</div>}
        />
      </Suspense>

      <div style={{ marginTop: '20px' }}>
        <Suspense
          fallback={<div data-testid="level1-loading">Loading level 1...</div>}
        >
          <Await
            promise={level1}
            children={(data) => (
              <div data-testid="level1-data">
                Level 1: {data.level} @ {data.timestamp}
                <Level1Content level2={level2} level3={level3} />
              </div>
            )}
          />
        </Suspense>
      </div>
    </div>
  )
}
