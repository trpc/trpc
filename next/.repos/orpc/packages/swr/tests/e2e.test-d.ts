import { isDefinedError } from '@orpc/client'
import useSWR from 'swr'
import useSWRInfinite from 'swr/infinite'
import useSWRMutation from 'swr/mutation'
import useSWRSubscription from 'swr/subscription'
import { client, orpc } from './__shared__/orpc'

it('.call', () => {
  expectTypeOf(orpc.static.call).toEqualTypeOf(client.static)
})

it('useSWR', () => {
  const swr = useSWR(
    orpc.nested.static.key({ input: { input: 123 } }),
    orpc.static.fetcher(),
  )

  expectTypeOf(swr.data).toEqualTypeOf<{ output: string } | undefined>()

  // FIXME: this should be an error because invalid key
  useSWR(
    'invalid',
    orpc.static.fetcher(),
  )
})

it('useSWRMutation', () => {
  const mutation = useSWRMutation(
    orpc.nested.static.key({ input: { input: 123 } }),
    orpc.static.mutator(),
  )

  expectTypeOf<Parameters<typeof mutation.trigger>[0]>().toEqualTypeOf<{ input: number }>()
  expectTypeOf(mutation.data).toEqualTypeOf<{ output: string } | undefined>()
})

it('useSWRInfinite', () => {
  const swr = useSWRInfinite(
    index => orpc.nested.static.key({ input: { input: index + 1 } }),
    orpc.static.fetcher(),
  )

  expectTypeOf(swr.data).toEqualTypeOf<Array<{ output: string }> | undefined>()
})

it('useSWRSubscription with subscriber', () => {
  const subscription = useSWRSubscription(
    orpc.stream.key({ input: { input: 3 } }),
    orpc.stream.subscriber({ maxChunks: 2 }),
  )

  expectTypeOf(subscription.data).toEqualTypeOf<Array<{ output: string }> | undefined>()

  if (subscription.error && isDefinedError(subscription.error) && subscription.error.code === 'STREAM_ERROR') {
    expectTypeOf(subscription.error.data).toEqualTypeOf<{ stream: string }>()
  }

  useSWRSubscription(
    'invalid',
    // @ts-expect-error: invalid key
    orpc.stream.subscriber({ maxChunks: 2 }),
  )
})

it('useSWRSubscription with liveSubscriber', () => {
  const subscription = useSWRSubscription(
    orpc.stream.key({ input: { input: 3 } }),
    orpc.stream.liveSubscriber(),
  )

  expectTypeOf(subscription.data).toEqualTypeOf<{ output: string } | undefined>()

  if (subscription.error && isDefinedError(subscription.error) && subscription.error.code === 'STREAM_ERROR') {
    expectTypeOf(subscription.error.data).toEqualTypeOf<{ stream: string }>()
  }

  useSWRSubscription(
    'invalid',
    // @ts-expect-error: invalid key
    orpc.stream.liveSubscriber(),
  )
})
