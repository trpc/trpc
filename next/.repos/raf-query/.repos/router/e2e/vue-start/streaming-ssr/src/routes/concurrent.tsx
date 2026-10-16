import { Await, createFileRoute } from '@tanstack/vue-router'
import { Suspense } from 'vue'
import { createConcurrentLoaderData } from '../../../../streaming-ssr-fixtures'

export const Route = createFileRoute('/concurrent')({
  loader: async () => createConcurrentLoaderData(),
  component: Concurrent,
})

function PromiseItem(props: { promise: Promise<string>; testId: string }) {
  return (
    <Suspense>
      {{
        default: () => (
          <Await
            promise={props.promise}
            children={(value: string) => (
              <div data-testid={props.testId}>{value}</div>
            )}
          />
        ),
        fallback: () => (
          <div data-testid={`${props.testId}-loading`}>Loading...</div>
        ),
      }}
    </Suspense>
  )
}

function Concurrent() {
  const data = Route.useLoaderData()

  return (
    <div style={{ padding: '20px' }}>
      <h2>Concurrent Resolution Test (15 promises in 3 batches)</h2>
      <p>Tests multiple promises resolving at the exact same instant.</p>
      <PromiseItem promise={data.value.concurrent1_1} testId="concurrent-1-1" />
      <PromiseItem promise={data.value.concurrent1_2} testId="concurrent-1-2" />
      <PromiseItem promise={data.value.concurrent1_3} testId="concurrent-1-3" />
      <PromiseItem promise={data.value.concurrent1_4} testId="concurrent-1-4" />
      <PromiseItem promise={data.value.concurrent1_5} testId="concurrent-1-5" />
      <PromiseItem promise={data.value.concurrent2_1} testId="concurrent-2-1" />
      <PromiseItem promise={data.value.concurrent2_2} testId="concurrent-2-2" />
      <PromiseItem promise={data.value.concurrent2_3} testId="concurrent-2-3" />
      <PromiseItem promise={data.value.concurrent2_4} testId="concurrent-2-4" />
      <PromiseItem promise={data.value.concurrent2_5} testId="concurrent-2-5" />
      <PromiseItem promise={data.value.concurrent3_1} testId="concurrent-3-1" />
      <PromiseItem promise={data.value.concurrent3_2} testId="concurrent-3-2" />
      <PromiseItem promise={data.value.concurrent3_3} testId="concurrent-3-3" />
      <PromiseItem promise={data.value.concurrent3_4} testId="concurrent-3-4" />
      <PromiseItem promise={data.value.concurrent3_5} testId="concurrent-3-5" />
    </div>
  )
}
