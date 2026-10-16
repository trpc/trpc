import { Await, createFileRoute } from '@tanstack/vue-router'
import { Suspense } from 'vue'
import { createManyPromises } from '../../../../streaming-ssr-fixtures'

export const Route = createFileRoute('/many-promises')({
  loader: async () => createManyPromises(),
  component: ManyPromises,
})

function PromiseItem(props: {
  promise: Promise<string>
  testId: string
  label: string
}) {
  return (
    <Suspense>
      {{
        default: () => (
          <Await
            promise={props.promise}
            children={(value: string) => (
              <div data-testid={props.testId}>
                {props.label}: {value}
              </div>
            )}
          />
        ),
        fallback: () => (
          <div data-testid={`${props.testId}-loading`}>
            Loading {props.label}...
          </div>
        ),
      }}
    </Suspense>
  )
}

function ManyPromises() {
  const data = Route.useLoaderData()

  return (
    <div style={{ padding: '20px' }}>
      <h2>Many Promises Test (15 deferred)</h2>
      <p>Tests streaming with many concurrent deferred promises.</p>
      <PromiseItem
        promise={data.value.immediate1}
        testId="immediate-1"
        label="Immediate 1"
      />
      <PromiseItem
        promise={data.value.immediate2}
        testId="immediate-2"
        label="Immediate 2"
      />
      <PromiseItem
        promise={data.value.immediate3}
        testId="immediate-3"
        label="Immediate 3"
      />
      <PromiseItem promise={data.value.fast1} testId="fast-1" label="Fast 1" />
      <PromiseItem promise={data.value.fast2} testId="fast-2" label="Fast 2" />
      <PromiseItem promise={data.value.fast3} testId="fast-3" label="Fast 3" />
      <PromiseItem promise={data.value.fast4} testId="fast-4" label="Fast 4" />
      <PromiseItem
        promise={data.value.medium1}
        testId="medium-1"
        label="Medium 1"
      />
      <PromiseItem
        promise={data.value.medium2}
        testId="medium-2"
        label="Medium 2"
      />
      <PromiseItem
        promise={data.value.medium3}
        testId="medium-3"
        label="Medium 3"
      />
      <PromiseItem promise={data.value.slow1} testId="slow-1" label="Slow 1" />
      <PromiseItem promise={data.value.slow2} testId="slow-2" label="Slow 2" />
      <PromiseItem promise={data.value.slow3} testId="slow-3" label="Slow 3" />
      <PromiseItem
        promise={data.value.verySlow1}
        testId="very-slow-1"
        label="Very Slow 1"
      />
      <PromiseItem
        promise={data.value.verySlow2}
        testId="very-slow-2"
        label="Very Slow 2"
      />
    </div>
  )
}
