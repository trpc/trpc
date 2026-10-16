import { act, renderHook } from '@testing-library/react'
import useSWR, { mutate } from 'swr'
import useSWRInfinite from 'swr/infinite'
import useSWRMutation from 'swr/mutation'
import useSWRSubscription from 'swr/subscription'
import { orpc, streamHandler } from './__shared__/orpc'

beforeEach(async () => {
  vi.clearAllMocks()
  // Clear SWR's global cache to avoid carrying data between tests
  await mutate(() => true, undefined, { revalidate: false })
})

it('case: useSWR & mutate & useSWRMutation', async () => {
  const fetcher = vi.fn(orpc.static.fetcher())

  const { result } = renderHook(() => {
    const swr = useSWR(
      orpc.nested.static.key({ input: { input: 123 } }),
      fetcher,
    )
    const mutation = useSWRMutation(
      orpc.nested.static.key({ input: { input: 123 } }),
      orpc.static.mutator(),
    )

    return { swr, mutation }
  })

  expect(result.current.swr.isLoading).toBe(true)

  await act(async () => {
    await vi.waitFor(() => expect(result.current.swr.data).toEqual({ output: '123' }))
  })
  expect(fetcher).toHaveBeenCalledTimes(1)

  await act(async () => {
    await result.current.mutation.trigger({ input: 456 })
  })
  expect(fetcher).toHaveBeenCalledTimes(2)

  await act(async () => {
    await mutate(orpc.matcher())
  })
  expect(fetcher).toHaveBeenCalledTimes(3)

  await act(async () => {
    await mutate(orpc.nested.static.matcher({ input: { input: 123 }, strategy: 'exact' }))
  })
  expect(fetcher).toHaveBeenCalledTimes(4)

  await act(async () => {
    await mutate(orpc.stream.matcher())
  })
  // not matched - no invalidate happens
  expect(fetcher).toHaveBeenCalledTimes(4)
})

it('case: useSWRInfinite', async () => {
  const { result } = renderHook(() => {
    const swr = useSWRInfinite(
      index => orpc.nested.static.key({ input: { input: index + 1 } }),
      orpc.static.fetcher(),
    )

    return { swr }
  })

  expect(result.current.swr.isLoading).toBe(true)

  await act(async () => {
    await vi.waitFor(() => expect(result.current.swr.data).toEqual([{ output: '1' }]))
    result.current.swr.setSize(2)
  })

  await act(async () => {
    await vi.waitFor(() => expect(result.current.swr.data).toEqual([{ output: '1' }, { output: '2' }]))
    result.current.swr.setSize(3)
  })

  await act(async () => {
    await vi.waitFor(() => expect(result.current.swr.data).toEqual([{ output: '1' }, { output: '2' }, { output: '3' }]))
  })
})

it('case: useSWRSubscription & .subscriber', async () => {
  const { result } = renderHook(() => {
    const subscription = useSWRSubscription(
      orpc.stream.key({ input: { input: 3 } }),
      orpc.stream.subscriber({ maxChunks: 2 }),
    )

    return { subscription }
  })

  expect(result.current.subscription.data).toBeUndefined()

  await act(async () => {
    await vi.waitFor(() => expect(result.current.subscription.data).toEqual([{ output: '1' }, { output: '2' }]))
  })
})

it('case: useSWRSubscription & .subscriber refetchMode=replace', async () => {
  const first = renderHook(() => useSWRSubscription(
    orpc.stream.key({ input: { input: 3 } }),
    orpc.stream.subscriber({ refetchMode: 'replace' }),
  ))

  await act(async () => {
    await vi.waitFor(() => expect(first.result.current.data).toEqual([{ output: '0' }, { output: '1' }, { output: '2' }]))
  })

  first.unmount()

  streamHandler.mockImplementationOnce(async function* () {
    yield { output: '__replaced__' }
  })

  const second = renderHook(() => useSWRSubscription(
    orpc.stream.key({ input: { input: 3 } }),
    orpc.stream.subscriber({ refetchMode: 'replace' }),
  ))

  // previous data is preserved while the new stream is buffering
  expect(second.result.current.data).toEqual([{ output: '0' }, { output: '1' }, { output: '2' }])

  await act(async () => {
    // append mode would end with 4 events here, replace keeps only the new stream's events
    await vi.waitFor(() => expect(second.result.current.data).toEqual([{ output: '__replaced__' }]))
  })
})

it('case: useSWRSubscription & .liveSubscriber', async () => {
  const { result } = renderHook(() => {
    const subscription = useSWRSubscription(
      orpc.stream.key({ input: { input: 4 } }),
      orpc.stream.liveSubscriber(),
    )

    return { subscription }
  })

  expect(result.current.subscription.data).toBeUndefined()

  await act(async () => {
    await vi.waitFor(() => expect(result.current.subscription.data).toEqual({ output: '3' }))
  })
})
