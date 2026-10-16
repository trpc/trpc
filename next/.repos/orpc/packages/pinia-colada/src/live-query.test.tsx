import type { UseQueryOptions } from '@pinia/colada'
import { PiniaColada, useQuery, useQueryCache } from '@pinia/colada'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent } from 'vue'
import { liveQuery } from './live-query'

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

describe('liveQuery', () => {
  it('publishes each chunk to the cache, replacing the previous value', async () => {
    const controller = createChunkController<number>()
    const mounted = mountQuery({
      key: ['live'],
      query: liveQuery(() => controller.stream()),
    })

    controller.push(1)
    await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual(1))
    expect(mounted.vm.query.asyncStatus.value).toEqual('loading')

    controller.push(2)
    await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual(2))
    expect(mounted.vm.query.asyncStatus.value).toEqual('loading')

    controller.close()
    await vi.waitFor(() => expect(mounted.vm.query.asyncStatus.value).toEqual('idle'))
    expect(mounted.vm.query.data.value).toEqual(2)
    expect(mounted.vm.query.status.value).toEqual('success')
    expect(mounted.vm.queryCache.getQueryData(['live'])).toEqual(2)
  })

  it('errors when the stream yields no chunks', async () => {
    const controller = createChunkController<number>()
    const mounted = mountQuery({
      key: ['live'],
      query: liveQuery(() => controller.stream()),
    })

    controller.close()

    await vi.waitFor(() => expect(mounted.vm.query.error.value).toBeInstanceOf(TypeError))
    expect((mounted.vm.query.error.value as any).message).toContain('did not yield any data')
    expect(mounted.vm.query.status.value).toEqual('error')
  })

  it('stops streaming when the query is cancelled', async () => {
    const controller = createChunkController<number>()
    const mounted = mountQuery({
      key: ['live'],
      query: liveQuery(() => controller.stream()),
    })

    controller.push(1)
    await vi.waitFor(() => expect(mounted.vm.query.data.value).toEqual(1))

    mounted.vm.queryCache.cancelQueries({ key: ['live'] }, new Error('__cancelled__'))
    controller.push(2) // resumes the stream loop, which now observes the aborted signal

    await vi.waitFor(() => expect(mounted.vm.query.asyncStatus.value).toEqual('idle'))
    expect(mounted.vm.query.data.value).toEqual(1)
    expect(mounted.vm.query.error.value).toBeNull()
  })
})
