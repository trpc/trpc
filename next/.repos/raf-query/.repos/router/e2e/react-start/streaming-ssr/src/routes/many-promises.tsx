import { Await, createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { createManyPromises } from '../../../../streaming-ssr-fixtures'

export const Route = createFileRoute('/many-promises')({
  loader: async () => createManyPromises(),
  component: ManyPromises,
})

function PromiseItem({
  promise,
  testId,
  label,
}: {
  promise: Promise<string>
  testId: string
  label: string
}) {
  return (
    <Suspense
      fallback={<div data-testid={`${testId}-loading`}>Loading {label}...</div>}
    >
      <Await
        promise={promise}
        children={(data) => (
          <div data-testid={testId}>
            {label}: {data}
          </div>
        )}
      />
    </Suspense>
  )
}

function ManyPromises() {
  const data = Route.useLoaderData()

  return (
    <div style={{ padding: '20px' }}>
      <h2>Many Promises Test (15 deferred)</h2>
      <p>Tests streaming with many concurrent deferred promises.</p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px',
        }}
      >
        <div>
          <h3>Immediate (0-20ms)</h3>
          <PromiseItem
            promise={data.immediate1}
            testId="immediate-1"
            label="Immediate 1"
          />
          <PromiseItem
            promise={data.immediate2}
            testId="immediate-2"
            label="Immediate 2"
          />
          <PromiseItem
            promise={data.immediate3}
            testId="immediate-3"
            label="Immediate 3"
          />
        </div>

        <div>
          <h3>Fast (50-125ms)</h3>
          <PromiseItem promise={data.fast1} testId="fast-1" label="Fast 1" />
          <PromiseItem promise={data.fast2} testId="fast-2" label="Fast 2" />
          <PromiseItem promise={data.fast3} testId="fast-3" label="Fast 3" />
          <PromiseItem promise={data.fast4} testId="fast-4" label="Fast 4" />
        </div>

        <div>
          <h3>Medium (150-250ms)</h3>
          <PromiseItem
            promise={data.medium1}
            testId="medium-1"
            label="Medium 1"
          />
          <PromiseItem
            promise={data.medium2}
            testId="medium-2"
            label="Medium 2"
          />
          <PromiseItem
            promise={data.medium3}
            testId="medium-3"
            label="Medium 3"
          />
        </div>

        <div>
          <h3>Slow (300-500ms)</h3>
          <PromiseItem promise={data.slow1} testId="slow-1" label="Slow 1" />
          <PromiseItem promise={data.slow2} testId="slow-2" label="Slow 2" />
          <PromiseItem promise={data.slow3} testId="slow-3" label="Slow 3" />
        </div>

        <div>
          <h3>Very Slow (600-800ms)</h3>
          <PromiseItem
            promise={data.verySlow1}
            testId="very-slow-1"
            label="Very Slow 1"
          />
          <PromiseItem
            promise={data.verySlow2}
            testId="very-slow-2"
            label="Very Slow 2"
          />
        </div>
      </div>
    </div>
  )
}
