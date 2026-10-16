import { Await, createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { createConcurrentLoaderData } from '../../../../streaming-ssr-fixtures'

export const Route = createFileRoute('/concurrent')({
  loader: async () => createConcurrentLoaderData(),
  component: Concurrent,
})

function PromiseItem({
  promise,
  testId,
}: {
  promise: Promise<string>
  testId: string
}) {
  return (
    <Suspense
      fallback={<div data-testid={`${testId}-loading`}>Loading...</div>}
    >
      <Await
        promise={promise}
        children={(data) => <div data-testid={testId}>{data}</div>}
      />
    </Suspense>
  )
}

function Concurrent() {
  const data = Route.useLoaderData()

  return (
    <div style={{ padding: '20px' }}>
      <h2>Concurrent Resolution Test (15 promises in 3 batches)</h2>
      <p>Tests multiple promises resolving at the exact same instant.</p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '20px',
        }}
      >
        <div>
          <h3>Batch 1 (100ms)</h3>
          <PromiseItem promise={data.concurrent1_1} testId="concurrent-1-1" />
          <PromiseItem promise={data.concurrent1_2} testId="concurrent-1-2" />
          <PromiseItem promise={data.concurrent1_3} testId="concurrent-1-3" />
          <PromiseItem promise={data.concurrent1_4} testId="concurrent-1-4" />
          <PromiseItem promise={data.concurrent1_5} testId="concurrent-1-5" />
        </div>

        <div>
          <h3>Batch 2 (200ms)</h3>
          <PromiseItem promise={data.concurrent2_1} testId="concurrent-2-1" />
          <PromiseItem promise={data.concurrent2_2} testId="concurrent-2-2" />
          <PromiseItem promise={data.concurrent2_3} testId="concurrent-2-3" />
          <PromiseItem promise={data.concurrent2_4} testId="concurrent-2-4" />
          <PromiseItem promise={data.concurrent2_5} testId="concurrent-2-5" />
        </div>

        <div>
          <h3>Batch 3 (300ms)</h3>
          <PromiseItem promise={data.concurrent3_1} testId="concurrent-3-1" />
          <PromiseItem promise={data.concurrent3_2} testId="concurrent-3-2" />
          <PromiseItem promise={data.concurrent3_3} testId="concurrent-3-3" />
          <PromiseItem promise={data.concurrent3_4} testId="concurrent-3-4" />
          <PromiseItem promise={data.concurrent3_5} testId="concurrent-3-5" />
        </div>
      </div>
    </div>
  )
}
