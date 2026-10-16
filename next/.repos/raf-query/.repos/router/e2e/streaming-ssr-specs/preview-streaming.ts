import {
  expectDeferredRouteResponseOrder,
  test,
} from '../streaming-ssr-assertions'

test.skip(
  process.env.MODE !== 'preview',
  'Only runs against vite preview: pnpm test:e2e:preview',
)

test('vite preview preserves deferred HTML order', async ({ baseURL }) => {
  await expectDeferredRouteResponseOrder(baseURL)
})
