import { Await, createFileRoute } from '@tanstack/vue-router'
import { createServerFn } from '@tanstack/vue-start'
import { Suspense } from 'vue'
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
    <div style={{ marginLeft: '20px', paddingLeft: '10px' }}>
      <Suspense>
        {{
          default: () => (
            <Await
              promise={props.level3}
              children={(value: { level: number; timestamp: number }) => (
                <div data-testid="level3-data">
                  Level 3: {value.level} @ {value.timestamp}
                </div>
              )}
            />
          ),
          fallback: () => (
            <div data-testid="level3-loading">Loading level 3...</div>
          ),
        }}
      </Suspense>
    </div>
  )
}

function Level1Content(props: {
  level2: Promise<{ level: number; timestamp: number }>
  level3: Promise<{ level: number; timestamp: number }>
}) {
  return (
    <div style={{ marginLeft: '20px', paddingLeft: '10px' }}>
      <Suspense>
        {{
          default: () => (
            <Await
              promise={props.level2}
              children={(value: { level: number; timestamp: number }) => (
                <div data-testid="level2-data">
                  Level 2: {value.level} @ {value.timestamp}
                  <Level2Content level3={props.level3} />
                </div>
              )}
            />
          ),
          fallback: () => (
            <div data-testid="level2-loading">Loading level 2...</div>
          ),
        }}
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
      <Suspense>
        {{
          default: () => (
            <Await
              promise={data.value.plainDeferred}
              children={(value: string) => (
                <div data-testid="plain-deferred">{value}</div>
              )}
            />
          ),
          fallback: () => (
            <div data-testid="plain-loading">Loading plain...</div>
          ),
        }}
      </Suspense>
      <div style={{ marginTop: '20px' }}>
        <Suspense>
          {{
            default: () => (
              <Await
                promise={data.value.level1}
                children={(value: { level: number; timestamp: number }) => (
                  <div data-testid="level1-data">
                    Level 1: {value.level} @ {value.timestamp}
                    <Level1Content
                      level2={data.value.level2}
                      level3={data.value.level3}
                    />
                  </div>
                )}
              />
            ),
            fallback: () => (
              <div data-testid="level1-loading">Loading level 1...</div>
            ),
          }}
        </Suspense>
      </div>
    </div>
  )
}
