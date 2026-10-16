import type { UseQueryOptions } from '@pinia/colada'
import { PiniaColada, useQuery, useQueryCache } from '@pinia/colada'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent } from 'vue'
import { serializableStreamedQuery } from './stream-query'

/**
 * Mounts a component that runs a real Pinia Colada `useQuery`,
 * so tests can observe exactly what users see.
 */
function mountQuery(options: UseQueryOptions<any, any, any>) {
  return mount(defineComponent({
    setup() {
      const queryCache = useQueryCache()
      const query = useQuery(options)

      return { query, queryCache }
    },
    render: () => null,
  }), {
    global: {
      plugins: [
        createPinia(),
        PiniaColada,
      ],
    },
  })
}

/**
 * An AsyncIterable whose chunks are pushed manually, so tests can assert
 * intermediate states deterministically while the stream is still open.
 */
function createChunkController<T>() {
  const buffer: ({ value: T } | { done: true })[] = []
  let notify: (() => void) | undefined

  return {
    async* stream() {
      while (true) {
        while (buffer.length === 0) {
          await new Promise<void>((resolve) => {
            notify = resolve
          })
        }

        const item = buffer.shift()!

        if ('done' in item) {
          return
        }

        yield item.value
      }
    },
    push(value: T) {
      buffer.push({ value })
      notify?.()
    },
    close() {
      buffer.push({ done: true })
      notify?.()
    },
  }
}

describe('serializableStreamedQuery', () => {
  it('publishes each chunk to the cache as it arrives on first fetch', async () => {
    const controller = createChunkController<number>()
    const mounted = mountQuery({
      key: ['stream'],
      query: serializableStreamedQuery(() => controller.stream()),
    })

    await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual([]))
    expect(mounted.vm.query.asyncStatus.value).toEqual('loading')

    controller.push(1)
    await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual([1]))
    expect(mounted.vm.query.asyncStatus.value).toEqual('loading')

    controller.push(2)
    await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual([1, 2]))

    controller.close()
    await vi.waitFor(() => expect(mounted.vm.query.asyncStatus.value).toEqual('idle'))
    expect(mounted.vm.query.data.value).toEqual([1, 2])
    expect(mounted.vm.query.status.value).toEqual('success')
    expect(mounted.vm.queryCache.getQueryData(['stream'])).toEqual([1, 2])
  })

  it('resets previous data to pending by default on refetch', async () => {
    const first = createChunkController<string>()
    const second = createChunkController<string>()

    let releaseSecond!: () => void
    const secondReady = new Promise<void>((resolve) => {
      releaseSecond = resolve
    })

    const queryFn = vi.fn()
      .mockImplementationOnce(() => first.stream())
      .mockImplementationOnce(async () => {
        await secondReady
        return second.stream()
      })

    const mounted = mountQuery({
      key: ['stream'],
      query: serializableStreamedQuery(queryFn),
    })

    first.push('old')
    first.close()
    await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual(['old']))

    const refetching = mounted.vm.query.refetch()

    // previous data is cleared and the query goes back to pending
    await vi.waitFor(() => expect(mounted.vm.query.status.value).toEqual('pending'))
    expect(mounted.vm.query.data.value).toBeUndefined()

    releaseSecond()
    await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual([]))

    second.push('a')
    await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual(['a']))
    expect(mounted.vm.query.asyncStatus.value).toEqual('loading')

    second.close()
    await refetching
    expect(mounted.vm.query.data.value).toEqual(['a'])
    expect(mounted.vm.query.asyncStatus.value).toEqual('idle')
  })

  it('appends to previous data with refetchMode=append', async () => {
    const first = createChunkController<string>()
    const second = createChunkController<string>()

    const queryFn = vi.fn()
      .mockImplementationOnce(() => first.stream())
      .mockImplementationOnce(() => second.stream())

    const mounted = mountQuery({
      key: ['stream'],
      query: serializableStreamedQuery(queryFn, { refetchMode: 'append' }),
    })

    first.push('old')
    first.close()
    await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual(['old']))

    const refetching = mounted.vm.query.refetch()

    second.push('a')
    // new chunks are appended to the previous data while the stream is open
    await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual(['old', 'a']))
    expect(mounted.vm.query.asyncStatus.value).toEqual('loading')

    second.close()
    await refetching
    expect(mounted.vm.query.data.value).toEqual(['old', 'a'])
  })

  it('buffers and replaces with refetchMode=replace', async () => {
    const first = createChunkController<string>()
    const second = createChunkController<string>()

    const queryFn = vi.fn()
      .mockImplementationOnce(() => first.stream())
      .mockImplementationOnce(() => second.stream())

    const mounted = mountQuery({
      key: ['stream'],
      query: serializableStreamedQuery(queryFn, { refetchMode: 'replace' }),
    })

    first.push('old')
    first.close()
    await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual(['old']))

    const refetching = mounted.vm.query.refetch()

    second.push('a')
    second.push('b')
    // previous data stays visible while the new stream is buffered
    await vi.waitFor(() => expect(mounted.vm.query.asyncStatus.value).toEqual('loading'))
    expect(mounted.vm.query.data.value).toEqual(['old'])

    second.close()
    await refetching
    expect(mounted.vm.query.data.value).toEqual(['a', 'b'])
  })

  it('updates the cache during stream on first fetch even with refetchMode=replace', async () => {
    const controller = createChunkController<string>()
    const mounted = mountQuery({
      key: ['stream'],
      query: serializableStreamedQuery(() => controller.stream(), { refetchMode: 'replace' }),
    })

    controller.push('a')
    await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual(['a']))
    expect(mounted.vm.query.asyncStatus.value).toEqual('loading')

    controller.close()
    await vi.waitFor(() => expect(mounted.vm.query.asyncStatus.value).toEqual('idle'))
    expect(mounted.vm.query.data.value).toEqual(['a'])
  })

  it('limits chunks with maxChunks', async () => {
    const first = createChunkController<string>()
    const second = createChunkController<string>()

    const queryFn = vi.fn()
      .mockImplementationOnce(() => first.stream())
      .mockImplementationOnce(() => second.stream())

    const mounted = mountQuery({
      key: ['stream'],
      query: serializableStreamedQuery(queryFn, { refetchMode: 'append', maxChunks: 2 }),
    })

    first.push('old1')
    first.push('old2')
    first.close()
    await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual(['old1', 'old2']))

    const refetching = mounted.vm.query.refetch()

    second.push('a')
    await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual(['old2', 'a']))

    second.push('b')
    await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual(['a', 'b']))

    second.close()
    await refetching
    expect(mounted.vm.query.data.value).toEqual(['a', 'b'])
  })

  it('stops streaming when the query is cancelled', async () => {
    const controller = createChunkController<string>()
    const mounted = mountQuery({
      key: ['stream'],
      query: serializableStreamedQuery(() => controller.stream()),
    })

    controller.push('a')
    await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual(['a']))

    mounted.vm.queryCache.cancelQueries({ key: ['stream'] }, new Error('__cancelled__'))
    controller.push('b') // resumes the stream loop, which now observes the aborted signal

    await vi.waitFor(() => expect(mounted.vm.query.asyncStatus.value).toEqual('idle'))
    expect(mounted.vm.query.data.value).toEqual(['a'])
    expect(mounted.vm.query.error.value).toBeNull()
  })
})
